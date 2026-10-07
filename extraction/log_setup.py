"""Logging for the extraction pipeline (issue #14).

One line per event, to stdout and to logs/extraction.log (rotated at 5 MB,
three old files kept), each saying which job and step it belongs to:

    2026-10-06T23:51:04.123-07:00 INFO    job=07561dd6... step=parsing extraction.pipeline: MinerU parse done in 241.3 s

LOG_LEVEL -- DEBUG, INFO (the default), WARNING or ERROR -- sets the level,
from the environment or extraction/.env. Code logs to loggers under
"extraction" (extraction.api, extraction.pipeline). Everything logged inside
`job_context()` carries that job, and the step `set_step()` last named; a call
can also pass them itself as `extra={"job": ..., "step": ...}`. Lines outside a
job show job=- step=-.
"""

from __future__ import annotations

import logging
import os
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import TextIO

HERE = Path(__file__).resolve().parent
LOG_FILE = HERE / "logs" / "extraction.log"  # logs/ is gitignored
MAX_BYTES = 5 * 1024 * 1024
BACKUP_COUNT = 3
DEFAULT_LEVEL = "INFO"
FORMAT = "%(asctime)s %(levelname)-7s job=%(job)s step=%(step)s %(name)s: %(message)s"

_job: ContextVar[str] = ContextVar("extraction_job", default="-")
_step: ContextVar[str] = ContextVar("extraction_step", default="-")
_handlers: list[logging.Handler] = []  # the ones configure_logging() added, so it can replace them


@contextmanager
def job_context(job: str) -> Iterator[None]:
    """Tag everything logged inside with `job`, and with the step set_step() names."""
    job_token = _job.set(job)
    step_token = _step.set("-")
    try:
        yield
    finally:
        _step.reset(step_token)
        _job.reset(job_token)


def set_step(step: str) -> None:
    _step.set(step)


class _ContextFilter(logging.Filter):
    """Fills in `job` and `step` from the context, unless the call passed them as `extra`."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "job"):
            record.job = _job.get()
        if not hasattr(record, "step"):
            record.step = _step.get()
        return True


class _Formatter(logging.Formatter):
    """FORMAT, with an ISO 8601 local timestamp to the millisecond."""

    def formatTime(self, record: logging.LogRecord, datefmt: str | None = None) -> str:
        return datetime.fromtimestamp(record.created).astimezone().isoformat(timespec="milliseconds")


def resolve_level(value: str | None) -> tuple[int, str | None]:
    """The level LOG_LEVEL names, and a warning to log when it names none."""
    name = (value or DEFAULT_LEVEL).strip().upper()
    level = logging.getLevelName(name)
    if isinstance(level, int):
        return level, None
    return logging.getLevelName(DEFAULT_LEVEL), f"LOG_LEVEL={value!r} isn't a logging level; using {DEFAULT_LEVEL}"


def configure_logging(
    level: str | None = None,
    *,
    log_file: Path | None = LOG_FILE,
    stream: TextIO | None = None,
) -> logging.Logger:
    """Send the "extraction" loggers' lines to `stream` (stdout by default) and to
    `log_file` (None for no file). `level` overrides LOG_LEVEL. Safe to call
    again: it replaces the handlers it added before rather than doubling them."""
    logger = logging.getLogger("extraction")
    while _handlers:
        handler = _handlers.pop()
        logger.removeHandler(handler)
        handler.close()

    numeric, warning = resolve_level(level if level is not None else os.environ.get("LOG_LEVEL"))
    logger.setLevel(numeric)
    # Its lines are complete as they are: don't print them again through the root logger.
    logger.propagate = False

    handlers: list[logging.Handler] = [logging.StreamHandler(stream or sys.stdout)]
    if log_file is not None:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        handlers.append(
            RotatingFileHandler(log_file, maxBytes=MAX_BYTES, backupCount=BACKUP_COUNT, encoding="utf-8")
        )
    formatter = _Formatter(FORMAT)
    for handler in handlers:
        handler.setFormatter(formatter)
        handler.addFilter(_ContextFilter())
        logger.addHandler(handler)
        _handlers.append(handler)

    if warning:
        logger.warning(warning)
    return logger
