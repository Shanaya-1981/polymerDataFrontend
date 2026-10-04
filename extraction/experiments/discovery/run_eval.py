"""How many of the dataset's papers does discover.py find?

    .venv/bin/python experiments/discovery/run_eval.py              # both scenarios, 5 minutes each
    .venv/bin/python experiments/discovery/run_eval.py --budget 120

The 63 papers behind data/_Cleaned_Final_Data_6_2_2020.csv that OpenAlex
knows are the answer key. Two scenarios, as a user would search:
  keywords   keywords and features only
  seeds      the same, plus 5 of the 63 as papers you have (fixed draw);
             scored on the other 58
Each run's list goes to runs/<scenario>.json and the scores to results.json.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import sys
import time
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
EXTRACTION = HERE.parents[1]
sys.path.insert(0, str(EXTRACTION))

from discover import discover  # noqa: E402

KEYWORDS = "solid polymer electrolyte ionic conductivity lithium salt"
FEATURES = ["Polymer", "Anion", "salt concentration", "Tg", "ionic conductivity", "transference number"]
SEEDS = 5


def answer_key() -> dict[str, str]:
    """OpenAlex id -> DOI for the dataset's papers."""
    rows = csv.DictReader(open(EXTRACTION / "data/_Cleaned_Final_Data_6_2_2020.csv", encoding="utf-8", errors="replace"))
    dois = sorted({r["DOI"].strip().lower().removeprefix("https://doi.org/") for r in rows if r["DOI"].strip()})
    key = {}
    for i in range(0, len(dois), 40):
        data = requests.get("https://api.openalex.org/works", params={
            "filter": "doi:" + "|".join(dois[i : i + 40]), "select": "id,doi", "per-page": 50,
            "api_key": os.environ.get("OPENALEX_API_KEY")}, timeout=60).json()
        key |= {w["id"]: w["doi"] for w in data["results"]}
    return key


def score(found: list[dict], wanted: set[str]) -> dict:
    ids = [p["openalex"] for p in found]
    at = lambda k: sum(i in wanted for i in ids[:k])  # noqa: E731
    return {"listed": len(ids), "wanted": len(wanted), "found": at(len(ids)),
            "top50": at(50), "top100": at(100), "top200": at(200)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--budget", type=float, default=300)
    args = ap.parse_args()

    key = answer_key()
    seeds = random.Random(0).sample(sorted(key), SEEDS)
    scenarios = {"keywords": [], "seeds": [key[s] for s in seeds]}
    (HERE / "runs").mkdir(exist_ok=True)
    results = {"keywords": KEYWORDS, "features": FEATURES, "budget": args.budget, "seed_dois": [key[s] for s in seeds]}
    for name, given in scenarios.items():
        start = time.monotonic()
        found = discover(KEYWORDS, given, FEATURES, args.budget)
        seconds = round(time.monotonic() - start)
        (HERE / "runs" / f"{name}.json").write_text(json.dumps(found, indent=2, ensure_ascii=False), encoding="utf-8")
        wanted = set(key) - (set(seeds) if given else set())
        results[name] = score(found, wanted) | {"seconds": seconds}
        print(name, results[name], flush=True)
    (HERE / "results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
