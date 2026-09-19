"""Pydantic models for output/parsed/{paper_id}/manifest.json."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class FigureEntry(BaseModel):
    locator: str
    page: int
    block: int
    image_path: str  # relative to the paper's parsed directory


class ParseManifest(BaseModel):
    paper_id: str
    source_pdf: str
    mineru_doc_id: str
    tier: str
    page_range: str
    figures: list[FigureEntry]
    content_md_path: str
    parsed_at: datetime
