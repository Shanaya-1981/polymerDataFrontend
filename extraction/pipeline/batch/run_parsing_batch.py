"""Batch-parse every PDF in papers/, recording per-paper performance stats
into data/parsing_performance.csv for manual QA.

This is the parsing half of Milestone 5's full batch run -- it doesn't need
an ANTHROPIC_API_KEY, so it can run today; the extraction half gets added
once a key is available. One bad PDF must not abort the run, so every
per-paper failure is caught and recorded as a row, not raised. The CSV is
written incrementally (header first, one row appended per paper) so
progress is visible via `wc -l` without waiting for the full run.

Run from the project root:
    .venv/bin/python -m pipeline.batch.run_parsing_batch
"""

from __future__ import annotations

import csv
import re
from pathlib import Path

from pipeline.paper_id import paper_id_from_path
from pipeline.parsing.mineru_cli import MineruError
from pipeline.parsing.parse_paper import parse_paper_auto

PAPERS_DIR = Path("papers")
PARSED_ROOT = Path("output/parsed")
STATS_CSV = Path("data/parsing_performance.csv")

# Columns after `manual_` are intentionally left blank for human review --
# see study_session for the reasoning on what each measures and why.
FIELDNAMES = [
    "paper_id",
    "filename",
    "doi",
    "pdf_size_kb",
    "status",
    "error_code",
    "error_message",
    "page_count",
    "tier",
    # On a hybrid run `tier` is just "hybrid", which does not say which tier
    # supplied the prose and which supplied the crops. Recording both keeps
    # the QA dataset self-describing if the config changes later.
    "text_tier",
    "figure_tier",
    "num_figures_from_figure_tier",
    "parse_duration_seconds",
    "wait_retries",
    "num_figures",
    "num_figures_with_caption",
    "caption_hit_rate",
    "num_tables",
    "content_md_chars",
    "manual_data_extraction_accuracy_1to5",
    "manual_figure_extraction_accuracy_1to5",
    "manual_table_extraction_accuracy_1to5",
    "manual_notes",
]

# Only the handful of DOI-named files (see pipeline/paper_id.py docstring)
# encode a real DOI in the filename, e.g.
# "e1406878-10.1016@j.electacta.2016.12.172.pdf" -> rest starts with a DOI
# prefix ("10." followed by a 4+ digit registrant code). Author+year names
# like "tominaga2012" never match this shape, so this is a safe filter, not
# a guess. For the majority of papers this leaves `doi` blank -- filling
# those in requires the fuzzy author/year matching planned for Milestone 6
# (evaluation harness), not attempted here.
_DOI_FILENAME_RE = re.compile(r"^10\.\d{4,9}@")


def doi_from_filename(pdf_path: Path) -> str | None:
    paper_id = paper_id_from_path(pdf_path)
    rest = pdf_path.stem[len(paper_id) + 1 :]
    if _DOI_FILENAME_RE.match(rest):
        return "https://doi.org/" + rest.replace("@", "/")
    return None


def _page_count(page_range: str) -> int:
    start, _, end = page_range.partition("-")
    return int(end) - int(start) + 1


def _parse_one(pdf_path: Path) -> dict:
    row: dict = {
        "paper_id": paper_id_from_path(pdf_path),
        "filename": pdf_path.name,
        "doi": doi_from_filename(pdf_path) or "",
        "pdf_size_kb": round(pdf_path.stat().st_size / 1024, 1),
        "status": "ok",
        "error_code": "",
        "error_message": "",
    }
    try:
        manifest = parse_paper_auto(pdf_path)
    except MineruError as e:
        row["status"] = "failed"
        row["error_code"] = e.code
        row["error_message"] = e.message
        return row
    except Exception as e:  # noqa: BLE001 -- a batch run must never crash on one bad paper
        row["status"] = "failed"
        row["error_code"] = "unexpected_error"
        row["error_message"] = str(e)
        return row

    content_md = (PARSED_ROOT / manifest.paper_id / manifest.content_md_path).read_text(encoding="utf-8")
    page_count = _page_count(manifest.page_range)
    n_figs = len(manifest.figures)
    n_captioned = sum(1 for f in manifest.figures if f.caption)

    row.update(
        {
            "page_count": page_count,
            "tier": manifest.tier,
            "text_tier": manifest.text_tier or "",
            "figure_tier": manifest.figure_tier or "",
            "num_figures_from_figure_tier": sum(
                1 for f in manifest.figures if f.source_tier == manifest.figure_tier
            ),
            "parse_duration_seconds": round(manifest.duration_seconds, 1),
            "wait_retries": manifest.wait_retries,
            "num_figures": n_figs,
            "num_figures_with_caption": n_captioned,
            "caption_hit_rate": round(n_captioned / n_figs, 2) if n_figs else "",
            "num_tables": manifest.num_tables,
            "content_md_chars": len(content_md),
        }
    )
    return row


def run_batch(papers_dir: Path = PAPERS_DIR, out_csv: Path = STATS_CSV) -> None:
    pdf_paths = sorted(papers_dir.glob("*.pdf"))
    out_csv.parent.mkdir(parents=True, exist_ok=True)

    with open(out_csv, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        f.flush()

        n_ok = 0
        for i, pdf_path in enumerate(pdf_paths, 1):
            row = _parse_one(pdf_path)
            writer.writerow({k: row.get(k, "") for k in FIELDNAMES})
            f.flush()

            status_flag = "OK" if row["status"] == "ok" else f"FAILED ({row['error_code']})"
            n_ok += row["status"] == "ok"
            print(f"[{i}/{len(pdf_paths)}] {pdf_path.name}: {status_flag}", flush=True)

    print(f"\nWrote {out_csv}: {len(pdf_paths)} rows ({n_ok} ok, {len(pdf_paths) - n_ok} failed)")


if __name__ == "__main__":
    run_batch()
