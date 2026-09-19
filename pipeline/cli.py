"""Pipeline CLI.

Usage (from the project root, with the project .venv active):
    python -m pipeline.cli parse papers/0a011d54-tominaga2012.pdf
"""

from __future__ import annotations

import argparse
from pathlib import Path

from pipeline.extraction.run_extraction import extract_paper
from pipeline.parsing.parse_paper import parse_paper


def cmd_parse(args: argparse.Namespace) -> None:
    manifest = parse_paper(Path(args.pdf_path), tier=args.tier)
    print(f"Parsed {manifest.paper_id}: {len(manifest.figures)} figures, pages {manifest.page_range}")
    print(f"  -> output/parsed/{manifest.paper_id}/manifest.json")
    print(f"  -> output/parsed/{manifest.paper_id}/content.md")


def cmd_extract(args: argparse.Namespace) -> None:
    result = extract_paper(args.paper_id)
    print(f"Extracted {result.paper_id}: {len(result.formulations)} formulation(s)")
    print(f"  -> output/extracted/{result.paper_id}/extraction.json")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m pipeline.cli")
    subparsers = parser.add_subparsers(dest="command", required=True)

    parse_cmd = subparsers.add_parser("parse", help="Parse one PDF with MinerU")
    parse_cmd.add_argument("pdf_path")
    parse_cmd.add_argument("--tier", default="standard")
    parse_cmd.set_defaults(func=cmd_parse)

    extract_cmd = subparsers.add_parser("extract", help="Run LLM extraction on an already-parsed paper")
    extract_cmd.add_argument("paper_id")
    extract_cmd.set_defaults(func=cmd_extract)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
