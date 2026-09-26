"""Pydantic models for output/parsed/{paper_id}/manifest.json."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class FigureEntry(BaseModel):
    locator: str
    page: int
    block: int
    image_path: str  # relative to the paper's parsed directory
    caption: str | None = None  # best-effort, extracted from surrounding markdown text
    source_tier: str | None = None  # which tier's parse produced this crop (hybrid runs)


class ParseManifest(BaseModel):
    paper_id: str
    source_pdf: str
    mineru_doc_id: str
    tier: str  # "standard", "advanced", or "hybrid"
    # Set only on hybrid runs: which tier supplied the body text and which
    # supplied the figure crops. `advanced` converts many charts into tables
    # and then emits no crop for them, so taking text from `advanced` and
    # crops from `standard` keeps the digitised values *and* the original
    # plot image they were read off.
    text_tier: str | None = None
    figure_tier: str | None = None
    page_range: str
    figures: list[FigureEntry]
    content_md_path: str
    parsed_at: datetime
    duration_seconds: float
    wait_retries: int
    num_tables: int
