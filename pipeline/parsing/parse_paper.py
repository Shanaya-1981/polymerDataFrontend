"""Orchestrate MinerU parsing for a single paper into output/parsed/{paper_id}/."""

from __future__ import annotations

import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from pipeline.config_loader import load_config
from pipeline.paper_id import paper_id_from_path
from pipeline.parsing.figure_links import figure_key, rewrite_to_local_paths
from pipeline.parsing.md_cleanup import clean_markdown
from pipeline.parsing.manifest_schema import FigureEntry, ParseManifest
from pipeline.parsing.mineru_cli import MineruCLI

OUTPUT_ROOT = Path("output/parsed")

# A GFM table's header-separator row looks like "| --- | :--- | ---: |" --
# counting these rows counts tables (exactly one per table), which is more
# robust than counting lines starting with "|" (every row in every table
# starts with "|", not just one per table).
_TABLE_SEPARATOR_RE = re.compile(r"^\s*\|[\s:|-]+\|\s*$", re.MULTILINE)


def count_markdown_tables(content_md: str) -> int:
    return len(_TABLE_SEPARATOR_RE.findall(content_md))


def _crop_figures(
    cli: MineruCLI,
    mineru_figures: list,
    figures_dir: Path,
    subdir: str | None = None,
    source_tier: str | None = None,
) -> list[FigureEntry]:
    """Write one PNG per figure and return the manifest entries for them.

    `subdir` namespaces the crops by tier for hybrid runs: both tiers can
    report a figure at the same page and block, and their crops are *not*
    the same bytes (checked across 10 papers: 20 same-named pairs, 0
    byte-identical, some differing 3-4x in size because the tiers crop
    different regions). Writing both to `figures/page6-block12.png` would
    silently overwrite one with the other.
    """
    figures: list[FigureEntry] = []
    for fig in mineru_figures:
        image_name = f"page{fig.page}-block{fig.block}.png"
        rel = f"figures/{subdir}/{image_name}" if subdir else f"figures/{image_name}"
        cli.read_image(fig.locator, figures_dir.parent / rel)
        figures.append(
            FigureEntry(
                locator=fig.locator,
                page=fig.page,
                block=fig.block,
                image_path=rel,
                caption=fig.caption,
                source_tier=source_tier,
            )
        )
    return figures


def parse_paper(
    pdf_path: Path,
    tier: str | None = None,
    output_root: Path = OUTPUT_ROOT,
    dest_dir: Path | None = None,
    force: bool = False,
) -> ParseManifest:
    """Parse one PDF and write content.md + figures/ + manifest.json.

    `dest_dir` overrides the default `output_root/{paper_id}/` destination.
    The tier-comparison experiment needs two parses of the *same* paper to
    live side by side (`.../{paper}/standard/` and `.../{paper}/advanced/`),
    which the paper_id-keyed default layout cannot express -- the second
    parse would overwrite the first.

    `force` is passed through to MinerU's `--force` (ignore cache); see
    `MineruCLI.parse` for why an experiment that measures parse time needs
    it.
    """
    tier = tier or load_config().mineru_tier
    paper_id = paper_id_from_path(pdf_path)
    paper_dir = dest_dir if dest_dir is not None else output_root / paper_id
    figures_dir = paper_dir / "figures"

    cli = MineruCLI()
    cli.ensure_server_running()
    result = cli.parse(pdf_path, tier=tier, force=force)

    # A re-parse (e.g. after switching tiers) produces a different set of
    # block locators -- page{N}-block{M}.png filenames from the previous
    # run don't get overwritten, they just accumulate as orphaned files
    # alongside the new ones (found: 5 stale PNGs left over from an earlier
    # standard-tier run sitting next to 1 real advanced-tier figure, with
    # nothing in manifest.json pointing at them). Clear the directory
    # before writing this run's crops so figures/ always matches the
    # current manifest exactly.
    if figures_dir.exists():
        shutil.rmtree(figures_dir)

    figures = _crop_figures(cli, result.figures, figures_dir)

    # Point each figure marker at the crop that was just written, instead of
    # leaving MinerU's internal `doc:.../page:N/block:M` locator in place --
    # that locator resolves to nothing for a human reading content.md or for
    # the model in Stage 2. See pipeline/parsing/figure_links.py.
    content_md = rewrite_to_local_paths(result.content_md, figures)
    # Normalise the math markup as well: an escaped literal dollar in page
    # furniture silently turns the rest of a page into one runaway math
    # span, and a temperature is written 351 different ways across this
    # corpus, a few of them invalid LaTeX. See md_cleanup.py.
    content_md, _ = clean_markdown(content_md, load_config().recover_degree_as_zero)

    content_md_path = paper_dir / "content.md"
    paper_dir.mkdir(parents=True, exist_ok=True)
    content_md_path.write_text(content_md, encoding="utf-8")

    manifest = ParseManifest(
        paper_id=paper_id,
        source_pdf=str(pdf_path),
        mineru_doc_id=result.short_id,
        tier=result.tier,
        page_range=result.page_range,
        figures=figures,
        content_md_path="content.md",
        parsed_at=datetime.now(timezone.utc),
        duration_seconds=result.duration_seconds,
        wait_retries=result.wait_retries,
        num_tables=count_markdown_tables(result.content_md),
    )
    (paper_dir / "manifest.json").write_text(manifest.model_dump_json(indent=2), encoding="utf-8")
    return manifest


# Appended to content.md on hybrid runs, ahead of the second tier's crops.
# The model needs to be told where these came from: they have no anchor
# position in the body text, because the text tier turned those charts into
# tables and emitted no figure marker for them at all.
_FIGURE_APPENDIX_HEADER = """

## Figure crops from a second parse

The images below are crops of this same PDF produced by a second parser pass
({figure_tier} tier) that preserves charts as images. The body text above came
from the {text_tier} tier, which digitises many charts into tables instead --
so for several of these figures the numbers appear above as a table with `~`
values, and the image below is the original plot those values were read off.
Use the image to sanity-check any `~` value you rely on.
"""


def parse_paper_hybrid(
    pdf_path: Path,
    text_tier: str | None = None,
    figure_tier: str | None = None,
    output_root: Path = OUTPUT_ROOT,
    dest_dir: Path | None = None,
    force: bool = False,
) -> ParseManifest:
    """Parse one PDF twice and combine: text from one tier, crops from both.

    Why this exists, measured across the 10-paper benchmark sample: the
    `advanced` tier reads data points off plots and emits them as tables,
    and having done so it no longer emits a crop for that chart. It kept 33
    figures where `standard` kept 115 -- 82 crops discarded. On two papers
    (`6ca669ae`, `f3d2d4b6`) it emitted 311 and 62 rows of digitised chart
    data and *zero* figure crops, and a hand-check of `6ca669ae` found one
    246-row table whose axis was misread by a factor of ten. So the tier
    that produced the wrong numbers also discarded the only image that
    could have caught them.

    Taking text from `advanced` and crops from both tiers keeps the
    digitised values while leaving the original plot available to check
    them against. Cost is a second parse of each PDF -- local compute,
    wall-clock only.
    """
    cfg = load_config()
    text_tier = text_tier or cfg.mineru_tier
    figure_tier = figure_tier or cfg.mineru_figure_tier
    if not figure_tier or figure_tier == text_tier:
        raise ValueError(
            f"Hybrid parsing needs two different tiers; got text_tier={text_tier!r} "
            f"figure_tier={figure_tier!r}. Use parse_paper() for a single-tier parse."
        )

    paper_id = paper_id_from_path(pdf_path)
    paper_dir = dest_dir if dest_dir is not None else output_root / paper_id
    figures_dir = paper_dir / "figures"

    cli = MineruCLI()
    cli.ensure_server_running()
    text_result = cli.parse(pdf_path, tier=text_tier, force=force)
    figure_result = cli.parse(pdf_path, tier=figure_tier, force=force)

    # Same rationale as parse_paper: clear before writing so figures/ always
    # matches the manifest exactly and stale crops can't accumulate.
    if figures_dir.exists():
        shutil.rmtree(figures_dir)

    text_figures = _crop_figures(cli, text_result.figures, figures_dir, text_tier, text_tier)
    figure_figures = _crop_figures(cli, figure_result.figures, figures_dir, figure_tier, figure_tier)

    content_md = rewrite_to_local_paths(text_result.content_md, text_figures)
    if figure_figures:
        content_md += _FIGURE_APPENDIX_HEADER.format(text_tier=text_tier, figure_tier=figure_tier)
        for fig in sorted(figure_figures, key=lambda f: (f.page, f.block)):
            alt = (fig.caption or f"Figure {figure_key(fig)} (caption not found)").replace("]", ")")
            content_md += f"\n![{alt}]({fig.image_path})\n"

    content_md, _ = clean_markdown(content_md, cfg.recover_degree_as_zero)

    paper_dir.mkdir(parents=True, exist_ok=True)
    (paper_dir / "content.md").write_text(content_md, encoding="utf-8")

    manifest = ParseManifest(
        paper_id=paper_id,
        source_pdf=str(pdf_path),
        mineru_doc_id=text_result.short_id,
        tier="hybrid",
        text_tier=text_tier,
        figure_tier=figure_tier,
        page_range=text_result.page_range,
        figures=text_figures + figure_figures,
        content_md_path="content.md",
        parsed_at=datetime.now(timezone.utc),
        duration_seconds=text_result.duration_seconds + figure_result.duration_seconds,
        wait_retries=text_result.wait_retries + figure_result.wait_retries,
        num_tables=count_markdown_tables(content_md),
    )
    (paper_dir / "manifest.json").write_text(manifest.model_dump_json(indent=2), encoding="utf-8")
    return manifest


def parse_paper_auto(
    pdf_path: Path,
    output_root: Path = OUTPUT_ROOT,
    dest_dir: Path | None = None,
    force: bool = False,
) -> ParseManifest:
    """Parse per pipeline/config/settings.yaml -- hybrid or single-tier.

    Every production caller goes through here so that `mineru.figure_tier`
    is genuinely the switch it looks like. A config value that three call
    sites each ignore in favour of their own hardcoded default has bitten
    this pipeline once already.
    """
    cfg = load_config()
    if cfg.mineru_figure_tier and cfg.mineru_figure_tier != cfg.mineru_tier:
        return parse_paper_hybrid(
            pdf_path,
            text_tier=cfg.mineru_tier,
            figure_tier=cfg.mineru_figure_tier,
            output_root=output_root,
            dest_dir=dest_dir,
            force=force,
        )
    return parse_paper(pdf_path, tier=cfg.mineru_tier, output_root=output_root, dest_dir=dest_dir, force=force)
