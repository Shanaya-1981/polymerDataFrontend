"""Where the server keeps finished extractions: one SQLite file,
<DATA_DIR>/polymerdata.db, through Python's own sqlite3.

Four tables, linked by their ids. The links are foreign keys, checked on every
connection, so a row can't point to one that doesn't exist:

    papers         a paper: its id (from its PDF's contents, as the parse step
                   names it) and the file name it first came under. Its PDF is
                   kept as <DATA_DIR>/papers/<id>.pdf.
    extractions    a finished job: its id, its paper, the file name and feature
                   names it was given (the names as a JSON list), when it
                   started (empty for jobs saved before the server noted it),
                   and whether it's "done" or "failed" (with why)
    points         a data point, the values measured together: its extraction,
                   its sample, and its place in the result
    point_values   one value of a data point: its feature, and the value as the
                   model gave it, a number or text. (SQL reserves "values".)

A feature the paper doesn't give for a data point has no row in point_values
and reads back as None. load_extraction() gives back the same dict the server
answered with before it saved the job, so GET /extract/<id> answers the same
after a restart.

Before this file, each finished job was a JSON file,
<DATA_DIR>/extractions/<id>.json. import_json() copies those in; the paper
they came from isn't known, so it's left empty.
"""

from __future__ import annotations

import json
import logging
import re
import sqlite3
from collections.abc import Iterator
from contextlib import closing, contextmanager
from pathlib import Path

log = logging.getLogger("extraction.store")

SCHEMA = """
CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS extractions (
    id TEXT PRIMARY KEY,
    paper_id TEXT REFERENCES papers (id),
    file_name TEXT NOT NULL,
    features TEXT NOT NULL,
    started REAL,
    status TEXT NOT NULL CHECK (status IN ('done', 'failed')),
    error TEXT
);
CREATE TABLE IF NOT EXISTS points (
    id INTEGER PRIMARY KEY,
    extraction_id TEXT NOT NULL REFERENCES extractions (id) ON DELETE CASCADE,
    sample TEXT NOT NULL,
    position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS points_of_extraction ON points (extraction_id, position);
-- value has no type, so SQLite keeps each one as the model gave it: a whole
-- number, a decimal or text.
CREATE TABLE IF NOT EXISTS point_values (
    point_id INTEGER NOT NULL REFERENCES points (id) ON DELETE CASCADE,
    feature TEXT NOT NULL,
    value NOT NULL,
    PRIMARY KEY (point_id, feature)
);
"""


@contextmanager
def _connect(db: Path) -> Iterator[sqlite3.Connection]:
    """A connection to `db`, which gets its tables if it's new. What the block
    writes is committed when it ends, or undone if it raises."""
    db.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(db, timeout=30)) as connection:
        connection.execute("PRAGMA foreign_keys = ON")  # SQLite's default is off, on each connection
        connection.executescript(SCHEMA)
        with connection:
            yield connection


def save_extraction(db: Path, job: str, record: dict, paper: str | None = None) -> None:
    """Keep a finished job. `record` is what the server answers for it: "status",
    "file", "features", "started", and "samples" or "error". `paper` is the
    paper's id, or None if it isn't known."""
    with _connect(db) as connection:
        if paper is not None:
            connection.execute("INSERT OR IGNORE INTO papers VALUES (?, ?)", (paper, record["file"]))
        connection.execute(
            "INSERT INTO extractions VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                job,
                paper,
                record["file"],
                json.dumps(record["features"], ensure_ascii=False),
                record.get("started"),
                record["status"],
                record.get("error"),
            ),
        )
        points = ((sample, point) for sample, sample_points in record.get("samples", {}).items() for point in sample_points)
        for position, (sample, point) in enumerate(points):
            point_id = connection.execute(
                "INSERT INTO points (extraction_id, sample, position) VALUES (?, ?, ?)", (job, sample, position)
            ).lastrowid
            connection.executemany(
                "INSERT INTO point_values VALUES (?, ?, ?)",
                [(point_id, feature, value) for feature, value in point.items() if value is not None],
            )


def load_extraction(db: Path, job: str) -> dict | None:
    """The finished job as save_extraction() was given it, or None if `db` doesn't have it."""
    if not db.exists():
        return None
    with _connect(db) as connection:
        row = connection.execute(
            "SELECT file_name, features, started, status, error FROM extractions WHERE id = ?", (job,)
        ).fetchone()
        if row is None:
            return None
        file_name, features, started, status, error = row
        features = json.loads(features)
        record = {"status": status, "file": file_name, "features": features}
        if started is not None:
            record["started"] = started
        if status == "failed":
            return {**record, "error": error}
        values: dict[int, dict] = {}
        for point_id, feature, value in connection.execute(
            "SELECT point_id, feature, value FROM point_values JOIN points ON points.id = point_id"
            " WHERE extraction_id = ?",
            (job,),
        ):
            values.setdefault(point_id, {})[feature] = value
        samples: dict[str, list[dict]] = {}
        for point_id, sample in connection.execute(
            "SELECT id, sample FROM points WHERE extraction_id = ? ORDER BY position", (job,)
        ):
            given = values.get(point_id, {})
            samples.setdefault(sample, []).append({feature: given.get(feature) for feature in features})
        return {**record, "samples": samples}


def import_json(db: Path, folder: Path) -> int:
    """Copy each finished job saved as `folder`/<id>.json into `db`, unless it's
    already there, and return how many were copied. The files are left as they
    are. A file that can't be read is logged and skipped."""
    copied = 0
    for file in sorted(folder.glob("*.json")) if folder.is_dir() else []:
        job = file.stem
        if not re.fullmatch(r"[0-9a-f]{32}", job) or load_extraction(db, job) is not None:
            continue
        try:
            save_extraction(db, job, json.loads(file.read_text(encoding="utf-8")))
        except (OSError, ValueError, KeyError, TypeError, sqlite3.Error) as e:
            log.warning("Couldn't copy %s into %s: %s", file, db, e)
            continue
        copied += 1
    return copied
