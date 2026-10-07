"""Run the same extraction of balke1973.pdf several times, to see whether the answers repeat.

    ../../../.venv/bin/python repeat_runs.py        # 5 runs of each feature list, 2 at a time

The pipeline's normal route: MinerU's saved parse (text + figures), then one Claude Opus 5.5 call.
Writes repeat/conv_<n>.json (conversion) and repeat/mw_<n>.csv (molecular weights), and a
line per run to repeat/runs.log. Compare them with compare_repeats.py.
"""

import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parents[2])]  # extraction/, for extract_features

from extract_features import extract_features, write_csv  # noqa: E402

PDF = HERE.parents[3] / "papers" / "balke1973.pdf"
CONV = ["Time (min)", "Cov Exp"]
MW = ["Time (min)", "Mn×10−5", "Mw×10−5", "Mz×10−5", "Mz+1×10−5", "PDI"]
RUNS, AT_ONCE = 5, 2
OUT = HERE / "repeat"
OUT.mkdir(exist_ok=True)


def one(kind: str, n: int) -> str:
    features = CONV if kind == "conv" else MW
    started = time.time()
    samples = extract_features(PDF, features, model="claude-opus-5-5")
    seconds = time.time() - started
    if kind == "conv":
        (OUT / f"conv_{n}.json").write_text(json.dumps({"features": features, "samples": samples}, ensure_ascii=False, indent=1), encoding="utf-8")
    else:
        with open(OUT / f"mw_{n}.csv", "w", newline="", encoding="utf-8") as f:
            write_csv(samples, features, f)
    line = f"{kind} run {n}: {sum(map(len, samples.values()))} points in {len(samples)} samples, {seconds:.0f} s"
    with open(OUT / "runs.log", "a", encoding="utf-8") as log:
        log.write(line + "\n")
    return line


if __name__ == "__main__":
    import os
    os.chdir(HERE.parents[2])  # the parse step's paths are relative to extraction/
    jobs = [(kind, n) for n in range(1, RUNS + 1) for kind in ("conv", "mw")]
    with ThreadPoolExecutor(max_workers=AT_ONCE) as pool:
        futures = {pool.submit(one, kind, n): (kind, n) for kind, n in jobs}
        for future in as_completed(futures):
            kind, n = futures[future]
            try:
                print(future.result(), flush=True)
            except Exception as e:  # keep the other runs going; report this one
                print(f"{kind} run {n} FAILED: {e}", flush=True)
                with open(OUT / "runs.log", "a", encoding="utf-8") as log:
                    log.write(f"{kind} run {n} FAILED: {e}\n")
