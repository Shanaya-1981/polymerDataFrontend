"""Map each parsed paper to its rows in the golden dataset.

The golden CSV has no join key to `papers/*.pdf`: its papers are identified
by `DOI` and a free-text `Reference`, while our papers are identified by a
hash-prefixed filename (`bdf71b01-linden1988.pdf`). This module proposes the
match and records the evidence for it in `data/paper_mapping.csv`, which is
the file every later scoring run reads.

Two rules, in order:
1. DOI-named files (`6ca669ae-10.1016@0167-27389290292-W.pdf`): the filename
   is the DOI with `/` written as `@` and brackets dropped, so both sides are
   compared with everything but letters and digits removed.
2. `{surname}{year}` files: the golden `Reference` must contain the surname
   as a whole word and the year.

A paper matching zero or several golden papers is a hard error -- a wrong
mapping would silently score a model against another paper's data.

Each match is then checked against the paper itself: the evidence column
records which of the golden reference's DOI, page range or volume actually
appear in the first page of the paper's parsed text. A match with no such
evidence is flagged, not written silently.

Run from the project root:
    .venv/bin/python -m pipeline.evaluation.mapping
"""

from __future__ import annotations

import csv
import re
from pathlib import Path

import pandas as pd

from pipeline.experiments.select_sample import load_sample

GOLDEN_CSV = Path("data/golden_reported.csv")
MAPPING_CSV = Path("data/paper_mapping.csv")
PARSED_ROOT = Path("output/parsed")

_AUTHOR_YEAR_RE = re.compile(r"^([a-z]+)((?:19|20)\d{2})$")
# First-page text long enough to include the journal line and DOI, short
# enough not to reach the paper's own reference list.
_FIRST_PAGE_CHARS = 3000

# Evidence read off the paper by hand, for papers whose first page doesn't
# carry the citation. Used only when the automatic check finds nothing.
_HAND_CHECKED_EVIDENCE = {
    "5feba0f9": (
        "hand-checked: author line 'C. D. Robitaille and D. Fauteux' (content.md line 57), "
        "running headers 'J. Electrochem. Soc.' and 'Vol. 133, No. 2'. Page 1 of the PDF "
        "opens with the end of the previous article in the issue (Pt/NIGT membranes)"
    ),
}

FIELDS = ["paper_id", "filename", "golden_doi", "golden_reference", "golden_rows", "match_rule", "evidence"]


def _alnum(s: str) -> str:
    return re.sub(r"[^0-9a-z]", "", s.lower())


def _bare_doi(doi: str) -> str:
    return re.sub(r"^https?://(dx\.)?doi\.org/", "", doi.strip())


def load_golden() -> pd.DataFrame:
    return pd.read_csv(GOLDEN_CSV, low_memory=False)


def golden_papers(golden: pd.DataFrame) -> pd.DataFrame:
    """One row per golden paper: DOI, Reference, number of formulation rows."""
    return golden.groupby(["DOI", "Reference"], dropna=False).size().reset_index(name="rows")


def _candidates(filename: str, papers: pd.DataFrame) -> tuple[pd.DataFrame, str]:
    rest = Path(filename).stem.split("-", 1)[1]
    m = _AUTHOR_YEAR_RE.match(rest)
    if m:
        surname, year = m.groups()
        ref = papers["Reference"].astype(str)
        hit = ref.str.contains(rf"\b{surname}\b", case=False, regex=True) & ref.str.contains(rf"\b{year}\b", regex=True)
        return papers[hit], f"surname+year ({surname} {year})"
    key = _alnum(rest.replace("@", "/"))
    hit = papers["DOI"].astype(str).map(lambda d: _alnum(_bare_doi(d)) == key)
    return papers[hit], "doi (from filename)"


def _evidence(paper_id: str, doi: str, reference: str) -> str:
    """What in the paper's own first page confirms this golden reference."""
    md_path = PARSED_ROOT / paper_id / "content.md"
    head = md_path.read_text(encoding="utf-8")[:_FIRST_PAGE_CHARS]
    flat = re.sub(r"\s+", " ", head)
    found = []
    bare = _bare_doi(doi)
    if bare and bare.lower() in flat.lower():
        found.append(f"DOI {bare}")
    # Page ranges like 994-1000, A3133-A3136, 5759-5769 (any dash style).
    for first, last in re.findall(r"\b([A-Z]?\d{3,6})\s*[-–—−]\s*([A-Z]?\d{2,6})\b", reference):
        if re.search(rf"\b{re.escape(first)}\s*[-–—−]\s*{re.escape(last)}\b", flat):
            found.append(f"pages {first}-{last}")
    return "; ".join(found)


def build_mapping() -> list[dict]:
    papers = golden_papers(load_golden())
    rows = []
    for p in load_sample()["papers"]:
        hits, rule = _candidates(p["filename"], papers)
        if len(hits) != 1:
            raise ValueError(
                f"{p['filename']}: {len(hits)} golden papers match rule '{rule}' "
                f"(need exactly 1): {hits['Reference'].tolist()}"
            )
        hit = hits.iloc[0]
        rows.append(
            {
                "paper_id": p["paper_id"],
                "filename": p["filename"],
                "golden_doi": hit["DOI"],
                "golden_reference": hit["Reference"],
                "golden_rows": int(hit["rows"]),
                "match_rule": rule,
                "evidence": _evidence(p["paper_id"], hit["DOI"], hit["Reference"])
                or _HAND_CHECKED_EVIDENCE.get(p["paper_id"], ""),
            }
        )
    return rows


def load_mapping(path: Path = MAPPING_CSV) -> dict[str, dict]:
    if not path.exists():
        raise FileNotFoundError(f"{path} does not exist -- run `python -m pipeline.evaluation.mapping` first")
    with open(path, newline="", encoding="utf-8") as f:
        return {row["paper_id"]: row for row in csv.DictReader(f)}


def golden_rows_for(paper_id: str, mapping: dict[str, dict], golden: pd.DataFrame) -> pd.DataFrame:
    doi = mapping[paper_id]["golden_doi"]
    return golden[golden["DOI"] == doi]


def main() -> None:
    rows = build_mapping()
    with open(MAPPING_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {MAPPING_CSV} ({len(rows)} papers)\n")
    for r in rows:
        flag = "" if r["evidence"] else "   <-- NO EVIDENCE ON FIRST PAGE: check by hand"
        print(f"{r['paper_id']}  {r['golden_rows']:3d} rows  [{r['match_rule']}]  evidence: {r['evidence'] or '-'}{flag}")
        print(f"          {r['golden_reference'][:110]}")


if __name__ == "__main__":
    main()
