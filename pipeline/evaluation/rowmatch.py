"""Pair each predicted formulation with the golden row it describes.

A golden row is one formulation (polymer + anion + salt concentration, and
comonomer ratio for copolymers). The pairing keys are exactly those, and
never temperature: the 18 `Conductivity at X C` values live inside one row.

Salt concentration is the hard key, because the paper and the golden set
often don't express it the same way. The golden set always fills
`Li:functional group`, but for many papers the curators *computed* it:
from wt% or mol% using molar masses (6ca669ae states mol%; Tominaga 2015
states "mol% ([Li+]/[EC])" while its golden rows record the same numbers as
`salt wt%`). A model that faithfully reports what the paper printed can
therefore hold a concentration no golden field can be compared with. So a
pair is matched in one of three ways, recorded as `match_quality`:

- `direct`: some concentration field is filled on both sides and agrees
  within CONCENTRATION_TOLERANCE (`Li:monomer` and `Li:functional group`
  are also compared across, since they coincide whenever a repeat unit has
  one functional group -- 105 of the 221 golden rows that have both).
- `rank`: concentrations exist on both sides but no field agrees -- the
  fields can't be compared, or the golden value was computed differently
  from what the paper printed -- so records are paired by *position* in
  concentration order within the same anion (lowest with lowest). Units
  differ but order does not. Weaker evidence; kept separate in the report,
  and a direct match always wins over it.
- `anion_only`: the prediction gives no concentration, and exactly one
  golden row has that anion, so there is nothing to confuse it with.

Anything else stays unmatched: a predicted row with no golden partner is an
extra formulation, a golden row with no partner is a missed one. Pairing is
greedy on distance, one-to-one.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pipeline.evaluation.normalize import as_number, canonical_anion, polymer_similarity

CONCENTRATION_TOLERANCE = 0.15  # relative
RANK_TOLERANCE = 0.34  # max difference in normalised concentration position (0..1)

_CONC_PAIRS = [
    ("Li:functional group", "Li:functional group"),
    ("Li:monomer", "Li:monomer"),
    ("salt wt%", "salt wt%"),
    ("Li:monomer", "Li:functional group"),
    ("Li:functional group", "Li:monomer"),
]
_CONC_FIELDS = ["Li:functional group", "Li:monomer", "salt wt%"]


@dataclass
class Match:
    pred_index: int
    gold_index: int  # position in the golden rows list, not the golden `Index` column
    distance: float
    match_quality: str  # direct | rank | anion_only


def _rel_diff(a: float, b: float) -> float:
    denom = max(abs(a), abs(b))
    return 0.0 if denom == 0 else abs(a - b) / denom


def _direct_concentration_diff(pred: dict[str, Any], gold: dict[str, Any]) -> float | None:
    diffs = []
    for pk, gk in _CONC_PAIRS:
        pv, gv = as_number(pred.get(pk)), as_number(gold.get(gk))
        if pv is not None and gv is not None:
            diffs.append(_rel_diff(pv, gv))
    return min(diffs) if diffs else None


def _concentration_key(record: dict[str, Any]) -> tuple[str, float] | None:
    for field in _CONC_FIELDS:
        v = as_number(record.get(field))
        if v is not None:
            return field, v
    return None


def _rank_positions(records: list[dict[str, Any]], indices: list[int]) -> dict[int, float]:
    """Normalised position (0..1) of each record's concentration among `indices`."""
    keyed = [(i, _concentration_key(records[i])) for i in indices]
    keyed = [(i, k[1]) for i, k in keyed if k is not None]
    keyed.sort(key=lambda t: t[1])
    n = len(keyed)
    return {i: (0.5 if n == 1 else pos / (n - 1)) for pos, (i, _) in enumerate(keyed)}


def _comonomer_penalty(pred: dict[str, Any], gold: dict[str, Any]) -> float:
    pv, gv = as_number(pred.get("Comonomer percentage")), as_number(gold.get("Comonomer percentage"))
    if pv is None or gv is None:
        return 0.0
    return min(abs(pv - gv) / 5.0, 1.0)


def match_rows(preds: list[dict[str, Any]], golds: list[dict[str, Any]]) -> list[Match]:
    """Records are dicts keyed by golden column name (extraction.json's aliases)."""
    pred_anion = [canonical_anion(p.get("Anion")) for p in preds]
    gold_anion = [canonical_anion(g.get("Anion")) for g in golds]

    # Rank positions are computed within each anion group, on each side.
    pred_rank: dict[int, float] = {}
    gold_rank: dict[int, float] = {}
    for anion in set(pred_anion) | set(gold_anion):
        pred_rank.update(_rank_positions(preds, [i for i, a in enumerate(pred_anion) if a == anion]))
        gold_rank.update(_rank_positions(golds, [j for j, a in enumerate(gold_anion) if a == anion]))
    gold_count_by_anion = {a: gold_anion.count(a) for a in set(gold_anion)}

    candidates: list[tuple[float, int, int, str]] = []
    for i, p in enumerate(preds):
        for j, g in enumerate(golds):
            if pred_anion[i] != gold_anion[j]:
                continue
            tiebreak = _comonomer_penalty(p, g) + (1.0 - polymer_similarity(p.get("Polymer"), g.get("Polymer"))) * 0.5
            direct = _direct_concentration_diff(p, g)
            if direct is not None and direct <= CONCENTRATION_TOLERANCE:
                candidates.append((direct * 5 + tiebreak, i, j, "direct"))
                continue
            # No field agrees -- either none is comparable, or the golden value
            # was computed differently from what the paper printed. Fall back
            # to concentration order. Rank distances start at 1.0, so any
            # direct match always wins over a rank match.
            if i in pred_rank and j in gold_rank:
                gap = abs(pred_rank[i] - gold_rank[j])
                if gap <= RANK_TOLERANCE:
                    candidates.append((1.0 + gap * 3 + tiebreak, i, j, "rank"))
                continue
            if _concentration_key(p) is None and gold_count_by_anion[gold_anion[j]] == 1:
                candidates.append((2.0 + tiebreak, i, j, "anion_only"))

    candidates.sort(key=lambda c: c[0])
    used_p: set[int] = set()
    used_g: set[int] = set()
    matches: list[Match] = []
    for dist, i, j, quality in candidates:
        if i in used_p or j in used_g:
            continue
        used_p.add(i)
        used_g.add(j)
        matches.append(Match(pred_index=i, gold_index=j, distance=round(dist, 4), match_quality=quality))
    return matches
