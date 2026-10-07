"""The multi-call extraction (pipeline/extraction/multistage.py) on the pinned
10 papers, with Claude answering every call through util/claudeAPIMock.py's
ask_llm() instead of the local Qwen model that experiments/multistage/ used.

Per paper, as pipeline/experiments/run_multistage_benchmark.py does it:

1. one listing call: the formulations only, each quoting the paper, and only
   those whose quote is really in the paper are kept. Both layouts fill this
   same list.
2. both layouts' value calls, in alternating order from paper to paper:
   `per_group` (one call per field group) and `per_formulation` (one call per
   listed formulation).

Text only, like the original. Results go to
experiments/claude_code/multistage-<model>/, e.g. multistage-opus-5-5/:

    listing/<paper>/listing.json, calls.jsonl
    per_group/<paper>/extraction.json, calls.jsonl, run.json
    per_formulation/<paper>/extraction.json, calls.jsonl, run.json
    per_group/scores.json, per_formulation/scores.json (+ CSVs)

    .venv/bin/python experiments/claude_code/run_multistage.py --model claude-opus-5-5
    .venv/bin/python experiments/claude_code/run_multistage.py --model claude-opus-5-5 --only bdf71b01 --redo

A paper whose layouts both succeeded is skipped on a re-run (--redo forces).
Papers run 3 at a time; the calls within a paper run one after another.
calls.jsonl has no token counts: ask_llm() returns only the reply text.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from run import EXTRACTION, MODEL, sample_papers  # also puts the repo root and extraction/ on sys.path

from claude_code_client import ClaudeCodeClient  # noqa: E402
from pipeline.evaluation.evaluate import format_summary, score_run  # noqa: E402
from pipeline.extraction import multistage as ms  # noqa: E402
from pipeline.parsing.manifest_schema import ParseManifest  # noqa: E402

LAYOUTS = ("per_group", "per_formulation")


def _totals(records: list) -> dict:
    return {
        "calls": len(records),
        "failed_calls": sum(not r.ok for r in records),
        "wall_seconds": round(sum(r.wall_seconds or 0 for r in records), 1),
    }


def run_paper(pid: str, index: int, paper_dir: Path, root: Path, client: ClaudeCodeClient, redo: bool) -> None:
    manifest = ParseManifest.model_validate_json((paper_dir / "manifest.json").read_text())
    listing_dir = root / "listing" / pid
    listing_json = listing_dir / "listing.json"
    if listing_json.exists() and not redo:
        saved = json.loads(listing_json.read_text())
        listed, listing_totals = saved["formulations"], saved["totals"]
    else:
        print(f"{pid}: listing call started", flush=True)
        listed, record, stats = ms.run_listing(client, manifest, paper_dir)
        listing_dir.mkdir(parents=True, exist_ok=True)
        ms.save_calls(listing_dir / "calls.jsonl", [record])
        listing_totals = _totals([record])
        listing_json.write_text(json.dumps({"formulations": listed, "totals": listing_totals, "quote_check": stats,
                                            "errors": record.errors}, indent=2))
    print(f"{pid}: listing gave {len(listed)} formulations ({listing_totals['wall_seconds']} s)", flush=True)
    if not listed:
        for layout in LAYOUTS:
            out = root / layout / pid
            out.mkdir(parents=True, exist_ok=True)
            (out / "run.json").write_text(json.dumps({"paper_id": pid, "status": "failed", "error": "listing returned no formulations"}))
        return

    order = LAYOUTS if index % 2 == 0 else tuple(reversed(LAYOUTS))
    for layout in order:
        out = root / layout / pid
        if not redo and (out / "run.json").exists() and json.loads((out / "run.json").read_text()).get("status") == "ok":
            continue
        for stale in ("extraction.json", "calls.jsonl"):
            (out / stale).unlink(missing_ok=True)
        run = {"paper_id": pid, "layout": layout, "ran_position": order.index(layout) + 1, "n_listed": len(listed)}
        try:
            runner = ms.run_per_group if layout == "per_group" else ms.run_per_formulation
            asm, records = runner(client, manifest, paper_dir, listed)
            out.mkdir(parents=True, exist_ok=True)
            ms.save_calls(out / "calls.jsonl", records)
            (out / "extraction.json").write_text(
                ms.to_result(pid, asm).model_dump_json(by_alias=True, exclude_none=True, indent=2)
            )
            values = _totals(records)
            run.update(
                status="ok",
                error=None,
                listing=listing_totals,
                values=values,
                # A layout's full cost includes the shared listing call.
                wall_seconds=round(listing_totals["wall_seconds"] + values["wall_seconds"], 1),
                calls=listing_totals["calls"] + values["calls"],
                dropped_values=asm.dropped,
                duplicate_values=asm.duplicates,
                off_grid_points=asm.off_grid_points,
                placeholders=asm.placeholders,
                implausible_points=asm.implausible_points,
                call_errors=[f"{r.stage}: {r.errors}" for r in records if r.errors],
            )
        except Exception as e:  # recorded, not fatal
            run.update(status="failed", error=f"{type(e).__name__}: {e}", traceback=traceback.format_exc())
        out.mkdir(parents=True, exist_ok=True)
        run["finished_at"] = datetime.now(timezone.utc).isoformat()
        (out / "run.json").write_text(json.dumps(run, indent=2))
        print(f"{pid}: {layout} {run['status']}, {run.get('calls')} calls, {run.get('wall_seconds')} s"
              f"{', ' + str(len(run['call_errors'])) + ' failed calls' if run.get('call_errors') else ''}"
              f"{'  ' + run['error'] if run.get('error') else ''}", flush=True)


def write_arm_json(root: Path, model: str, papers: list[str]) -> None:
    claude_version = subprocess.run(["claude", "--version"], capture_output=True, text=True).stdout.strip()
    code = ["../util/claudeAPIMock.py", "pipeline/extraction/multistage.py", "experiments/claude_code/claude_code_client.py"]
    commit = subprocess.run(["git", "log", "-1", "--format=%h", "--", *code], capture_output=True, text=True).stdout.strip()
    if subprocess.run(["git", "status", "--porcelain", "--", *code], capture_output=True, text=True).stdout.strip():
        commit += " plus uncommitted changes"
    (root / "arm.json").write_text(json.dumps({
        "model": model,
        "via": "util/claudeAPIMock.py ask_llm() -> claude -p, Claude Code login (no API key)",
        "prompt": "pipeline/extraction/multistage.py (listing, then per_group and per_formulation)",
        "include_figures": False,
        "claude_code": claude_version,
        "commit": commit,
        "papers": papers,
    }, indent=2), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(prog="experiments/claude_code/run_multistage.py", description=__doc__.split("\n\n")[0])
    ap.add_argument("--model", default=MODEL, help=f"Claude model to ask (default {MODEL})")
    ap.add_argument("--only", nargs="+", metavar="PAPER_ID", help="run just these papers")
    ap.add_argument("--redo", action="store_true", help="also re-run papers that already succeeded")
    ap.add_argument("--jobs", type=int, default=3, help="papers run at the same time (default 3)")
    args = ap.parse_args()

    os.chdir(EXTRACTION)
    root = Path("experiments/claude_code") / f"multistage-{args.model.removeprefix('claude-')}"
    root.mkdir(parents=True, exist_ok=True)
    papers = sample_papers()
    todo = args.only or list(papers)
    write_arm_json(root, args.model, list(papers))
    client = ClaudeCodeClient(args.model)
    print(f"{root}: {len(todo)} papers ({', '.join(todo)}), {args.jobs} at a time", flush=True)
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        list(pool.map(lambda pid: run_paper(pid, list(papers).index(pid), papers[pid], root, client, args.redo), todo))
    for layout in LAYOUTS:
        print(format_summary(score_run(root / layout, list(papers))))


if __name__ == "__main__":
    main()
