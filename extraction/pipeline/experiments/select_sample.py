"""Pick -- once -- the fixed benchmark sample used by tier experiments.

The sample is *pinned*: it is written to `sample.json` on first run and then
reused verbatim by every later experiment. That is the whole point. If each
experiment re-sampled, a difference between two runs could come from the
change being tested or from the papers happening to be easier that time, and
there would be no way to tell which. Re-running this module against an
existing `sample.json` therefore prints it and exits without touching it;
`--resample` is required to overwrite, and should be a deliberate act that
invalidates comparability with every result recorded before it.

Stratification: the corpus spans 1984-2020, and the tiers are expected to
diverge most on old scanned/OCR-unfriendly papers -- that was the observation
that motivated switching the pipeline to `advanced` in the first place. A
uniform random draw from 63 papers (18 old, 45 modern) would return ~1.4 old
papers on average and could easily return zero, so the comparison would be
uninformative exactly where it matters. Sampling 5 from each stratum
guarantees coverage of both regimes; it deliberately over-weights old papers
relative to the corpus, so per-stratum numbers are the meaningful ones and a
pooled "average over 10 papers" is not a corpus-wide estimate.

Run from the project root:
    .venv/bin/python -m pipeline.experiments.select_sample
"""

from __future__ import annotations

import argparse
import json
import random
import re
from datetime import datetime, timezone
from pathlib import Path

from pipeline.paper_id import paper_id_from_path

PAPERS_DIR = Path("papers")
EXPERIMENT_ROOT = Path("experiments/tier_comparison")
SAMPLE_JSON = EXPERIMENT_ROOT / "sample.json"

# Fixed so the draw is reproducible from the seed alone -- anyone can re-run
# this and confirm the recorded sample is what the stated rule actually
# produces, rather than having to trust the JSON file.
SEED = 20260921

# "Old" = published before this year. 1995 splits the corpus 18/45 and sits
# at the rough transition from scanned-typescript reproductions to
# born-digital PDFs in this particular set of journals.
MODERN_FROM_YEAR = 1995
N_PER_STRATUM = 5

# Most filenames are `{hash}-{surname}{year}.pdf`.
_AUTHOR_YEAR_RE = re.compile(r"^[a-z]+((?:19|20)\d{2})$")

# The four DOI-named files encode no author-year, and their DOI strings are
# not safe to regex for a year (`10.1016@0013-46869280115-3` contains no
# unambiguous one). These years were read off the first page of each paper's
# already-parsed text, not inferred from the DOI:
#   0a3655ba  "J. Phys. Chem. B 2004, 108, 14907-14914"
#   5ce084d6  "Electrochimica Acta, Vol. 37, No. 9, pp. 1579-1583, 1992"
#   6ca669ae  "Solid State Ionics 53-56 (1992) 1071-1076"
#   e1406878  2016 (only year on the first page; matches the DOI's own
#             `j.electacta.2016.12.172`)
_YEAR_OVERRIDES = {
    "0a3655ba": 2004,
    "5ce084d6": 1992,
    "6ca669ae": 1992,
    "e1406878": 2016,
}


def year_of(pdf_path: Path) -> int:
    """Publication year, or raise -- never silently guess.

    A wrong year silently moves a paper into the wrong stratum, which is the
    kind of error that never surfaces as a crash and quietly biases every
    later comparison. So an unrecognised filename is a hard failure that
    demands a verified entry in `_YEAR_OVERRIDES`.
    """
    paper_id = paper_id_from_path(pdf_path)
    if paper_id in _YEAR_OVERRIDES:
        return _YEAR_OVERRIDES[paper_id]
    rest = pdf_path.stem.split("-", 1)[1]
    m = _AUTHOR_YEAR_RE.match(rest)
    if not m:
        raise ValueError(
            f"Cannot determine a publication year for {pdf_path.name}. Read it off the "
            f"paper's first page and add it to _YEAR_OVERRIDES -- do not guess from the DOI."
        )
    return int(m.group(1))


def stratum_of(year: int) -> str:
    return "modern" if year >= MODERN_FROM_YEAR else "old"


def build_sample(papers_dir: Path = PAPERS_DIR, seed: int = SEED) -> dict:
    # sorted() before sampling: glob order is filesystem-dependent, so an
    # unsorted population would make the seed reproduce a different sample on
    # a different machine.
    pdfs = sorted(papers_dir.glob("*.pdf"))
    if not pdfs:
        raise FileNotFoundError(f"No PDFs under {papers_dir}/")

    strata: dict[str, list[Path]] = {"old": [], "modern": []}
    for pdf in pdfs:
        strata[stratum_of(year_of(pdf))].append(pdf)

    rng = random.Random(seed)
    papers = []
    strata_meta = {}
    for name in ("old", "modern"):
        population = strata[name]
        if len(population) < N_PER_STRATUM:
            raise ValueError(f"Stratum '{name}' has only {len(population)} papers, need {N_PER_STRATUM}")
        chosen = rng.sample(population, N_PER_STRATUM)
        strata_meta[name] = {
            "definition": (
                f"published >= {MODERN_FROM_YEAR}" if name == "modern" else f"published < {MODERN_FROM_YEAR}"
            ),
            "population": len(population),
            "sampled": N_PER_STRATUM,
        }
        for pdf in sorted(chosen):
            papers.append(
                {
                    "paper_id": paper_id_from_path(pdf),
                    "filename": pdf.name,
                    "year": year_of(pdf),
                    "stratum": name,
                    "pdf_size_kb": round(pdf.stat().st_size / 1024, 1),
                }
            )

    return {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "seed": seed,
        "corpus_size": len(pdfs),
        "strata": strata_meta,
        "papers": papers,
    }


def load_sample(path: Path = SAMPLE_JSON) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"{path} does not exist -- run `python -m pipeline.experiments.select_sample` first")
    return json.loads(path.read_text())


def _print_sample(sample: dict) -> None:
    print(f"seed={sample['seed']}  corpus={sample['corpus_size']}  created={sample['created_at']}")
    for name, meta in sample["strata"].items():
        print(f"  stratum {name:7s} {meta['sampled']}/{meta['population']}  ({meta['definition']})")
    for p in sample["papers"]:
        print(f"  {p['stratum']:7s} {p['year']}  {p['paper_id']}  {p['filename']}")


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m pipeline.experiments.select_sample")
    ap.add_argument(
        "--resample",
        action="store_true",
        help="Overwrite an existing sample.json. Invalidates comparability with all prior results.",
    )
    args = ap.parse_args()

    if SAMPLE_JSON.exists() and not args.resample:
        print(f"{SAMPLE_JSON} already exists -- reusing the pinned sample (pass --resample to overwrite).\n")
        _print_sample(load_sample())
        return

    sample = build_sample()
    SAMPLE_JSON.parent.mkdir(parents=True, exist_ok=True)
    SAMPLE_JSON.write_text(json.dumps(sample, indent=2) + "\n")
    print(f"Wrote {SAMPLE_JSON}\n")
    _print_sample(sample)


if __name__ == "__main__":
    main()
