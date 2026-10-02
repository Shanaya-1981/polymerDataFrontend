"""Extract the pinned 10-paper sample through util/claudeAPIMock.py's ask_llm():
Claude Sonnet 5 answering through Claude Code (`claude -p`) on a Claude Code
login instead of the API (issue #4).

Three settings, each with its own results folder laid out like a local_llm arm:

- default: the pipeline's prompt (pipeline/extraction/prompt.py), text only,
  as the local-LLM benchmark ran -> experiments/claude_code/sonnet-5/
- --figures: the same prompt plus each paper's figure crops, as local_llm's
  C arm did -> experiments/claude_code/sonnet-5-figures/
- --simple: extract_features.py's short prompt, with the golden CSV's column
  names as the features, figures included -> experiments/claude_code/sonnet-5-simple/
- --simple --pdf: the same short prompt, but the model gets each paper's PDF
  itself instead of MinerU's text and figures -> .../sonnet-5-simple-pdf/

All three use the same output scoring as the local-LLM benchmark. --model picks
another Claude model; its results go to a folder named after it instead, e.g.
--model claude-opus-5-5 --simple -> experiments/claude_code/opus-5-5-simple/.

    .venv/bin/python experiments/claude_code/run.py                  # every paper not done yet
    .venv/bin/python experiments/claude_code/run.py --figures
    .venv/bin/python experiments/claude_code/run.py --simple
    .venv/bin/python experiments/claude_code/run.py --simple --model claude-opus-5-5
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

from extract_features import SYSTEM as SIMPLE_SYSTEM  # noqa: E402
from extract_features import SYSTEM_PDF as SIMPLE_SYSTEM_PDF  # noqa: E402
from extract_features import build_prompt, extract_features, feature_list  # noqa: E402
from pipeline.evaluation.evaluate import format_summary, score_run  # noqa: E402
from pipeline.extraction.prompt import build_extraction_request  # noqa: E402
from pipeline.extraction.schema import ExtractedFormulations, PaperExtractionResult  # noqa: E402
from pipeline.parsing.manifest_schema import ParseManifest  # noqa: E402
from pipeline.schema_columns import REPORTED_COLUMNS  # noqa: E402
from util.claudeAPIMock import ask_llm  # noqa: E402

# The default: the model settings.yaml's `anthropic` provider uses, so a run
# previews the paid-API path at no API cost.
MODEL = "claude-sonnet-5"
SAMPLE_DIR = Path("experiments/tier_comparison")
RUNS_ROOT = Path("experiments/claude_code")


def sample_papers() -> dict[str, Path]:
    """Pinned sample, smallest paper first, mapped to its committed parse."""
    sample = json.loads((SAMPLE_DIR / "sample.json").read_text())
    dirs = {p["paper_id"]: next(SAMPLE_DIR.glob(f"{p['paper_id']}-*/hybrid")) for p in sample["papers"]}
    return dict(sorted(dirs.items(), key=lambda item: (item[1] / "content.md").stat().st_size))


def already_done(run_dir: Path, paper_id: str) -> bool:
    run_json = run_dir / paper_id / "run.json"
    return run_json.exists() and json.loads(run_json.read_text())["status"] == "ok"


def run_paper(
    paper_id: str, paper_dir: Path, run_dir: Path, include_figures: bool, simple: bool, send_pdf: bool, model: str
) -> dict:
    out = run_dir / paper_id
    (out / "extraction.json").unlink(missing_ok=True)  # a failed re-run must not leave the old result to be scored
    pdf = paper_dir.parent / f"{paper_dir.parent.name}.pdf"  # tier_comparison keeps each paper's PDF beside its parses
    if send_pdf:
        prompt_chars, n_images = len(SIMPLE_SYSTEM_PDF) + len(feature_list(REPORTED_COLUMNS)), 0
    elif simple:
        text, images = build_prompt(paper_dir, REPORTED_COLUMNS)
        prompt_chars, n_images = len(SIMPLE_SYSTEM) + len(text), len(images)
    else:
        manifest = ParseManifest.model_validate_json((paper_dir / "manifest.json").read_text())
        request = build_extraction_request(manifest, paper_dir, include_figures=include_figures)
        prompt_chars, n_images = len(request.system_prompt) + len(request.text_content), len(request.images)

    # A long paper takes several minutes with nothing else printed, so say it has begun.
    attached = f"a {pdf.stat().st_size // 1000:,} KB PDF" if send_pdf else f"{n_images} images"
    print(f"{paper_id}: started ({prompt_chars:,} chars of prompt, {attached})", flush=True)
    started = time.monotonic()
    reply, error, n_formulations = "", None, None
    try:
        if simple:
            samples = extract_features(pdf if send_pdf else paper_dir, REPORTED_COLUMNS, model=model, send_pdf=send_pdf)
            reply = json.dumps(samples, ensure_ascii=False)
            rows = [point for points in samples.values() for point in points]
            extraction = json.dumps({"paper_id": paper_id, "formulations": rows}, indent=2, ensure_ascii=False)
        else:
            reply = ask_llm(
                request.text_content,
                system=request.system_prompt,
                model=model,
                json_schema=ExtractedFormulations.model_json_schema(),
                images=[(image.path, image.label) for image in request.images],
            )
            parsed = ExtractedFormulations.model_validate_json(reply)
            rows = parsed.formulations
            extraction = PaperExtractionResult(paper_id=paper_id, formulations=rows).model_dump_json(
                by_alias=True, exclude_none=True, indent=2
            )
    except (RuntimeError, ValueError) as e:  # pydantic's ValidationError is a ValueError
        error = str(e)
    # Created only now, so a paper's folder appearing means it has finished (run.json says how).
    out.mkdir(parents=True, exist_ok=True)
    if error is None:
        n_formulations = len(rows)
        (out / "extraction.json").write_text(extraction, encoding="utf-8")
    wall_seconds = round(time.monotonic() - started, 1)

    (out / "raw_llm_response.json").write_text(
        json.dumps(
            {
                "model_name": model,
                "via": "claude -p (util/claudeAPIMock.py)",
                "prompt": _prompt_name(simple, send_pdf),
                "include_figures": include_figures,
                "images_attached": n_images,
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
        "prompt_chars": prompt_chars,
        "images_attached": n_images,
        "reply_chars": len(reply),
        "wall_seconds": wall_seconds,
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }
    (out / "run.json").write_text(json.dumps(run, indent=2), encoding="utf-8")
    outcome = f"{n_formulations} formulations" if error is None else f"error: {error[:300]}"
    print(f"{paper_id}: {outcome} ({wall_seconds:.0f} s)", flush=True)
    return run


def _prompt_name(simple: bool, send_pdf: bool) -> str:
    return "extract_features.py --send-pdf" if send_pdf else "extract_features.py" if simple else "pipeline/extraction/prompt.py"


def write_arm_json(run_dir: Path, papers: list[str], include_figures: bool, simple: bool, send_pdf: bool, model: str) -> None:
    """Record what produced these results, as local_llm's arm.json does."""
    claude_version = subprocess.run(["claude", "--version"], capture_output=True, text=True).stdout.strip()
    code = ["../util/claudeAPIMock.py", "extract_features.py" if simple else "pipeline/extraction/prompt.py"]
    commit = subprocess.run(["git", "log", "-1", "--format=%h", "--", *code], capture_output=True, text=True).stdout.strip()
    if subprocess.run(["git", "status", "--porcelain", "--", *code], capture_output=True, text=True).stdout.strip():
        commit += " plus uncommitted changes"
    (run_dir / "arm.json").write_text(
        json.dumps(
            {
                "model": model,
                "via": "util/claudeAPIMock.py ask_llm() -> claude -p, Claude Code login (no API key)",
                "prompt": _prompt_name(simple, send_pdf),
                "include_figures": include_figures,
                "claude_code": claude_version,
                "commit": commit,
                "papers": papers,
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def main() -> None:
    ap = argparse.ArgumentParser(prog="experiments/claude_code/run.py", description=__doc__.split("\n\n")[0])
    ap.add_argument("--figures", action="store_true", help="also send each paper's figure crops")
    ap.add_argument("--simple", action="store_true", help="use extract_features.py's short prompt (figures included)")
    ap.add_argument("--pdf", action="store_true", help="with --simple: send each paper's PDF instead of MinerU's output")
    ap.add_argument("--model", default=MODEL, help=f"Claude model to ask (default {MODEL})")
    ap.add_argument("--only", nargs="+", metavar="PAPER_ID", help="run just these papers")
    ap.add_argument("--redo", action="store_true", help="also re-run papers that already succeeded")
    ap.add_argument("--jobs", type=int, default=3, help="papers extracted at the same time (default 3)")
    args = ap.parse_args()
    if args.pdf and not args.simple:
        ap.error("--pdf goes with --simple")

    os.chdir(EXTRACTION)
    include_figures = args.figures or args.simple
    suffix = "-simple-pdf" if args.pdf else "-simple" if args.simple else "-figures" if args.figures else ""
    run_dir = RUNS_ROOT / (args.model.removeprefix("claude-") + suffix)
    papers = sample_papers()
    todo = [pid for pid in (args.only or papers) if args.redo or not already_done(run_dir, pid)]
    run_dir.mkdir(parents=True, exist_ok=True)
    write_arm_json(run_dir, list(papers), include_figures, args.simple, args.pdf, args.model)
    print(f"{run_dir}: {len(todo)} to run ({', '.join(todo) or 'none'}), {args.jobs} at a time", flush=True)
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        list(
            pool.map(
                lambda pid: run_paper(pid, papers[pid], run_dir, include_figures, args.simple, args.pdf, args.model),
                todo,
            )
        )
    print(format_summary(score_run(run_dir, list(papers))))


if __name__ == "__main__":
    main()
