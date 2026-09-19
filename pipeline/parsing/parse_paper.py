"""Orchestrate MinerU parsing for a single paper into output/parsed/{paper_id}/."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from pipeline.paper_id import paper_id_from_path
from pipeline.parsing.manifest_schema import FigureEntry, ParseManifest
from pipeline.parsing.mineru_cli import MineruCLI

OUTPUT_ROOT = Path("output/parsed")


def parse_paper(pdf_path: Path, tier: str = "standard", output_root: Path = OUTPUT_ROOT) -> ParseManifest:
    paper_id = paper_id_from_path(pdf_path)
    paper_dir = output_root / paper_id
    figures_dir = paper_dir / "figures"

    cli = MineruCLI()
    cli.ensure_server_running()
    result = cli.parse(pdf_path, tier=tier)

    figures: list[FigureEntry] = []
    for fig in result.figures:
        image_name = f"page{fig.page}-block{fig.block}.png"
        cli.read_image(fig.locator, figures_dir / image_name)
        figures.append(
            FigureEntry(
                locator=fig.locator,
                page=fig.page,
                block=fig.block,
                image_path=f"figures/{image_name}",
            )
        )

    content_md_path = paper_dir / "content.md"
    paper_dir.mkdir(parents=True, exist_ok=True)
    content_md_path.write_text(result.content_md, encoding="utf-8")

    manifest = ParseManifest(
        paper_id=paper_id,
        source_pdf=str(pdf_path),
        mineru_doc_id=result.short_id,
        tier=result.tier,
        page_range=result.page_range,
        figures=figures,
        content_md_path="content.md",
        parsed_at=datetime.now(timezone.utc),
    )
    (paper_dir / "manifest.json").write_text(manifest.model_dump_json(indent=2), encoding="utf-8")
    return manifest
