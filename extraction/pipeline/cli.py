"""Pipeline CLI.

Usage (from the project root, with the project .venv active):
    python -m pipeline.cli parse papers/0a011d54-tominaga2012.pdf
"""

from __future__ import annotations

import argparse
from pathlib import Path

from pipeline.extraction.run_extraction import extract_paper
from pipeline.config_loader import load_config
from pipeline.parsing.parse_paper import parse_paper, parse_paper_hybrid


def cmd_parse(args: argparse.Namespace) -> None:
    cfg = load_config()
    tier = args.tier or cfg.mineru_tier
    figure_tier = cfg.mineru_figure_tier if args.figure_tier is None else args.figure_tier
    if figure_tier in ("", "none", "None"):
        figure_tier = None

    if figure_tier and figure_tier != tier:
        manifest = parse_paper_hybrid(
            Path(args.pdf_path), text_tier=tier, figure_tier=figure_tier, force=args.force
        )
        print(f"Parsed {manifest.paper_id} (hybrid: {tier} text + {figure_tier} crops)")
    else:
        manifest = parse_paper(Path(args.pdf_path), tier=tier, force=args.force)
        print(f"Parsed {manifest.paper_id} ({tier})")
    print(f"  {len(manifest.figures)} figures, pages {manifest.page_range}, {manifest.num_tables} tables")
    print(f"  -> output/parsed/{manifest.paper_id}/manifest.json")
    print(f"  -> output/parsed/{manifest.paper_id}/content.md")


def cmd_extract(args: argparse.Namespace) -> None:
    result = extract_paper(args.paper_id, include_figures=args.figures)
    print(f"Extracted {result.paper_id}: {len(result.formulations)} formulation(s)")
    print(f"  -> output/extracted/{result.paper_id}/extraction.json")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m pipeline.cli")
    subparsers = parser.add_subparsers(dest="command", required=True)

    parse_cmd = subparsers.add_parser("parse", help="Parse one PDF with MinerU")
    parse_cmd.add_argument("pdf_path")
    parse_cmd.add_argument("--tier", default=None, help="Overrides pipeline/config/settings.yaml's mineru.tier")
    parse_cmd.add_argument(
        "--figure-tier",
        default=None,
        help="Overrides mineru.figure_tier: a second tier used only for figure crops. "
             "Pass 'none' to force a single-tier parse.",
    )
    parse_cmd.add_argument(
        "--force",
        action="store_true",
        help="Ignore MinerU's cache and re-parse. MinerU caches by file sha256, so without this a "
             "re-parse of an already-seen PDF replays the cached result in ~0s.",
    )
    parse_cmd.set_defaults(func=cmd_parse)

    extract_cmd = subparsers.add_parser("extract", help="Run LLM extraction on an already-parsed paper")
    extract_cmd.add_argument("paper_id")
    extract_cmd.add_argument(
        "--figures",
        action=argparse.BooleanOptionalAction,
        default=None,
        help="Attach figure crops (--figures) or send text and captions only (--no-figures). "
             "Overrides llm.include_figures in settings.yaml. Figures need a vision model, "
             "i.e. a llama-server started with --mmproj.",
    )
    extract_cmd.set_defaults(func=cmd_extract)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
