"""Thin subprocess wrapper around the `mineru` CLI.

Design note (see study_session/session03.md and the plan doc for the full
reasoning): MinerU is driven as an external CLI/server, never imported as a
Python library. Its value -- stable page/block locators, automatic caching,
a persistent local model server, a documented JSON error envelope -- is a
CLI/server contract, not a documented Python API.

Two quirks discovered while spiking this against a real paper
(papers/0a011d54-tominaga2012.pdf), both handled here so callers never see
them:

1. `mineru ... --json` output can contain raw control characters inside
   embedded log fields, which breaks strict `json.loads`. We parse with
   `strict=False`.
2. Figure/chart blocks are not reported in a separate structured field --
   they show up inline in the markdown as
   `![Image block](doc:{id}/tier:{tier}/page:{n}/block:{m})` or
   `![Chart block](...)`. `extract_figure_locators` pulls these out with a
   regex; there is no other documented way to find them in `--json` output.
"""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

MINERU_BIN = "mineru"

# Matches: ![Image block](doc:f5aada3/tier:standard/page:2/block:10)
# and:     ![Chart block](doc:f5aada3/tier:standard/page:3/block:4)
_FIGURE_MARKDOWN_RE = re.compile(
    r"!\[(?:Image|Chart) block\]\((doc:[\w]+/tier:[\w]+/page:(\d+)/block:(\d+))\)"
)


class MineruError(RuntimeError):
    """Base class for errors surfaced via MinerU's `error.code` JSON envelope."""

    def __init__(self, code: str, message: str, envelope: dict[str, Any]):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message
        self.envelope = envelope
        self.retryable = bool(envelope.get("retryable"))


class ServerNotRunning(MineruError):
    pass


class QualityTierUnavailable(MineruError):
    pass


class ParseTimeout(MineruError):
    pass


class ParseFailed(MineruError):
    pass


class FileProblem(MineruError):
    """file_not_found / file_permission_denied / file_type_unsupported /
    file_encrypted / file_corrupted."""


_ERROR_CODE_TO_EXCEPTION: dict[str, type[MineruError]] = {
    "server_not_running": ServerNotRunning,
    "quality_tier_unavailable": QualityTierUnavailable,
    "no_engine": QualityTierUnavailable,
    "parse_timeout": ParseTimeout,
    "parse_failed": ParseFailed,
    "parse_oom": ParseFailed,
    "file_not_found": FileProblem,
    "file_permission_denied": FileProblem,
    "file_type_unsupported": FileProblem,
    "file_encrypted": FileProblem,
    "file_corrupted": FileProblem,
}


@dataclass
class FigureLocator:
    locator: str
    page: int
    block: int


@dataclass
class ParseResult:
    short_id: str
    tier: str
    page_range: str
    content_md: str
    figures: list[FigureLocator]


def _parse_json_output(stdout: str) -> dict[str, Any]:
    # strict=False: see module docstring, point 1.
    return json.loads(stdout, strict=False)


def _run_json(args: list[str]) -> dict[str, Any]:
    proc = subprocess.run(
        [MINERU_BIN, *args, "--json"],
        capture_output=True,
        text=True,
    )
    stdout = proc.stdout.strip()
    if not stdout:
        raise MineruError(
            "no_output",
            f"mineru produced no stdout (exit {proc.returncode}): {proc.stderr.strip()}",
            {},
        )
    data = _parse_json_output(stdout)
    if "error" in data:
        err = data["error"]
        code = err.get("code", "unknown_error")
        exc_cls = _ERROR_CODE_TO_EXCEPTION.get(code, MineruError)
        raise exc_cls(code, err.get("message", ""), err)
    return data


class MineruCLI:
    """Driver for the mineru CLI, scoped to what this pipeline needs."""

    def ensure_server_running(self) -> None:
        status = _run_json(["server", "status"])
        if not status.get("running"):
            subprocess.run([MINERU_BIN, "server", "start"], check=True, capture_output=True, text=True)

    def parse(self, pdf_path: Path, tier: str = "standard", pages: str = "all", limit: int = 30000) -> ParseResult:
        """Parse a full document, transparently following continuation until
        no `next_request` remains.

        Two distinct continuation styles were observed empirically against
        real papers and both must be handled:
        - within-page-range continuation: `next_request.after` is a content
          cursor, re-sent via `--after` with the *same* `--pages` value.
        - cross-batch continuation: MinerU internally batches `--pages all`
          into page windows for longer PDFs; when a window is exhausted,
          `next_request.after` is null but `next_request.page_range` names
          the next window (e.g. "5-9"), re-sent via a fresh `--pages` value.
        """
        content_parts: list[str] = []
        page_ranges_seen: list[str] = []
        short_id: str | None = None
        next_pages = pages
        after: str | None = None

        while True:
            args = ["parse", str(pdf_path), "--tier", tier, "--pages", next_pages, "--limit", str(limit)]
            if after is not None:
                args += ["--after", after]
            data = _run_json(args)

            content = data["content"]
            short_id = content["short_id"]
            for r in content["content_ranges"]:
                page_ranges_seen.append(r["page_range"])
            content_parts.append(content["content"])

            next_request = content.get("next_request")
            if not next_request:
                break
            after = next_request.get("after")
            if after is not None:
                continue  # same next_pages, resumed via --after cursor
            next_page_range = next_request.get("page_range")
            if next_page_range is None:
                raise MineruError(
                    "unhandled_continuation",
                    f"next_request has neither 'after' nor 'page_range': {next_request}",
                    {},
                )
            next_pages = next_page_range

        full_content = "".join(content_parts)
        first_page = page_ranges_seen[0].split("-")[0]
        last_page = page_ranges_seen[-1].split("-")[-1]
        page_range = f"{first_page}-{last_page}"
        figures = [
            FigureLocator(locator=m.group(1), page=int(m.group(2)), block=int(m.group(3)))
            for m in _FIGURE_MARKDOWN_RE.finditer(full_content)
        ]
        assert short_id is not None
        return ParseResult(short_id=short_id, tier=tier, page_range=page_range, content_md=full_content, figures=figures)

    def read_image(self, locator: str, output_path: Path) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        proc = subprocess.run(
            [MINERU_BIN, "read", locator, "--format", "image", "--output", str(output_path)],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            raise MineruError("read_image_failed", proc.stderr.strip() or proc.stdout.strip(), {})
        return output_path
