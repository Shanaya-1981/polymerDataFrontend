"""Run one local-LLM benchmark arm over the pinned 10-paper sample.

An arm (experiments/local_llm/arms.yaml) is one model plus one set of
settings. For an arm, this module:

1. starts `llama-server` itself, from the arm's definition, and refuses to
   run if the context window the server actually allocated (`/props` ->
   `n_ctx`) is smaller than the arm asks for -- llama-server's `--fit`
   shrinks the context to fit memory whenever `-c` is left unset;
2. records memory two ways: llama.cpp's own breakdown (weights, KV cache,
   compute buffers, per device) and the OS's peak physical footprint of the
   server process;
3. extracts every sample paper through `extract_paper()` -- the same code
   path as `python -m pipeline.cli extract` -- smallest paper first, so a
   broken arm fails fast;
4. stops the server (also on error), then scores the arm against the golden
   set (pipeline/evaluation/evaluate.py).

Layout:

    experiments/local_llm/<arm>/
        arm.json                 definition, server command, llama.cpp version,
                                 memory, per-paper summary
        server.log               llama-server's own log
        scores.json, scores_*.csv
        <paper_id>/raw_llm_response.json, extraction.json, run.json

A failed paper is recorded in its run.json and the run moves on; a server
that dies stops the arm. A re-run skips papers whose run.json says `ok`
(`--redo` forces them), so an interrupted arm resumes where it stopped.

Usage (from the project root, llama-server on PATH):
    .venv/bin/python -m pipeline.experiments.run_local_llm_benchmark --list
    .venv/bin/python -m pipeline.experiments.run_local_llm_benchmark --arm A-qwen3.5-4b
    .venv/bin/python -m pipeline.experiments.run_local_llm_benchmark --arm A-qwen3.5-4b --only bdf71b01
    .venv/bin/python -m pipeline.experiments.run_local_llm_benchmark --arm A-qwen3.5-4b --score-only
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import yaml

from pipeline.evaluation.evaluate import format_summary, score_run
from pipeline.experiments.select_sample import load_sample
from pipeline.extraction.llm_client.factory import build_llm_client
from pipeline.extraction.run_extraction import PARSED_ROOT, extract_paper

ARMS_YAML = Path("experiments/local_llm/arms.yaml")
BENCH_ROOT = Path("experiments/local_llm")
HEALTH_TIMEOUT_S = 300
# What macOS lets the GPU use on 8-32 GB machines (Metal's
# recommendedMaxWorkingSetSize): about two thirds of RAM.
GPU_SHARE_OF_RAM = 2 / 3

_DEVICE_RE = re.compile(
    r"\|\s+- (?P<device>[^|]+?)\s+\|\s+(?P<total>\d+) = (?P<free>-?\d+) \+ \((?P<self>\d+) =\s+"
    r"(?P<model>\d+) \+\s+(?P<context>\d+) \+\s+(?P<compute>\d+)\)"
)
_HOST_RE = re.compile(
    r"\|\s+- Host\s+\|\s+(?P<self>\d+) =\s+(?P<model>\d+) \+\s+(?P<context>\d+) \+\s+(?P<compute>\d+)"
)


def load_arms() -> tuple[dict, dict]:
    raw = yaml.safe_load(ARMS_YAML.read_text())
    return raw["defaults"], raw["arms"]


def server_command(arm: dict, port: int, log_file: Path) -> list[str]:
    cmd = [
        "llama-server",
        "-m", arm["model_file"],
        "-c", str(arm["ctx"]),
        "-np", "1",  # one slot: the whole context belongs to the one request
        "--reasoning", "off",
        "--offline",
        "--no-webui",
        "--port", str(port),
        "-lv", "4",  # at the default verbosity the memory breakdown isn't logged
        "--log-file", str(log_file),
    ]
    if arm.get("mmproj"):
        cmd += ["--mmproj", arm["mmproj"]]
        if arm.get("image_max_tokens"):
            cmd += ["--image-max-tokens", str(arm["image_max_tokens"])]
    if arm.get("cache_type"):
        cmd += ["-ctk", arm["cache_type"], "-ctv", arm["cache_type"]]
    return cmd


def _get_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.loads(r.read())


def _server_up(port: int) -> bool:
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=2)
        return True
    except (urllib.error.URLError, ConnectionError, TimeoutError):
        return False


def parse_memory(log_text: str) -> dict:
    """llama.cpp's startup memory breakdown, in MiB. The last one logged wins
    (fitting may log a projection before the final configuration)."""
    devices = {}
    for m in _DEVICE_RE.finditer(log_text):
        devices[m["device"].strip()] = {k: int(m[k]) for k in ("self", "model", "context", "compute")}
    host = None
    for m in _HOST_RE.finditer(log_text):
        host = {k: int(m[k]) for k in ("self", "model", "context", "compute")}
    return {"devices": devices, "host": host}


def peak_footprint_mib(pid: int) -> float | None:
    """The OS's high-water mark of the process's physical memory (macOS)."""
    if not shutil.which("footprint"):
        return None
    out = subprocess.run(["footprint", "-p", str(pid)], capture_output=True, text=True).stdout
    m = re.search(r"phys_footprint_peak:\s*([\d.]+)\s*([KMG])B", out)
    if not m:
        return None
    value, unit = float(m[1]), m[2]
    return round(value * {"K": 1 / 1024, "M": 1, "G": 1024}[unit], 1)


def _memory_verdict(arm: dict, memory: dict) -> dict:
    device_self = sum(d["self"] for d in memory["devices"].values())
    host_self = (memory["host"] or {}).get("self", 0)
    # The vision encoder (mmproj) is loaded separately and is not part of
    # llama.cpp's breakdown; its file size is its weight memory.
    mmproj_mib = round(Path(arm["mmproj"]).stat().st_size / 2**20) if arm.get("mmproj") else 0
    total = device_self + host_self + mmproj_mib
    budget = round(arm["tier"] * 1024 * GPU_SHARE_OF_RAM)
    return {
        "device_self_mib": device_self,
        "host_self_mib": host_self,
        "mmproj_mib": mmproj_mib,
        "total_mib": total,
        "tier_budget_mib": budget,
        "fits_tier": total <= budget,
    }


def _papers_smallest_first() -> list[str]:
    ids = [p["paper_id"] for p in load_sample()["papers"]]
    return sorted(ids, key=lambda pid: (PARSED_ROOT / pid / "content.md").stat().st_size)


def _client_settings(defaults: dict, arm: dict, port: int) -> dict:
    keys = ("temperature", "presence_penalty", "seed", "max_tokens", "timeout", "top_p", "extra_body")
    settings = {k: arm.get(k, defaults.get(k)) for k in keys}
    settings.update(base_url=f"http://127.0.0.1:{port}/v1", model=arm["name"], max_retries=0)
    return settings


def run_paper(paper_id: str, arm_dir: Path, client, include_figures: bool) -> dict:
    paper_out = arm_dir / paper_id
    if paper_out.exists():
        shutil.rmtree(paper_out)  # never score a stale extraction.json next to a new failure
    status, error, n_formulations = "ok", None, None
    started = time.monotonic()
    try:
        result = extract_paper(paper_id, client=client, out_root=arm_dir, include_figures=include_figures)
        n_formulations = len(result.formulations)
    except Exception as e:  # recorded, not fatal: one bad paper must not end the arm
        status, error = "failed", f"{type(e).__name__}: {e}"
    raw_path = paper_out / "raw_llm_response.json"
    raw = json.loads(raw_path.read_text()) if raw_path.exists() else {}
    usage = raw.get("usage") or {}
    timings = usage.get("timings") or {}
    run = {
        "paper_id": paper_id,
        "status": status,
        "error": error,
        "n_formulations": n_formulations,
        "stop_reason": raw.get("stop_reason"),
        "images_attached": raw.get("images_attached"),
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
        # Must be 0: a nonzero value means part of the prompt was served from
        # cache and the timing is not a cold read.
        "cache_n": timings.get("cache_n"),
        "prompt_per_second": round(timings["prompt_per_second"], 1) if timings.get("prompt_per_second") else None,
        "predicted_per_second": round(timings["predicted_per_second"], 2) if timings.get("predicted_per_second") else None,
        "wall_seconds": usage.get("wall_seconds") or round(time.monotonic() - started, 1),
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }
    paper_out.mkdir(parents=True, exist_ok=True)
    (paper_out / "run.json").write_text(json.dumps(run, indent=2))
    return run


def run_arm(name: str, only: str | None, redo: bool) -> None:
    defaults, arms = load_arms()
    if name not in arms:
        raise SystemExit(f"Unknown arm {name!r}; known: {', '.join(arms)}")
    arm = {"name": name, **arms[name]}
    for f in ("model_file", "mmproj"):
        if arm.get(f) and not Path(arm[f]).exists():
            raise SystemExit(f"{arm[f]} not found -- download it first (see experiments/local_llm/RESEARCH.md)")
    port = defaults.get("port", 8080)
    if _server_up(port):
        raise SystemExit(f"Something is already serving on port {port}; stop it first (pkill -f llama-server)")

    arm_dir = BENCH_ROOT / name
    arm_dir.mkdir(parents=True, exist_ok=True)
    log_file = arm_dir / "server.log"
    log_file.unlink(missing_ok=True)
    cmd = server_command(arm, port, log_file)
    version = subprocess.run(["llama-server", "--version"], capture_output=True, text=True)
    version_line = next((l for l in (version.stdout + version.stderr).splitlines() if l.startswith("version")), "")

    papers = [only] if only else _papers_smallest_first()
    print(f"[{name}] {arm.get('question', '')}\n[{name}] starting: {' '.join(cmd)}", flush=True)
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    runs: list[dict] = []
    memory = {}
    try:
        deadline = time.monotonic() + HEALTH_TIMEOUT_S
        while not _server_up(port):
            if proc.poll() is not None:
                raise SystemExit(f"llama-server exited with code {proc.returncode} while loading; see {log_file}")
            if time.monotonic() > deadline:
                raise SystemExit(f"llama-server not healthy after {HEALTH_TIMEOUT_S}s; see {log_file}")
            time.sleep(1)
        props = _get_json(f"http://127.0.0.1:{port}/props")
        n_ctx = props["default_generation_settings"]["n_ctx"]
        if n_ctx < arm["ctx"]:
            raise SystemExit(f"server allocated n_ctx={n_ctx}, arm needs {arm['ctx']}: refusing to run")
        if arm["include_figures"] and not (props.get("modalities") or {}).get("vision"):
            raise SystemExit("arm attaches figures but the server has no vision support (missing --mmproj?)")
        memory = parse_memory(log_file.read_text(errors="replace"))
        verdict = _memory_verdict(arm, memory) if memory["devices"] else {}
        print(f"[{name}] n_ctx={n_ctx}  memory: {verdict}", flush=True)

        client = build_llm_client(arm["provider"], _client_settings(defaults, arm, port))
        for i, pid in enumerate(papers, 1):
            existing = arm_dir / pid / "run.json"
            if existing.exists() and not redo and json.loads(existing.read_text())["status"] == "ok":
                runs.append(json.loads(existing.read_text()))
                print(f"[{name}] {i}/{len(papers)} {pid}: already done, skipping (--redo to force)", flush=True)
                continue
            run = run_paper(pid, arm_dir, client, arm["include_figures"])
            runs.append(run)
            print(
                f"[{name}] {i}/{len(papers)} {pid}: {run['status']}  {run['n_formulations']} formulations  "
                f"{run['wall_seconds']}s  in={run['prompt_tokens']} out={run['completion_tokens']}  "
                f"decode={run['predicted_per_second']} tok/s  {run['error'] or ''}",
                flush=True,
            )
            if proc.poll() is not None:
                print(f"[{name}] llama-server died (code {proc.returncode}); stopping the arm", flush=True)
                break
        footprint = peak_footprint_mib(proc.pid)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            proc.kill()

    arm_record = {
        "arm": arm,
        "server_command": cmd,
        "llama_cpp": version_line,
        "memory_breakdown_mib": memory,
        "memory": _memory_verdict(arm, memory) if memory.get("devices") else None,
        "peak_footprint_mib": footprint,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "papers": [r["paper_id"] for r in runs],
    }
    (arm_dir / "arm.json").write_text(json.dumps(arm_record, indent=2))
    if not only:
        print(format_summary(score_run(arm_dir)), flush=True)


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m pipeline.experiments.run_local_llm_benchmark")
    ap.add_argument("--arm", help="Arm name from experiments/local_llm/arms.yaml")
    ap.add_argument("--only", help="Run a single paper_id (for debugging)")
    ap.add_argument("--redo", action="store_true", help="Re-run papers that already succeeded")
    ap.add_argument("--score-only", action="store_true", help="Re-score saved extractions; no server, no LLM calls")
    ap.add_argument("--list", action="store_true", help="List the arms and exit")
    args = ap.parse_args()

    if args.list:
        _, arms = load_arms()
        for name, a in arms.items():
            print(f"{name:24s} {a['tier']:>2} GB  figures={str(a['include_figures']):5s}  {a.get('question', '')}")
        return
    if not args.arm:
        ap.error("--arm is required (or --list)")
    if args.score_only:
        print(format_summary(score_run(BENCH_ROOT / args.arm)))
        return
    run_arm(args.arm, args.only, args.redo)


if __name__ == "__main__":
    main()
