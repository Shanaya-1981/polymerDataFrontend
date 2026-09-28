"""Parse each benchmark paper in every parsing mode, side by side.

Modes compared:
    standard  MinerU's standard tier
    advanced  MinerU's advanced tier
    hybrid    advanced text + figure crops from *both* tiers

Layout produced (one self-contained folder per paper, so a paper can be
handed to someone else, or opened months later, without the rest of the
repo to make sense of it):

    experiments/tier_comparison/
        sample.json          <- pinned by select_sample.py
        comparison.csv       <- long: one row per (paper, mode)
        pairwise.csv         <- one row per (paper, mode pair)
        SUMMARY.md
        {paper}/
            {paper}.pdf
            number_diff.json
            standard/  advanced/  hybrid/   each: content.md, manifest.json, figures/

Methodology notes, each of which would otherwise quietly invalidate a
comparison:

1. `standard` and `advanced` are parsed with `force=True`. MinerU caches by
   file sha256, so without forcing, an already-seen PDF replays its cached
   result in ~0s and the timing column becomes fiction.
2. Their order alternates per paper (`first_tier` in the CSV). Parsing one
   tier leaves page-level state that measurably speeds up the other, so a
   fixed order would hand whichever runs second a systematic head start.
3. `hybrid` is *not* forced, and deliberately so. It is by definition the
   composition of the two parses just made, and re-forcing would repeat
   ~40 minutes of identical work to measure a duration that is already
   known to be their sum. It still runs through the real
   `parse_paper_hybrid` code path, reading both tiers back out of the cache
   this run just populated. Its reported `parse_seconds` is therefore the
   sum of the two forced parses (its true cost); `measured_seconds` records
   what the cache-backed composition actually took, so the distinction is
   visible rather than buried.
4. Per-paper error isolation: one bad paper must not discard the rest of a
   long run, so a failure becomes a row with a status, never an exception.

Resumable: a mode whose `manifest.json` exists is reused unless `--redo`.

Run from the project root (needs `mineru` on PATH):
    .venv/bin/python -m pipeline.experiments.run_tier_comparison
"""

from __future__ import annotations

import argparse
import csv
import json
import shutil
import traceback
from pathlib import Path

from pipeline.experiments.metrics import ContentMetrics, content_metrics, exclusive_numbers, text_similarity
from pipeline.experiments.select_sample import EXPERIMENT_ROOT, load_sample
from pipeline.parsing.manifest_schema import ParseManifest
from pipeline.parsing.parse_paper import parse_paper, parse_paper_hybrid

PAPERS_DIR = Path("papers")
COMPARISON_CSV = EXPERIMENT_ROOT / "comparison.csv"
PAIRWISE_CSV = EXPERIMENT_ROOT / "pairwise.csv"

TIERS = ("standard", "advanced")
MODES = ("standard", "advanced", "hybrid")
HYBRID_TEXT_TIER, HYBRID_FIGURE_TIER = "advanced", "standard"

# Long format rather than one wide row per paper: three modes x ~12 metrics
# would be a 40-column row that no one can read, and adding a fourth mode
# later would change every column name. The side-by-side view belongs in
# the report, which pivots this.
FIELDNAMES = [
    "paper_id", "filename", "year", "stratum", "pages", "mode", "status", "error",
    "first_tier", "parse_seconds", "measured_seconds", "wait_retries",
    "chars", "tables", "table_rows", "table_numbers", "chart_rows", "concat_cells",
    "figures", "figures_captioned", "display_formulas",
]
PAIRWISE_FIELDNAMES = [
    "paper_id", "stratum", "mode_a", "mode_b", "text_similarity",
    "numbers_only_in_a", "numbers_only_in_b",
]


def _page_count(page_range: str) -> int:
    start, _, end = page_range.partition("-")
    return int(end) - int(start) + 1


def _parse_mode(pdf_copy: Path, paper_dir: Path, mode: str, redo: bool,
                metrics_only: bool = False) -> ParseManifest:
    dest = paper_dir / mode
    manifest_path = dest / "manifest.json"
    if manifest_path.exists() and (metrics_only or not redo):
        print(f"      {mode:9s} reusing parse on disk", flush=True)
        return ParseManifest.model_validate_json(manifest_path.read_text())
    if metrics_only:
        raise FileNotFoundError(f"{manifest_path} missing -- run without --metrics-only first")

    if mode == "hybrid":
        manifest = parse_paper_hybrid(
            pdf_copy, text_tier=HYBRID_TEXT_TIER, figure_tier=HYBRID_FIGURE_TIER,
            dest_dir=dest, force=False,  # see module docstring point 3
        )
    else:
        manifest = parse_paper(pdf_copy, tier=mode, dest_dir=dest, force=True)
    print(f"      {mode:9s} {manifest.duration_seconds:6.1f}s  "
          f"{len(manifest.figures)} figs, {manifest.num_tables} tables", flush=True)
    return manifest


def _rows_for(paper: dict, manifests: dict[str, ParseManifest],
              mets: dict[str, ContentMetrics], first_tier: str) -> list[dict]:
    rows = []
    for mode in MODES:
        man, met = manifests[mode], mets[mode]
        measured = round(man.duration_seconds, 1)
        # See module docstring point 3.
        effective = (round(manifests["standard"].duration_seconds
                           + manifests["advanced"].duration_seconds, 1)
                     if mode == "hybrid" else measured)
        rows.append({
            "paper_id": paper["paper_id"], "filename": paper["filename"],
            "year": paper["year"], "stratum": paper["stratum"],
            "pages": _page_count(man.page_range), "mode": mode,
            "status": "ok", "error": "", "first_tier": first_tier,
            "parse_seconds": effective, "measured_seconds": measured,
            "wait_retries": man.wait_retries,
            "chars": met.chars, "tables": met.tables, "table_rows": met.table_rows,
            "table_numbers": met.table_numbers, "chart_rows": met.chart_rows,
            "concat_cells": met.concat_cells,
            "figures": len(man.figures),
            "figures_captioned": sum(1 for f in man.figures if f.caption),
            "display_formulas": met.display_formulas,
        })
    return rows


def _has_parses(paper: dict) -> bool:
    paper_dir = EXPERIMENT_ROOT / Path(paper["filename"]).stem
    return all((paper_dir / m / "manifest.json").exists() for m in MODES)


def run_paper(paper: dict, index: int, redo: bool, metrics_only: bool = False) -> tuple[list[dict], list[dict]]:
    filename = paper["filename"]
    paper_dir = EXPERIMENT_ROOT / Path(filename).stem
    paper_dir.mkdir(parents=True, exist_ok=True)

    pdf_copy = paper_dir / filename
    if not pdf_copy.exists():
        shutil.copy2(PAPERS_DIR / filename, pdf_copy)

    # Alternate which tier goes first (docstring point 2); hybrid must come
    # last because it composes the other two.
    order = TIERS if index % 2 == 0 else tuple(reversed(TIERS))

    manifests: dict[str, ParseManifest] = {}
    for mode in (*order, "hybrid"):
        manifests[mode] = _parse_mode(pdf_copy, paper_dir, mode, redo, metrics_only)

    markdown = {m: (paper_dir / m / manifests[m].content_md_path).read_text(encoding="utf-8") for m in MODES}
    mets = {m: content_metrics(markdown[m]) for m in MODES}

    rows = _rows_for(paper, manifests, mets, first_tier=order[0])

    pairs = [("standard", "advanced"), ("advanced", "hybrid"), ("standard", "hybrid")]
    pairwise = []
    for a, b in pairs:
        only_a, only_b = exclusive_numbers(mets[a], mets[b])
        pairwise.append({
            "paper_id": paper["paper_id"], "stratum": paper["stratum"],
            "mode_a": a, "mode_b": b,
            "text_similarity": text_similarity(markdown[a], markdown[b]),
            "numbers_only_in_a": len(only_a), "numbers_only_in_b": len(only_b),
        })

    only_std, only_adv = exclusive_numbers(mets["standard"], mets["advanced"])
    (paper_dir / "number_diff.json").write_text(
        json.dumps({
            "paper_id": paper["paper_id"],
            "note": "Decimal/scientific values in one tier's markdown but not the other's. "
                    "hybrid is omitted: its body text is advanced's by construction.",
            "only_in_standard": only_std, "only_in_advanced": only_adv,
        }, indent=2) + "\n")
    return rows, pairwise


def _write(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows({k: r.get(k, "") for k in fieldnames} for r in rows)


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m pipeline.experiments.run_tier_comparison")
    ap.add_argument("--redo", action="store_true", help="Re-parse modes that already have a manifest.json")
    ap.add_argument("--only", help="Run a single paper_id (for debugging)")
    ap.add_argument("--metrics-only", action="store_true",
                    help="Recompute the CSVs from parses already on disk, without running MinerU.")
    args = ap.parse_args()

    sample = load_sample()
    papers = [p for p in sample["papers"] if not args.only or p["paper_id"] == args.only]
    if not papers:
        raise SystemExit(f"No paper matching --only {args.only} in the pinned sample")

    rows: list[dict] = []
    pairwise: list[dict] = []
    n_failed = 0
    for i, paper in enumerate(papers):
        if args.metrics_only and not _has_parses(paper):
            print(f"[{i + 1}/{len(papers)}] {paper['filename']}: not parsed yet, skipping", flush=True)
            continue
        print(f"[{i + 1}/{len(papers)}] {paper['filename']} ({paper['stratum']}, {paper['year']})", flush=True)
        try:
            new_rows, new_pairs = run_paper(paper, i, args.redo, args.metrics_only)
            rows += new_rows
            pairwise += new_pairs
        except Exception as e:  # noqa: BLE001 -- see module docstring point 4
            print(f"      FAILED: {type(e).__name__}: {e}", flush=True)
            traceback.print_exc()
            n_failed += 1
            rows.append({"paper_id": paper["paper_id"], "filename": paper["filename"],
                         "year": paper["year"], "stratum": paper["stratum"],
                         "mode": "", "status": "failed", "error": f"{type(e).__name__}: {e}"})

        # Rewritten after each paper: a run this long must leave usable
        # partial results if it is interrupted.
        _write(COMPARISON_CSV, FIELDNAMES, rows)
        _write(PAIRWISE_CSV, PAIRWISE_FIELDNAMES, pairwise)

    n_papers = len({r["paper_id"] for r in rows})
    print(f"\nWrote {COMPARISON_CSV} and {PAIRWISE_CSV}: {n_papers} papers, {n_failed} failed")


if __name__ == "__main__":
    main()
