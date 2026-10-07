"""Tests for the extraction server's progress reporting and logging.

Run from extraction/, with requirements.txt installed:

    python -m unittest discover -s tests -t .

None of them run MinerU or call a model: those are replaced with fakes.
"""

import logging

import log_setup


def reset_logging() -> None:
    """Undo configure_logging(), so one test's handlers don't leak into the next."""
    logger = logging.getLogger("extraction")
    while log_setup._handlers:
        handler = log_setup._handlers.pop()
        logger.removeHandler(handler)
        handler.close()
    logger.setLevel(logging.NOTSET)
    logger.propagate = True
