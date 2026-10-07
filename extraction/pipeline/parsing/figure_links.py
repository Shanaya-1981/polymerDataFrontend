"""Rewrite MinerU's figure markers so they point at something real.

MinerU emits a figure inline in the markdown as

    ![Chart block](doc:9c87b64/tier:standard/page:4/block:3)

That link target is a MinerU-internal locator. Nothing resolves it: not a
markdown viewer during manual QA, and not the LLM in Stage 2. The marker
therefore says "a chart was here" and stops -- it does not connect to the
PNG the pipeline cropped for that same block, even though the pipeline has
the mapping sitting in `manifest.json`.

Two rewrites fix that, and both are done from the manifest, so neither
needs a re-parse:

`rewrite_to_local_paths` (used when writing content.md) turns the marker
into a real relative image link with the caption as alt text, so content.md
renders standalone in any markdown viewer.

`rewrite_to_prompt_anchors` (used when building the LLM request) turns it
into an explicit anchor naming the attached image by the same key used in
that image's own label. The model gets the full text *and* the crops, and
the correspondence between "this spot in the text" and "that attached
image" is stated rather than left to be inferred from a locator string.

Both accept either form as input, so they are safe to apply to markdown
that has already been rewritten once.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

from pipeline.parsing.manifest_schema import FigureEntry

# The raw form MinerU produces.
_LOCATOR_MARKER_RE = re.compile(
    r"!\[(?:Image|Chart) block\]\((doc:[\w]+/tier:[\w]+/page:\d+/block:\d+)\)"
)
# The form `rewrite_to_local_paths` produces, so a second pass is a no-op
# rather than a corruption.
_LOCAL_MARKER_RE = re.compile(r"!\[[^\]]*\]\((figures/[^)]+\.png)\)")


def figure_key(fig: FigureEntry) -> str:
    """Stable short name for a crop, e.g. `page4-block3`.

    Derived from the image path rather than from page/block directly, so the
    hybrid layout's tier-namespaced paths (`figures/standard/page4-block3.png`
    -> `standard/page4-block3`) stay unambiguous when both tiers contribute a
    crop for the same page and block.
    """
    return fig.image_path.removeprefix("figures/").removesuffix(".png")


def _by_lookup_keys(figures: Iterable[FigureEntry]) -> dict[str, FigureEntry]:
    """Index figures by every string a marker might carry."""
    index: dict[str, FigureEntry] = {}
    for fig in figures:
        index[fig.locator] = fig
        index[fig.image_path] = fig
    return index


def _substitute(content_md: str, figures: Iterable[FigureEntry], render) -> str:
    index = _by_lookup_keys(figures)

    def replace(match: re.Match[str]) -> str:
        fig = index.get(match.group(1))
        # A marker with no manifest entry is left exactly as-is. That should
        # not happen (every marker is what produced the manifest in the first
        # place), but silently dropping a figure reference would be a much
        # worse failure than leaving one unrewritten.
        return render(fig) if fig is not None else match.group(0)

    for pattern in (_LOCATOR_MARKER_RE, _LOCAL_MARKER_RE):
        content_md = pattern.sub(replace, content_md)
    return content_md


def rewrite_to_local_paths(content_md: str, figures: Iterable[FigureEntry]) -> str:
    """`![Chart block](doc:...)` -> `![caption](figures/page4-block3.png)`."""

    def render(fig: FigureEntry) -> str:
        alt = (fig.caption or f"Figure {figure_key(fig)} (caption not found)").replace("]", ")")
        return f"![{alt}]({fig.image_path})"

    return _substitute(content_md, figures, render)


def prompt_anchor(fig: FigureEntry, attachment_number: int) -> str:
    """The anchor text used both inline in the prompt and as the image label.

    Identical in both places on purpose: that shared string is what lets the
    model tie a position in the text to one of the attached images.
    """
    return f"[FIGURE {figure_key(fig)} | attached image #{attachment_number}]"


def caption_anchor(fig: FigureEntry) -> str:
    """Anchor for a text-only request: marks where a figure was, no attachment."""
    return f"[FIGURE {figure_key(fig)} | image not provided]"


def rewrite_to_caption_anchors(content_md: str, figures: Iterable[FigureEntry]) -> str:
    """Text-only counterpart of `rewrite_to_prompt_anchors`.

    Keeps each figure's position and caption in the text but says the image
    is not provided. Reusing the with-images anchors here would point the
    model at `attached image #N` when nothing is attached.
    """

    def render(fig: FigureEntry) -> str:
        caption = fig.caption or "(caption not found)"
        return f'{caption_anchor(fig)} "{caption}"'

    return _substitute(content_md, figures, render)


def rewrite_to_prompt_anchors(content_md: str, figures: list[FigureEntry]) -> str:
    """Replace each marker with an anchor naming the attached image + caption.

    Attachment numbers follow the order the figures are attached in, which is
    manifest order -- the same list the caller enumerates when building the
    image blocks.
    """
    numbers = {id(fig): i for i, fig in enumerate(figures, 1)}

    def render(fig: FigureEntry) -> str:
        caption = fig.caption or "(caption not found)"
        return f'{prompt_anchor(fig, numbers[id(fig)])} "{caption}"'

    return _substitute(content_md, figures, render)
