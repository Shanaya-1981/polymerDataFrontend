"""Score extraction outputs against the golden dataset.

Input: a run directory holding `{paper_id}/extraction.json` (the layout both
`output/extracted/` and each benchmark arm use). Output, written into that
directory:

    scores_cells.csv   one row per compared cell: what was expected, what
                       came back, and the outcome (see scoring.py)
    scores_papers.csv  one row per (paper, field group)
    scores.json        run-level totals, including formulation recall

Two accuracy numbers per field group, because they answer different
questions:

    accuracy   correct / golden-filled cells *in matched rows*: when the
               model finds a formulation, how right is it?
    recall     correct / golden-filled cells *in all golden rows*: how much
               of the golden data did the run recover? A missed formulation
               costs every one of its cells here.

Before trusting either, run the instrument checks:

    .venv/bin/python -m pipeline.evaluation.evaluate --self-test

They score the golden set against itself (must be 100%), against itself with
conductivities multiplied by ten (must fail exactly those cells), and score
the existing 4-paper hand-made fixture for a by-eye sanity check.

Usage:
    .venv/bin/python -m pipeline.evaluation.evaluate output/extracted
    .venv/bin/python -m pipeline.evaluation.evaluate experiments/local_llm/A-qwen3.5-4b
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import pandas as pd

from pipeline.evaluation.fields import GROUP_OF, GROUPS, HEADLINE_GROUPS
from pipeline.evaluation.mapping import golden_rows_for, load_golden, load_mapping
from pipeline.evaluation.normalize import is_blank
from pipeline.evaluation.rowmatch import match_rows
from pipeline.evaluation.scoring import compare_cell
from pipeline.schema_columns import REPORTED_COLUMNS

SCORED_COLUMNS = [c for c in REPORTED_COLUMNS if GROUP_OF[c] != "unscored"]
SCORED_GROUPS = [g for g in GROUPS if g != "unscored"]

CELL_FIELDS = ["paper_id", "gold_row", "pred_index", "match_quality", "column", "group", "gold", "pred", "outcome"]


def _records_from_frame(df: pd.DataFrame) -> list[dict[str, Any]]:
    return [{k: (None if is_blank(v) else v) for k, v in row.items()} for row in df.to_dict("records")]


def score_paper(paper_id: str, preds: list[dict[str, Any]], golds: list[dict[str, Any]]) -> tuple[list[dict], dict]:
    matches = match_rows(preds, golds)
    cells: list[dict] = []
    matched_gold = {m.gold_index for m in matches}

    for m in matches:
        pred, gold = preds[m.pred_index], golds[m.gold_index]
        for column in SCORED_COLUMNS:
            outcome = compare_cell(column, pred.get(column), gold.get(column))
            if outcome == "blank":
                continue
            cells.append(
                {
                    "paper_id": paper_id,
                    "gold_row": gold.get("Index"),
                    "pred_index": m.pred_index,
                    "match_quality": m.match_quality,
                    "column": column,
                    "group": GROUP_OF[column],
                    "gold": gold.get(column),
                    "pred": pred.get(column),
                    "outcome": outcome,
                }
            )
    # A missed formulation: every value the golden set has for it is missing.
    for j, gold in enumerate(golds):
        if j in matched_gold:
            continue
        for column in SCORED_COLUMNS:
            if not is_blank(gold.get(column)):
                cells.append(
                    {
                        "paper_id": paper_id,
                        "gold_row": gold.get("Index"),
                        "pred_index": None,
                        "match_quality": "unmatched",
                        "column": column,
                        "group": GROUP_OF[column],
                        "gold": gold.get(column),
                        "pred": None,
                        "outcome": "missing",
                    }
                )

    quality = Counter(m.match_quality for m in matches)
    summary = {
        "paper_id": paper_id,
        "gold_rows": len(golds),
        "pred_rows": len(preds),
        "matched": len(matches),
        "matched_direct": quality.get("direct", 0),
        "matched_rank": quality.get("rank", 0),
        "matched_anion_only": quality.get("anion_only", 0),
    }
    return cells, summary


def group_totals(cells: list[dict]) -> dict[str, dict[str, float]]:
    """Per field group: outcome counts, accuracy (matched rows) and recall (all rows)."""
    counts: dict[str, Counter] = defaultdict(Counter)
    for c in cells:
        key = "unmatched_missing" if c["match_quality"] == "unmatched" else c["outcome"]
        counts[c["group"]][key] += 1
    totals = {}
    for group in SCORED_GROUPS + ["HEADLINE"]:
        if group == "HEADLINE":
            n = sum((counts[g] for g in HEADLINE_GROUPS), Counter())
        else:
            n = counts[group]
        in_matched = n["correct"] + n["near"] + n["wrong"] + n["missing"]
        in_all = in_matched + n["unmatched_missing"]
        totals[group] = {
            "gold_cells_matched": in_matched,
            "gold_cells_all": in_all,
            "correct": n["correct"],
            "near": n["near"],
            "wrong": n["wrong"],
            "missing": n["missing"],
            "missing_unmatched_rows": n["unmatched_missing"],
            "extra": n["extra"],
            "accuracy": round(n["correct"] / in_matched, 4) if in_matched else None,
            "accuracy_loose": round((n["correct"] + n["near"]) / in_matched, 4) if in_matched else None,
            "recall": round(n["correct"] / in_all, 4) if in_all else None,
        }
    return totals


def _load_predictions(run_dir: Path, paper_id: str) -> tuple[list[dict[str, Any]], str]:
    path = run_dir / paper_id / "extraction.json"
    if not path.exists():
        return [], "no_extraction"
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("formulations", []), "ok"


def score_run(run_dir: Path, paper_ids: list[str] | None = None, write: bool = True) -> dict:
    mapping = load_mapping()
    golden = load_golden()
    paper_ids = paper_ids or list(mapping)

    all_cells: list[dict] = []
    papers: list[dict] = []
    paper_rows: list[dict] = []
    for pid in paper_ids:
        preds, status = _load_predictions(run_dir, pid)
        golds = _records_from_frame(golden_rows_for(pid, mapping, golden))
        cells, summary = score_paper(pid, preds, golds)
        summary["status"] = status
        all_cells.extend(cells)
        papers.append(summary)
        for group, t in group_totals(cells).items():
            paper_rows.append({"paper_id": pid, "status": status, "group": group, **t})

    gold_rows = sum(p["gold_rows"] for p in papers)
    pred_rows = sum(p["pred_rows"] for p in papers)
    matched = sum(p["matched"] for p in papers)
    result = {
        "run_dir": str(run_dir),
        "papers": len(papers),
        "papers_with_extraction": sum(p["status"] == "ok" for p in papers),
        "formulations": {
            "gold_rows": gold_rows,
            "pred_rows": pred_rows,
            "matched": matched,
            "matched_direct": sum(p["matched_direct"] for p in papers),
            "matched_rank": sum(p["matched_rank"] for p in papers),
            "matched_anion_only": sum(p["matched_anion_only"] for p in papers),
            "recall": round(matched / gold_rows, 4) if gold_rows else None,
            "precision": round(matched / pred_rows, 4) if pred_rows else None,
        },
        "groups": group_totals(all_cells),
        "per_paper": papers,
    }
    if write:
        with open(run_dir / "scores_cells.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=CELL_FIELDS)
            w.writeheader()
            w.writerows(all_cells)
        with open(run_dir / "scores_papers.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(paper_rows[0].keys()))
            w.writeheader()
            w.writerows(paper_rows)
        (run_dir / "scores.json").write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
    return result


def format_summary(result: dict) -> str:
    f = result["formulations"]
    lines = [
        f"{result['run_dir']}: {result['papers_with_extraction']}/{result['papers']} papers extracted",
        f"  formulations: matched {f['matched']}/{f['gold_rows']} golden (recall {f['recall']}), "
        f"{f['pred_rows']} predicted (precision {f['precision']}); "
        f"direct {f['matched_direct']}, rank {f['matched_rank']}, anion-only {f['matched_anion_only']}",
        f"  {'group':18s} {'accuracy':>9s} {'loose':>7s} {'recall':>7s}   cells(matched/all)  extra",
    ]
    for group, t in result["groups"].items():
        if not t["gold_cells_all"] and not t["extra"]:
            continue
        acc = "-" if t["accuracy"] is None else f"{t['accuracy']:.2f}"
        loose = "-" if t["accuracy_loose"] is None else f"{t['accuracy_loose']:.2f}"
        rec = "-" if t["recall"] is None else f"{t['recall']:.2f}"
        lines.append(
            f"  {group:18s} {acc:>9s} {loose:>7s} {rec:>7s}   {t['gold_cells_matched']:5d}/{t['gold_cells_all']:<5d}      {t['extra']:5d}"
        )
    return "\n".join(lines)


# --- instrument checks ---------------------------------------------------------


def _self_test() -> int:
    mapping = load_mapping()
    golden = load_golden()
    failures = []

    # 1. Golden against itself must be perfect.
    cells_all, n_gold, n_matched = [], 0, 0
    for pid in mapping:
        golds = _records_from_frame(golden_rows_for(pid, mapping, golden))
        cells, summary = score_paper(pid, golds, golds)
        cells_all += cells
        n_gold += summary["gold_rows"]
        n_matched += summary["matched"]
        wrong = [c for c in cells if c["outcome"] != "correct"]
        if summary["matched"] != summary["gold_rows"] or wrong:
            failures.append(f"golden-vs-golden {pid}: matched {summary['matched']}/{summary['gold_rows']}, "
                            f"{len(wrong)} non-correct cells, e.g. {wrong[:2]}")
    print(f"1. golden vs golden: {n_matched}/{n_gold} rows matched, "
          f"{sum(c['outcome'] == 'correct' for c in cells_all)}/{len(cells_all)} cells correct")

    # 2. Conductivities x10 must fail exactly the conductivity cells.
    bad_cond, bad_other, n_cond = 0, 0, 0
    for pid in mapping:
        golds = _records_from_frame(golden_rows_for(pid, mapping, golden))
        perturbed = [
            {k: (v * 10 if k.startswith("Conductivity at ") and v is not None else v) for k, v in g.items()}
            for g in golds
        ]
        cells, _ = score_paper(pid, perturbed, golds)
        for c in cells:
            if c["group"] == "conductivity":
                n_cond += 1
                bad_cond += c["outcome"] != "wrong"
            else:
                bad_other += c["outcome"] != "correct"
    print(f"2. conductivities x10: {n_cond - bad_cond}/{n_cond} conductivity cells scored wrong, "
          f"{bad_other} other cells disturbed")
    if bad_cond or bad_other or not n_cond:
        failures.append(f"x10 perturbation: {bad_cond} conductivity cells not wrong, {bad_other} other cells changed")

    # 3. The pre-existing hand-made 4-paper fixture, for a by-eye check.
    def _read(path: str) -> pd.DataFrame:
        try:
            return pd.read_csv(path, low_memory=False)
        except UnicodeDecodeError:
            return pd.read_csv(path, low_memory=False, encoding="latin-1")

    gold_fx, pred_fx = _read("data/ground_truth_matched_papers_data.csv"), _read("data/matched_papers_filled.csv")
    doi_key = lambda d: re.sub(r"^https?://(dx\.)?doi\.org/", "", str(d)).lower()  # noqa: E731
    gold_fx["_doi"], pred_fx["_doi"] = gold_fx["DOI"].map(doi_key), pred_fx["DOI"].map(doi_key)
    print("3. 4-paper fixture (predicted stand-in vs hand-made golden):")
    fx_cells = []
    for doi, gdf in gold_fx.groupby("_doi"):
        golds = _records_from_frame(gdf)
        preds = _records_from_frame(pred_fx[pred_fx["_doi"] == doi])
        cells, s = score_paper(doi, preds, golds)
        fx_cells += cells
        t = group_totals(cells)["HEADLINE"]
        print(f"   {doi:32s} gold {s['gold_rows']:2d} pred {s['pred_rows']:2d} matched {s['matched']:2d} "
              f"(direct {s['matched_direct']}, rank {s['matched_rank']})  headline accuracy {t['accuracy']}, recall {t['recall']}")

    if failures:
        print("\nSELF-TEST FAILED:")
        for f in failures:
            print("  -", f)
        return 1
    print("\nSelf-test checks 1 and 2 passed; check 3 is for eyeballing.")
    return 0


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m pipeline.evaluation.evaluate")
    ap.add_argument("run_dir", nargs="?", type=Path, help="Directory of {paper_id}/extraction.json")
    ap.add_argument("--self-test", action="store_true", help="Run the instrument checks and exit")
    args = ap.parse_args()
    if args.self_test:
        sys.exit(_self_test())
    if not args.run_dir:
        ap.error("run_dir is required unless --self-test")
    print(format_summary(score_run(args.run_dir)))


if __name__ == "__main__":
    main()
