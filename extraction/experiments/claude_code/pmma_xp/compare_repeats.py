"""Compare repeated extractions of balke1973.pdf with each other and with the printed tables.

    python3 compare_repeats.py

Reads repeat/conv_<n>.json and repeat/mw_<n>.csv from repeat_runs.py, plus the two earlier runs
of the same route (the Extract page's conversion run and mw_mineru.csv) as run 0. Samples are
matched by the condition their name gives, since a run may word the names differently.
"""

import csv
import json
from collections import Counter
from pathlib import Path

import score_mw
import score_runs
from score_runs import condition_of

HERE = Path(__file__).resolve().parent
REPEAT = HERE / "repeat"
EARLIER_CONV = HERE / "extract-page-run-cf1a75e3.json"  # the Extract page's run (job cf1a75e3), copied from output/extractions/
EARLIER_MW = HERE / "mw_mineru.csv"


def conv_points(path: Path) -> tuple[list, list]:
    samples = json.loads(path.read_text(encoding="utf-8"))["samples"]
    names = list(samples)
    points = [(condition_of(n), p["Time (min)"], p["Cov Exp"]) for n, pts in samples.items() for p in pts]
    return names, points


def mw_points(path: Path) -> tuple[list, list]:
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    names = list(dict.fromkeys(r["sample"] for r in rows))
    cols = ["Time (min)", "Mn×10−5", "Mw×10−5", "Mz×10−5", "Mz+1×10−5", "PDI"]
    points = [(condition_of(r["sample"]), *(float(r[c]) if r[c] else None for c in cols)) for r in rows]
    return names, points


def compare(label: str, runs: dict[str, Path], read, score) -> None:
    print(f"\n== {label}")
    loaded = {run: read(path) for run, path in runs.items() if path.exists()}
    base_run = next(iter(loaded))
    base_names, base_points = loaded[base_run]
    for run, (names, points) in loaded.items():
        same_values = Counter(points) == Counter(base_points)
        same_order = points == base_points
        same_names = names == base_names
        print(f"  run {run}: {len(points)} points | {score(runs[run])} | vs run {base_run}: values "
              f"{'identical' if same_values else 'DIFFERENT'}, order {'same' if same_order else 'different'}, "
              f"sample names {'same' if same_names else 'reworded'}")
        if not same_values:
            only_here = Counter(points) - Counter(base_points)
            only_base = Counter(base_points) - Counter(points)
            print(f"      only in run {run}: {list(only_here.elements())[:6]}")
            print(f"      only in run {base_run}: {list(only_base.elements())[:6]}")
    names = Counter(tuple(n) for n, _ in loaded.values())
    print(f"  distinct sets of sample names across runs: {len(names)}")
    for n, count in names.items():
        print(f"     {count} run(s): {n[:3]} ...")


if __name__ == "__main__":
    conv_key, mw_key = score_runs.answer_key(), score_mw.answer_key()

    def conv_score(path):
        r = score_runs.score(path, conv_key)
        bad = len(r["wrong_time"]) + len(r["wrong_x"]) + len(r["not_in_table"]) + len(r["unknown_sample"])
        return f"{r['exact']}/202 exactly as printed, {bad} wrong or extra, {len(r['missed'])} missed"

    def mw_score(path):
        r = score_mw.score(path, mw_key, quiet=True)
        return f"{r['values_right']}/525 values exactly as printed, {len(r['unmatched'])} extra rows, {len(r['missed'])} missed"

    n_runs = sorted(int(p.stem.split("_")[1]) for p in REPEAT.glob("conv_*.json"))
    compare("Conversion (Time (min), Cov Exp)",
            {"0": EARLIER_CONV, **{str(n): REPEAT / f"conv_{n}.json" for n in n_runs}}, conv_points, conv_score)
    m_runs = sorted(int(p.stem.split("_")[1]) for p in REPEAT.glob("mw_*.csv"))
    compare("Molecular weights (Mn×10−5 ... PDI)",
            {"0": EARLIER_MW, **{str(n): REPEAT / f"mw_{n}.csv" for n in m_runs}}, mw_points, mw_score)
