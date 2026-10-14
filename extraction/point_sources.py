"""Where in the paper each extracted data point was read (issue #33).

The model names a source for every data point: a table or a figure, by the
name the paper gives it ("Table IV", "Figure 3"), or the text, with a short
quote. It also gives a page, but its page is only a fallback. The page is
looked up in the parse wherever it can be:

- a figure: the page MinerU recorded for the figure whose caption starts with
  that name (manifest.json), else the page its caption is on in content.md;
- a table: the page its caption is on in content.md ("Table IV" starting a line);
- text: the page the quote is on in content.md.

content.md marks where each page starts with a line `<!-- page 5 of 7 -->`, so
a position in it belongs to the last marker before it. Pages are the PDF's,
counted from 1, which can differ from the page numbers printed in a journal.

A source is a dict: "kind" ("table", "figure" or "text"), "label" (the
table's or figure's name, else None), "page" (an int, else None) and "quote"
(for text, else None).
"""

from __future__ import annotations

import re
from typing import Any

KINDS = ("table", "figure", "text")

_PAGE_MARKER = re.compile(r"<!--\s*page\s+(\d+)\s+of\s+(\d+)\s*-->", re.IGNORECASE)
_FIGURE = re.compile(r"\bfig(?:ure)?s?\.?\s*(\d+)", re.IGNORECASE)
_TABLE = re.compile(r"\btables?\.?\s*([A-Z]?\d+[a-z]?|[IVXLC]+)\b", re.IGNORECASE)


def schema() -> dict:
    """The JSON Schema for one source in the model's reply."""
    nullable = lambda kind: {"type": [kind, "null"]}  # noqa: E731
    return {
        "type": "object",
        "properties": {
            "kind": {"type": "string", "enum": list(KINDS)},
            "label": nullable("string"),
            "page": nullable("integer"),
            "quote": nullable("string"),
        },
        "required": ["kind", "label", "page", "quote"],
        "additionalProperties": False,
    }


class Pages:
    """Page lookups in one parsed paper: content.md and its figures' records."""

    def __init__(self, content_md: str, figures: list[Any] = ()):
        self.text = content_md
        self.markers = [(m.start(), int(m.group(1))) for m in _PAGE_MARKER.finditer(content_md)]
        totals = [int(m.group(2)) for m in _PAGE_MARKER.finditer(content_md)]
        self.count = max(totals) if totals else None
        # (caption, page) for each figure MinerU cropped.
        self.figures = [(getattr(f, "caption", None) or "", getattr(f, "page", None)) for f in figures]

    def page_at(self, position: int) -> int | None:
        """The page a position in content.md is on."""
        page = None
        for start, number in self.markers:
            if start > position:
                break
            page = number
        return page

    def caption_page(self, word: str, ident: str) -> int | None:
        """The page of the first line starting with e.g. "Table IV" or "Fig. 4"
        (after any markdown like "**" or "#"): its caption, not a mention in passing."""
        name = r"fig(?:ure)?s?\.?" if word == "figure" else r"tables?\.?"
        line = re.compile(rf"^[\W_]{{0,6}}{name}\s*{re.escape(ident)}(?![A-Za-z0-9])", re.IGNORECASE | re.MULTILINE)
        found = line.search(self.text)
        return self.page_at(found.start()) if found else None

    def figure_page(self, number: str) -> int | None:
        """The page MinerU recorded for figure `number`, from its caption."""
        start = re.compile(rf"^\s*fig(?:ure)?\.?\s*{re.escape(number)}(?!\d)", re.IGNORECASE)
        for caption, page in self.figures:
            if page is not None and start.match(caption):
                return int(page)
        return None

    def quote_page(self, quote: str) -> int | None:
        """The page a quote is on, ignoring case and spacing. A quote the parse
        spells differently (its math markup, say) is tried by its first words."""
        flat, offsets = _flatten(self.text)
        wanted = _flatten(quote)[0]
        for attempt in (wanted, " ".join(wanted.split()[:6])):
            if len(attempt) >= 12 and (at := flat.find(attempt)) >= 0:
                return self.page_at(offsets[at])
        return None

    def valid(self, page: Any) -> int | None:
        """The model's own page, if it's a page this paper has."""
        if isinstance(page, bool) or not isinstance(page, int) or page < 1:
            return None
        return page if self.count is None or page <= self.count else None


def _flatten(text: str) -> tuple[str, list[int]]:
    """`text` lowercased with each run of spaces as one, and where each kept
    character was in `text`."""
    chars, offsets, space = [], [], False
    for i, char in enumerate(text):
        if char.isspace():
            space = bool(chars)
            continue
        if space:
            chars.append(" ")
            offsets.append(i)
            space = False
        chars.append(char.lower())
        offsets.append(i)
    return "".join(chars), offsets


def resolve(raw: Any, pages: Pages | None) -> dict | None:
    """The model's source for one point, with its page looked up in the parse
    where possible. None when the model gave none, or none of the documented shape."""
    if not isinstance(raw, dict) or raw.get("kind") not in KINDS:
        return None
    label = raw.get("label") if isinstance(raw.get("label"), str) and raw["label"].strip() else None
    quote = raw.get("quote") if isinstance(raw.get("quote"), str) and raw["quote"].strip() else None
    source = {"kind": raw["kind"], "label": label and label.strip(), "page": None, "quote": quote and quote.strip()}
    if pages is None:  # the PDF was sent itself: the model's page is all there is
        page = raw.get("page")
        source["page"] = page if isinstance(page, int) and not isinstance(page, bool) and page >= 1 else None
        return source
    found = None
    # Go by what the label names, whichever kind the model chose: MinerU writes
    # a chart it read as a table, which the model may call either.
    if label and (m := _FIGURE.search(label)):
        found = pages.figure_page(m.group(1)) or pages.caption_page("figure", m.group(1))
    elif label and (m := _TABLE.search(label)):
        found = pages.caption_page("table", m.group(1))
    if found is None and quote:
        found = pages.quote_page(quote)
    source["page"] = found if found is not None else pages.valid(raw.get("page"))
    return source


def describe(source: dict | None) -> str:
    """A source as one line: "Table IV, page 12", "Figure 3, page 5",
    'Text, page 3: "…"'. Empty for none."""
    if not source:
        return ""
    name = source.get("label") or str(source.get("kind", "")).capitalize()
    where = f"{name}, page {source['page']}" if source.get("page") else name
    return f'{where}: "{source["quote"]}"' if source.get("kind") == "text" and source.get("quote") else where
