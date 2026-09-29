"""Extract the pinned 10-paper sample through util/claudeAPIMock.py's ask_llm():
Claude Sonnet 5 answering through Claude Code (`claude -p`) on a Claude Code
login instead of the API (issue #4).

It uses the same prompt builder, output schema and scorer as the local-LLM
benchmark, so the scores line up with local_llm/*/. By default it is text only
and results go to experiments/claude_code/sonnet-5/. With --figures it also
sends each paper's figure crops, as local_llm's C arm did, and results go to
experiments/claude_code/sonnet-5-figures/. Both are laid out like a local_llm
arm.

    .venv/bin/python experiments/claude_code/run.py                  # every paper not done yet
    .venv/bin/python experiments/claude_code/run.py --figures
    .venv/bin/python experiments/claude_code/run.py --only bdf71b01 --redo

A paper that already succeeded is skipped, so a re-run can look as if nothing
happened; pass --redo to run it again. A paper's folder appears once it has
finished. Every run ends by re-scoring all 10 papers.

This is an experiment, not part of the pipeline: it imports `util` from the
repo root itself (what PYTHONPATH=.. would do) and changes into extraction/,
so it can be started from any folder.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

EXTRACTION = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(EXTRACTION.parent), str(EXTRACTION)]  # repo root for `util`, extraction/ for `pipeline`

from pipeline.evaluation.evaluate import format_summary, score_run  # noqa: E402
from pipeline.extraction.prompt import build_extraction_request  # noqa: E402
from pipeline.extraction.schema import ExtractedFormulations, PaperExtractionResult  # noqa: E402
from pipeline.parsing.manifest_schema import ParseManifest  # noqa: E402
from util.claudeAPIMock import ask_llm  # noqa: E402

# The model settings.yaml's `anthropic` provider uses, so this run previews
# the paid-API path at no API cost.
MODEL = "claude-sonnet-5"
SAMPLE_DIR = Path("experiments/tier_comparison")
RUN_DIRS = {False: Path("experiments/claude_code/sonnet-5"), True: Path("experiments/claude_code/sonnet-5-figures")}


def sample_papers() -> dict[str, Path]:
    """Pinned sample, smallest paper first, mapped to its committed parse."""
    sample = json.loads((SAMPLE_DIR / "sample.json").read_text())
    dirs = {p["paper_id"]: next(SAMPLE_DIR.glob(f"{p['paper_id']}-*/hybrid")) for p in sample["papers"]}
    return dict(sorted(dirs.items(), key=lambda item: (item[1] / "content.md").stat().st_size))


def already_done(run_dir: Path, paper_id: str) -> bool:
    run_json = run_dir / paper_id / "run.json"
    return run_json.exists() and json.loads(run_json.read_text())["status"] == "ok"


def run_paper(paper_id: str, paper_dir: Path, run_dir: Path, include_figures: bool) -> dict:
    manifest = ParseManifest.model_validate_json((paper_dir / "manifest.json").read_text())
    request = build_extraction_request(manifest, paper_dir, include_figures=include_figures)
    out = run_dir / paper_id
    (out / "extraction.json").unlink(missing_ok=True)  # a failed re-run must not leave the old result to be scored

    # A long paper takes several minutes with nothing else printed, so say it has begun.
    print(
        f"{paper_id}: started ({len(request.text_content):,} chars of paper text, {len(request.images)} images)",
        flush=True,
    )
    started = time.monotonic()
    reply, error, n_formulations = "", None, None
    try:
        reply = ask_llm(
            request.text_content,
            system=request.system_prompt,
            model=MODEL,
            json_schema=ExtractedFormulations.model_json_schema(),
            images=[(image.path, image.label) for image in request.images],
        )
        parsed = ExtractedFormulations.model_validate_json(reply)
    except (RuntimeError, ValueError) as e:  # pydantic's ValidationError is a ValueError
        error = str(e)
    # Created only now, so a paper's folder appearing means it has finished (run.json says how).
    out.mkdir(parents=True, exist_ok=True)
    if error is None:
        n_formulations = len(parsed.formulations)
        result = PaperExtractionResult(paper_id=paper_id, formulations=parsed.formulations)
        (out / "extraction.json").write_text(
            result.model_dump_json(by_alias=True, exclude_none=True, indent=2), encoding="utf-8"
        )
    wall_seconds = round(time.monotonic() - started, 1)

    (out / "raw_llm_response.json").write_text(
        json.dumps(
            {
                "model_name": MODEL,
                "via": "claude -p (util/claudeAPIMock.py)",
                "include_figures": include_figures,
                "images_attached": len(request.images),
                "validation_errors": [error] if error else [],
                "raw_text": reply,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    run = {
        "paper_id": paper_id,
        "status": "error" if error else "ok",
        "error": error,
        "n_formulations": n_formulations,
        "prompt_chars": len(request.system_prompt) + len(request.text_content),
        "images_attached": len(request.images),
        "reply_chars": len(reply),
        "wall_seconds": wall_seconds,
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }
    (out / "run.json").write_text(json.dumps(run, indent=2), encoding="utf-8")
    outcome = f"{n_formulations} formulations" if error is None else f"error: {error[:300]}"
    print(f"{paper_id}: {outcome} ({wall_seconds:.0f} s)", flush=True)
    return run


def write_arm_json(run_dir: Path, papers: list[str], include_figures: bool) -> None:
    """Record what produced these results, as local_llm's arm.json does."""
    claude_version = subprocess.run(["claude", "--version"], capture_output=True, text=True).stdout.strip()
    mock = "../util/claudeAPIMock.py"
    commit = subprocess.run(["git", "log", "-1", "--format=%h", "--", mock], capture_output=True, text=True).stdout.strip()
    if subprocess.run(["git", "status", "--porcelain", "--", mock], capture_output=True, text=True).stdout.strip():
        commit += " plus uncommitted changes"
    (run_dir / "arm.json").write_text(
        json.dumps(
            {
                "model": MODEL,
                "via": "util/claudeAPIMock.py ask_llm() -> claude -p, Claude Code login (no API key)",
                "include_figures": include_figures,
                "claude_code": claude_version,
                "claudeAPIMock_commit": commit,
                "papers": papers,
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def main() -> None:
    ap = argparse.ArgumentParser(prog="experiments/claude_code/run.py", description=__doc__.split("\n\n")[0])
    ap.add_argument("--figures", action="store_true", help="also send each paper's figure crops")
    ap.add_argument("--only", nargs="+", metavar="PAPER_ID", help="run just these papers")
    ap.add_argument("--redo", action="store_true", help="also re-run papers that already succeeded")
    ap.add_argument("--jobs", type=int, default=3, help="papers extracted at the same time (default 3)")
    args = ap.parse_args()

    os.chdir(EXTRACTION)
    run_dir = RUN_DIRS[args.figures]
    papers = sample_papers()
    todo = [pid for pid in (args.only or papers) if args.redo or not already_done(run_dir, pid)]
    run_dir.mkdir(parents=True, exist_ok=True)
    write_arm_json(run_dir, list(papers), args.figures)
    print(f"{run_dir}: {len(todo)} to run ({', '.join(todo) or 'none'}), {args.jobs} at a time", flush=True)
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        list(pool.map(lambda pid: run_paper(pid, papers[pid], run_dir, args.figures), todo))
    print(format_summary(score_run(run_dir, list(papers))))


if __name__ == "__main__":
    main()
