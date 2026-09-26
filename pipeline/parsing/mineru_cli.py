"""Thin subprocess wrapper around the `mineru` CLI.

Design note (see study_session/session03.md and the plan doc for the full
reasoning): MinerU is driven as an external CLI/server, never imported as a
Python library. Its value -- stable page/block locators, automatic caching,
a persistent local model server, a documented JSON error envelope -- is a
CLI/server contract, not a documented Python API.

Quirks discovered while spiking this against real papers, all handled here
so callers never see them:

1. `mineru ... --json` output can contain raw control characters inside
   embedded log fields, which breaks strict `json.loads`. We parse with
   `strict=False`.
2. Figure/chart blocks are not reported in a separate structured field --
   they show up inline in the markdown as
   `![Image block](doc:{id}/tier:{tier}/page:{n}/block:{m})` or
   `![Chart block](...)`. `_FIGURE_MARKDOWN_RE` pulls these out with a
   regex; there is no other documented way to find them in `--json` output.
3. `standard`-tier parsing runs a `flash` pass and then a `standard` pass
   internally (visible in `mineru list parses --json`), which routinely
   takes longer than the CLI's own `--wait 60` default for anything beyond
   a handful of pages. The error code for this is `parse_wait_timeout`
   (not `parse_timeout`, which is what the mineru skill's own error-code
   table documents -- verified empirically by triggering it against 6
   different real papers, not assumed from docs). Critically, the parse
   job keeps running server-side after the CLI gives up waiting
   (`mineru list parses --json` shows it reaching `status: "done"` well
   after the CLI's `parse_wait_timeout` error) -- so re-issuing the same
   `parse` call with a longer `--wait` either catches the already-finished
   cached result immediately or waits for it, rather than starting over.
4. Figure captions are not attached to figure blocks in any structured
   field either. In every sampled paper, the caption text (a line starting
   "Figure N" / "Fig. N") appears somewhere in the markdown between one
   figure's image link and the next -- not always immediately after (body
   text or page furniture can sit in between) -- so
   `_extract_figures_with_captions` searches that whole span rather than
   just the next line. Without this, a cropped figure sent to the LLM in
   Stage 2 has no caption telling it what the figure actually shows.
"""

from __future__ import annotations

import json
import re
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

MINERU_BIN = "mineru"

# Matches: ![Image block](doc:f5aada3/tier:standard/page:2/block:10)
# and:     ![Chart block](doc:f5aada3/tier:standard/page:3/block:4)
_FIGURE_MARKDOWN_RE = re.compile(
    r"!\[(?:Image|Chart) block\]\((doc:[\w]+/tier:[\w]+/page:(\d+)/block:(\d+))\)"
)

# Matches a caption line like "Figure 3 Temperature dependence of ..." or
# "Fig. 2: DSC traces ..." or "Scheme 1. Synthetic routes of ...". Chemistry
# papers commonly caption structure/reaction diagrams as "Scheme N" rather
# than "Figure N" -- found by checking why a real polymer-structure diagram
# had no caption match despite an ample search window; it had one, just
# under a different label. Captures the whole line; does not attempt to
# stitch a wrapped second line onto the caption (simple heuristic -- may
# truncate long captions, revisit if that proves to matter in practice).
_CAPTION_RE = re.compile(r"(?im)^((?:fig(?:ure)?|scheme)\.?\s*\d+[.:]?\s+.+)$")


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


class ParseWaitTimeout(MineruError):
    """The CLI stopped waiting; the parse job itself is very likely still
    running server-side (or already finished) -- see module docstring
    point 3. Callers should retry with a longer --wait, not treat this as
    a hard failure."""


# Kept as an alias: the mineru skill's own docs call this `parse_timeout`,
# even though the real observed code is `parse_wait_timeout` (see below).
ParseTimeout = ParseWaitTimeout


class ParseFailed(MineruError):
    pass


class FileProblem(MineruError):
    """file_not_found / file_permission_denied / file_type_unsupported /
    file_encrypted / file_corrupted."""


_ERROR_CODE_TO_EXCEPTION: dict[str, type[MineruError]] = {
    "server_not_running": ServerNotRunning,
    "quality_tier_unavailable": QualityTierUnavailable,
    "no_engine": QualityTierUnavailable,
    "parse_timeout": ParseWaitTimeout,  # per the skill's docs; not observed in practice
    "parse_wait_timeout": ParseWaitTimeout,  # what mineru 4.0.4 actually returns
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
    caption: str | None = None


@dataclass
class ParseResult:
    short_id: str
    tier: str
    page_range: str
    content_md: str
    figures: list[FigureLocator]
    duration_seconds: float
    wait_retries: int


def _parse_json_output(stdout: str) -> dict[str, Any]:
    # strict=False: see module docstring, point 1.
    return json.loads(stdout, strict=False)


# How far past an image to search for its caption. Deliberately *not*
# bounded to "the next figure block": a multi-panel figure is often split
# into several consecutive image/chart blocks by MinerU (one per panel),
# with a single shared caption appearing only after the last panel -- so
# bounding the search to the immediately-next figure block left every
# panel but the last one with no caption at all (observed: 12 of 18
# figures in one real paper). Bounded instead by a character budget so a
# stray uncaptioned image near the end of a document doesn't pick up an
# unrelated caption from much later on. Widened from an initial 4000 to
# 8000 after the full 63-paper `advanced`-tier run: `advanced` tier keeps
# more surrounding body text (e.g. a full synthesis section) between a
# structure diagram and its "Scheme N" caption than `standard` tier did --
# measured a real case at 7406 chars, which the original 4000-char budget
# missed entirely.
_MAX_CAPTION_SEARCH_CHARS = 8000


def _extract_figures_with_captions(full_content: str) -> list[FigureLocator]:
    matches = list(_FIGURE_MARKDOWN_RE.finditer(full_content))
    figures = []
    for m in matches:
        span_start = m.end()
        span_end = min(span_start + _MAX_CAPTION_SEARCH_CHARS, len(full_content))
        following_text = full_content[span_start:span_end]
        caption_match = _CAPTION_RE.search(following_text)
        caption = caption_match.group(1).strip() if caption_match else None
        figures.append(
            FigureLocator(locator=m.group(1), page=int(m.group(2)), block=int(m.group(3)), caption=caption)
        )
    return figures


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

    def parse(
        self,
        pdf_path: Path,
        tier: str = "standard",
        pages: str = "all",
        limit: int = 30000,
        wait: int = 180,
        max_wait_retries: int = 2,
        force: bool = False,
    ) -> ParseResult:
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

        `wait` defaults well above the CLI's own 60s default: standard-tier
        parsing runs a flash pass then a standard pass internally, and
        anything beyond a handful of pages routinely exceeds 60s (see
        module docstring point 3). On `ParseWaitTimeout`, retries the exact
        same request with a longer `--wait` -- the job is still running
        server-side, so this catches the cached result rather than
        reparsing from scratch.

        `force=True` adds `--force` (ignore cache) to the *first* request
        only, and never to a wait-timeout retry. Both exclusions matter:

        - MinerU keys its parse cache on the file's sha256, not its path
          (verified in `mineru list parses --json`), so re-parsing a copy
          of an already-parsed PDF silently replays the cached result and
          reports a near-zero duration. Any experiment that measures parse
          time, or that wants a genuinely fresh parse, must force.
        - Continuation requests (`--after` / next `--pages`) are reads
          against the parse this call just produced. Forcing those would
          re-parse the whole document once per continuation.
        - Re-sending `--force` on a wait-timeout retry would discard the
          job that is still running server-side and start over, which is
          exactly what the retry logic above exists to avoid.
        """
        start_time = time.monotonic()
        total_wait_retries = 0
        first_request = True
        content_parts: list[str] = []
        page_ranges_seen: list[str] = []
        short_id: str | None = None
        next_pages = pages
        after: str | None = None

        while True:
            args = ["parse", str(pdf_path), "--tier", tier, "--pages", next_pages, "--limit", str(limit)]
            if after is not None:
                args += ["--after", after]

            current_wait = wait
            for attempt in range(max_wait_retries + 1):
                attempt_args = args + (["--force"] if force and first_request and attempt == 0 else [])
                try:
                    data = _run_json([*attempt_args, "--wait", str(current_wait)])
                    break
                except ParseWaitTimeout:
                    if attempt == max_wait_retries:
                        raise
                    total_wait_retries += 1
                    current_wait *= 2
            first_request = False

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
        figures = _extract_figures_with_captions(full_content)
        assert short_id is not None
        return ParseResult(
            short_id=short_id,
            tier=tier,
            page_range=page_range,
            content_md=full_content,
            figures=figures,
            duration_seconds=time.monotonic() - start_time,
            wait_retries=total_wait_retries,
        )

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
