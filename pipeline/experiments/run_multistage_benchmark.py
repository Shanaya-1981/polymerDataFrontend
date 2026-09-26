"""Compare two multi-call layouts: one call per field group vs one call per
formulation (pipeline/extraction/multistage.py).

For each of the pinned 10 papers, smallest first:

1. one listing call (shared: both layouts fill the *same* formulation list,
   so any difference between them comes only from how values are asked for);
2. both layouts' value calls, in alternating order from paper to paper, so
   neither layout always runs second and inherits the warmer prompt cache.

Unlike Round 1, the prompt cache is ON: re-reading the paper cheaply on
every call is part of what is being measured. Each call records how many
prompt tokens it actually read versus served from cache.

Layout:

    experiments/multistage/
        SUMMARY.md, run_meta.json, server.log
        listing/<paper>/listing.json, calls.jsonl
        per_group/<paper>/extraction.json, calls.jsonl, run.json
        per_formulation/<paper>/extraction.json, calls.jsonl, run.json
        per_group/scores.json, per_formulation/scores.json (+ CSVs)

A paper whose layouts both succeeded is skipped on a re-run (--redo forces).

Usage:
    .venv/bin/python -m pipeline.experiments.run_multistage_benchmark
    .venv/bin/python -m pipeline.experiments.run_multistage_benchmark --only bdf71b01
    .venv/bin/python -m pipeline.experiments.run_multistage_benchmark --summary-only
"""

from __future__ import annotations

import argparse
import json
import statistics
import subprocess
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

from pipeline.evaluation.evaluate import format_summary, score_run
from pipeline.experiments.run_local_llm_benchmark import (
    BENCH_ROOT,
    HEALTH_TIMEOUT_S,
    _get_json,
    _memory_verdict,
    _papers_smallest_first,
    _server_up,
    load_arms,
    parse_memory,
    server_command,
)
from pipeline.extraction import multistage as ms
from pipeline.extraction.llm_client.factory import build_llm_client
from pipeline.extraction.run_extraction import PARSED_ROOT
from pipeline.parsing.manifest_schema import ParseManifest

ROOT = Path("experiments/multistage")
LAYOUTS = ("per_group", "per_formulation")
ARM = "A-qwen3.5-4b"  # the 8 GB model, so Round 1's single call is the reference
ROUND1_DIR = BENCH_ROOT / ARM


def _client(defaults: dict, port: int):
    settings = {k: defaults.get(k) for k in ("temperature", "presence_penalty", "seed", "timeout")}
    settings.update(
        base_url=f"http://127.0.0.1:{port}/v1",
        model="qwen3.5-4b-multistage",
        max_retries=0,
        # Per call, so far below Round 1's 24,576: no single answer here needs
        # to hold a whole paper, and a runaway call fails sooner.
        max_tokens=12288,
        extra_body={"cache_prompt": True, "chat_template_kwargs": {"enable_thinking": False}},
    )
    return build_llm_client("openai_compatible", settings)


def _totals(records: list) -> dict:
    def s(attr):
        return sum(getattr(r, attr) or 0 for r in records)
    return {
        "calls": len(records),
        "failed_calls": sum(not r.ok for r in records),
        "wall_seconds": round(s("wall_seconds"), 1),
        "prompt_tokens": s("prompt_tokens"),
        "read_tokens": s("read_tokens"),
        "cached_tokens": s("cached_tokens"),
        "output_tokens": s("output_tokens"),
    }


def run_paper(pid: str, index: int, client, redo: bool) -> None:
    paper_dir = PARSED_ROOT / pid
    manifest = ParseManifest.model_validate_json((paper_dir / "manifest.json").read_text())

    listing_dir = ROOT / "listing" / pid
    listing_dir.mkdir(parents=True, exist_ok=True)
    listing_json = listing_dir / "listing.json"
    if listing_json.exists() and not redo:
        saved = json.loads(listing_json.read_text())
        listed, listing_totals = saved["formulations"], saved["totals"]
    else:
        listed, record, stats = ms.run_listing(client, manifest, paper_dir)
        ms.save_calls(listing_dir / "calls.jsonl", [record])
        listing_totals = _totals([record])
        listing_json.write_text(json.dumps({"formulations": listed, "totals": listing_totals, "quote_check": stats,
                                            "errors": record.errors}, indent=2))
        print(f"  listing quote check: {stats}", flush=True)
    print(f"  listing: {len(listed)} formulations, {listing_totals['wall_seconds']}s", flush=True)
    if not listed:
        for layout in LAYOUTS:
            out = ROOT / layout / pid
            out.mkdir(parents=True, exist_ok=True)
            (out / "run.json").write_text(json.dumps({"paper_id": pid, "status": "failed", "error": "listing returned no formulations"}))
        return

    order = LAYOUTS if index % 2 == 0 else tuple(reversed(LAYOUTS))
    for layout in order:
        out = ROOT / layout / pid
        if (out / "run.json").exists() and not redo and json.loads((out / "run.json").read_text()).get("status") == "ok":
            print(f"  {layout}: already done", flush=True)
            continue
        out.mkdir(parents=True, exist_ok=True)
        for stale in ("extraction.json", "calls.jsonl"):
            (out / stale).unlink(missing_ok=True)
        run = {"paper_id": pid, "layout": layout, "ran_position": order.index(layout) + 1, "n_listed": len(listed)}
        try:
            runner = ms.run_per_group if layout == "per_group" else ms.run_per_formulation
            asm, records = runner(client, manifest, paper_dir, listed)
            ms.save_calls(out / "calls.jsonl", records)
            result = ms.to_result(pid, asm)
            (out / "extraction.json").write_text(result.model_dump_json(by_alias=True, exclude_none=True, indent=2))
            value_totals = _totals(records)
            run.update(
                status="ok",
                error=None,
                listing=listing_totals,
                values=value_totals,
                # A layout's full cost includes the shared listing call.
                wall_seconds=round(listing_totals["wall_seconds"] + value_totals["wall_seconds"], 1),
                calls=listing_totals["calls"] + value_totals["calls"],
                read_tokens=listing_totals["read_tokens"] + value_totals["read_tokens"],
                prompt_tokens=listing_totals["prompt_tokens"] + value_totals["prompt_tokens"],
                output_tokens=listing_totals["output_tokens"] + value_totals["output_tokens"],
                dropped_values=asm.dropped,
                duplicate_values=asm.duplicates,
                off_grid_points=asm.off_grid_points,
                placeholders=asm.placeholders,
                implausible_points=asm.implausible_points,
                call_errors=[f"{r.stage}: {r.errors}" for r in records if r.errors],
            )
        except Exception as e:  # recorded, not fatal
            run.update(status="failed", error=f"{type(e).__name__}: {e}", traceback=traceback.format_exc())
        (out / "run.json").write_text(json.dumps(run, indent=2))
        print(f"  {layout}: {run['status']}  {run.get('calls')} calls  {run.get('wall_seconds')}s  "
              f"read={run.get('read_tokens')} written={run.get('output_tokens')}  {run.get('error') or ''}", flush=True)


def run_all(only: str | None, redo: bool) -> None:
    defaults, arms = load_arms()
    arm = {"name": ARM, **arms[ARM]}
    port = defaults.get("port", 8080)
    if _server_up(port):
        raise SystemExit(f"Something is already serving on port {port}; stop it first (pkill -f llama-server)")
    ROOT.mkdir(parents=True, exist_ok=True)
    log_file = ROOT / "server.log"
    log_file.unlink(missing_ok=True)
    cmd = server_command(arm, port, log_file)
    print(f"starting: {' '.join(cmd)}", flush=True)
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        deadline = time.monotonic() + HEALTH_TIMEOUT_S
        while not _server_up(port):
            if proc.poll() is not None or time.monotonic() > deadline:
                raise SystemExit(f"llama-server did not come up; see {log_file}")
            time.sleep(1)
        n_ctx = _get_json(f"http://127.0.0.1:{port}/props")["default_generation_settings"]["n_ctx"]
        if n_ctx < arm["ctx"]:
            raise SystemExit(f"server allocated n_ctx={n_ctx}, need {arm['ctx']}")
        memory = parse_memory(log_file.read_text(errors="replace"))
        (ROOT / "run_meta.json").write_text(json.dumps({
            "arm": arm, "server_command": cmd, "memory": _memory_verdict(arm, memory) if memory["devices"] else None,
            "started_at": datetime.now(timezone.utc).isoformat(),
        }, indent=2))
        client = _client(defaults, port)
        papers = [only] if only else _papers_smallest_first()
        for i, pid in enumerate(papers):
            print(f"[{i + 1}/{len(papers)}] {pid}", flush=True)
            run_paper(pid, i, client, redo)
            if proc.poll() is not None:
                print("llama-server died; stopping", flush=True)
                break
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            proc.kill()
    if not only:
        for layout in LAYOUTS:
            print(f"\n== {layout}\n" + format_summary(score_run(ROOT / layout)), flush=True)
        write_summary()


# --- summary ------------------------------------------------------------------


def _pct(x) -> str:
    return "–" if x is None else f"{100 * x:.0f}%"


def _runs(layout_dir: Path) -> list[dict]:
    return [json.loads(p.read_text()) for p in sorted(layout_dir.glob("*/run.json"))]


def _round1_runs() -> list[dict]:
    return [json.loads(p.read_text()) for p in sorted(ROUND1_DIR.glob("*/run.json"))]


def _table(headers, rows) -> str:
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    out += ["| " + " | ".join(str(v) for v in r) + " |" for r in rows]
    return "\n".join(out)


def _impossible(layout_dir: Path) -> tuple[int, int]:
    bad = filled = 0
    for ext in layout_dir.glob("*/extraction.json"):
        for rec in json.loads(ext.read_text()).get("formulations", []):
            for k, v in rec.items():
                if k.startswith("Conductivity at ") and isinstance(v, (int, float)):
                    filled += 1
                    bad += v <= 0
    return bad, filled


def write_summary() -> None:
    scores = {layout: json.loads((ROOT / layout / "scores.json").read_text())
              for layout in LAYOUTS if (ROOT / layout / "scores.json").exists()}
    r1_scores = json.loads((ROUND1_DIR / "scores.json").read_text()) if (ROUND1_DIR / "scores.json").exists() else None

    lines = [
        "# Multi-call extraction: per group vs per formulation",
        "",
        "_Generated by `pipeline/experiments/run_multistage_benchmark.py`; do not edit by hand._",
        "",
        "Qwen3.5-4B (8 GB setup), the pinned 10 papers, text only, MacBook Air M4. Both layouts start from the "
        "**same listing call** per paper, so they fill the same formulation list; their difference is only how "
        "values are asked for. Round 1's single call (same model, same papers, prompt cache off) is the reference. "
        "Times include the shared listing call.",
        "",
        "## Efficiency",
        "",
        "*Read* = prompt tokens the model actually processed; the rest of each prompt was served from the prompt "
        "cache (the server reusing the already-processed start of the previous request). *Written* = tokens "
        "generated, the slow part on a laptop.",
        "",
    ]
    rows = []
    r1 = _round1_runs()
    if r1:
        rows.append([
            "Round 1: one call", sum(r["status"] == "ok" for r in r1), len(r1),
            f"{sum(r['wall_seconds'] or 0 for r in r1) / 60:.0f} min",
            f"{statistics.median([r['wall_seconds'] for r in r1 if r['status'] == 'ok']):.0f} s",
            f"{sum(r['prompt_tokens'] or 0 for r in r1):,}", f"{sum(r['prompt_tokens'] or 0 for r in r1):,}",
            f"{sum(r['completion_tokens'] or 0 for r in r1):,}",
        ])
    for layout in LAYOUTS:
        runs = _runs(ROOT / layout)
        ok = [r for r in runs if r.get("status") == "ok"]
        if not runs:
            continue
        rows.append([
            layout.replace("_", " "), len(ok), sum(r.get("calls", 0) for r in ok),
            f"{sum(r.get('wall_seconds', 0) for r in ok) / 60:.0f} min",
            f"{statistics.median([r['wall_seconds'] for r in ok]):.0f} s" if ok else "–",
            f"{sum(r.get('prompt_tokens', 0) for r in ok):,}", f"{sum(r.get('read_tokens', 0) for r in ok):,}",
            f"{sum(r.get('output_tokens', 0) for r in ok):,}",
        ])
    lines.append(_table(["Layout", "Papers OK", "Calls", "Total time", "Median per paper", "Prompt tokens sent",
                         "Read (after cache)", "Written"], rows))

    lines += ["", "## Quality", "",
              "Same scorer as Round 1 (`pipeline/evaluation/`). *Found* = golden formulations paired with a "
              "predicted one (rank = paired by concentration order when units differ). *Accuracy* = correct "
              "cells among the golden-filled cells of paired formulations; *recall* = correct cells among all "
              "golden-filled cells. Conductivity: within 0.1 decades / within 0.5 decades.", ""]
    rows = []
    entries = ([("Round 1: one call", r1_scores, ROUND1_DIR)] if r1_scores else []) + \
              [(layout.replace("_", " "), scores.get(layout), ROOT / layout) for layout in LAYOUTS if scores.get(layout)]
    for label, s, d in entries:
        f, g = s["formulations"], s["groups"]
        bad, filled = _impossible(d)
        rows.append([
            label, f"{f['matched']}/{f['gold_rows']} ({f['matched_rank']} rank)", _pct(f["precision"]),
            _pct(g["HEADLINE"]["accuracy"]), _pct(g["HEADLINE"]["recall"]),
            _pct(g["thermal"]["accuracy"]),
            f"{_pct(g['conductivity']['accuracy'])} / {_pct(g['conductivity']['accuracy_loose'])} "
            f"({g['conductivity']['gold_cells_matched']} cells)",
            _pct(g["processing"]["accuracy"]), f"{filled} ({bad} impossible)",
        ])
    lines.append(_table(["Layout", "Found", "Precision", "Headline accuracy", "Headline recall", "Thermal",
                         "Conductivity", "Processing", "Conductivity values written"], rows))

    lines += ["", "## Per paper", "", "Formulations listed by the shared listing call vs golden rows; then each "
              "layout's calls and seconds (listing included).", ""]
    rows = []
    for pid in _papers_smallest_first():
        lj = ROOT / "listing" / pid / "listing.json"
        n_listed = len(json.loads(lj.read_text())["formulations"]) if lj.exists() else "–"
        gold = next((p["gold_rows"] for p in (scores.get("per_group") or {}).get("per_paper", []) if p["paper_id"] == pid), "?")
        r1run = next((r for r in r1 if r["paper_id"] == pid), None)
        row = [pid, gold, r1run["n_formulations"] if r1run and r1run["status"] == "ok" else "failed", n_listed]
        for layout in LAYOUTS:
            rp = ROOT / layout / pid / "run.json"
            r = json.loads(rp.read_text()) if rp.exists() else None
            row.append("–" if not r else (f"{r['calls']} calls, {r['wall_seconds']:.0f} s" if r.get("status") == "ok" else "failed"))
        rows.append(row)
    lines.append(_table(["Paper", "Golden rows", "Round 1 entries", "Listed", "per group", "per formulation"], rows))

    issues = []
    for layout in LAYOUTS:
        for r in _runs(ROOT / layout):
            if r.get("status") != "ok":
                issues.append(f"- `{layout}` / `{r['paper_id']}`: {r.get('error')}")
                continue
            if r.get("dropped_values"):
                issues.append(f"- `{layout}` / `{r['paper_id']}`: {len(r['dropped_values'])} values dropped as the wrong type, e.g. {r['dropped_values'][0]}")
            if r.get("placeholders"):
                issues.append(f"- `{layout}` / `{r['paper_id']}`: {r['placeholders']} placeholder values ('na', 'not reported', ...) dropped")
            if r.get("implausible_points"):
                issues.append(f"- `{layout}` / `{r['paper_id']}`: {r['implausible_points']} conductivity values outside 1e-13..1 S/cm dropped")
            if r.get("off_grid_points"):
                issues.append(f"- `{layout}` / `{r['paper_id']}`: {r['off_grid_points']} conductivity points at temperatures with no answer-sheet column")
            for e in r.get("call_errors", []):
                issues.append(f"- `{layout}` / `{r['paper_id']}`: call error {e[:200]}")
    lines += ["", "## Issues", ""] + (issues or ["None."])
    (ROOT / "SUMMARY.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {ROOT / 'SUMMARY.md'}")


def reassemble() -> None:
    for layout in LAYOUTS:
        for run_json in sorted((ROOT / layout).glob("*/run.json")):
            pid = run_json.parent.name
            listing = json.loads((ROOT / "listing" / pid / "listing.json").read_text())["formulations"]
            calls_path = run_json.parent / "calls.jsonl"
            if not calls_path.exists():
                continue
            calls = [json.loads(line) for line in calls_path.read_text().splitlines() if line.strip()]
            asm = ms.replay(listing, calls)
            (run_json.parent / "extraction.json").write_text(
                ms.to_result(pid, asm).model_dump_json(by_alias=True, exclude_none=True, indent=2))
            run = json.loads(run_json.read_text())
            run.update(dropped_values=asm.dropped, duplicate_values=asm.duplicates, off_grid_points=asm.off_grid_points,
                       placeholders=asm.placeholders, implausible_points=asm.implausible_points)
            run_json.write_text(json.dumps(run, indent=2))
    for layout in LAYOUTS:
        print(f"== {layout}\n" + format_summary(score_run(ROOT / layout)))
    write_summary()


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m pipeline.experiments.run_multistage_benchmark")
    ap.add_argument("--only", help="Run a single paper_id")
    ap.add_argument("--redo", action="store_true", help="Re-run the listing and both layouts even if saved")
    ap.add_argument("--summary-only", action="store_true", help="Re-score saved results and rewrite SUMMARY.md")
    ap.add_argument("--reassemble", action="store_true",
                    help="Rebuild every extraction.json from saved raw call outputs (no model), then re-score")
    args = ap.parse_args()
    if args.reassemble:
        reassemble()
        return
    if args.summary_only:
        for layout in LAYOUTS:
            print(f"== {layout}\n" + format_summary(score_run(ROOT / layout)))
        write_summary()
        return
    run_all(args.only, args.redo)


if __name__ == "__main__":
    main()
