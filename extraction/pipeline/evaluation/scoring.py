"""Compare one predicted value with one golden value.

Every cell gets exactly one outcome:

- `correct`  both filled and they agree (within the column's tolerance)
- `near`     log-scale columns only: within LOG_LOOSE decades but not LOG_TIGHT
             -- right order of magnitude, the realistic bar for a plot reading
- `wrong`    both filled and they disagree
- `missing`  golden filled, prediction blank
- `extra`    golden blank, prediction filled. Not necessarily wrong -- the
             golden set leaves blank many values papers do report -- so it is
             counted, never scored against the model
- `blank`    both blank; ignored

Accuracy is always over cells the golden set fills, so a model is never
rewarded for leaving things blank and never penalised for values the golden
set doesn't have.
"""

from __future__ import annotations

import math
from typing import Any

from pipeline.evaluation.fields import (
    CATEGORICAL_COLUMNS,
    FUZZY_COLUMNS,
    LOG_COLUMNS,
    LOG_LOOSE,
    LOG_TIGHT,
    PERCENT_COLUMNS,
    PERCENT_TOLERANCE,
    RELATIVE_TOLERANCE,
    TEMPERATURE_COLUMNS,
    TEMPERATURE_TOLERANCE_C,
)
from pipeline.evaluation.normalize import (
    POLYMER_MATCH_THRESHOLD,
    as_number,
    as_number_with_unit,
    canonical_anion,
    canonical_family,
    canonical_smiles,
    canonical_solvent,
    canonical_text,
    canonical_vocab,
    is_blank,
    polymer_similarity,
)

OUTCOMES = ["correct", "near", "wrong", "missing", "extra", "blank"]


def _compare_numbers(column: str, pred: float, gold: float) -> str:
    if column in LOG_COLUMNS:
        if pred <= 0 or gold <= 0:
            # A zero or negative value on a log-scale column is not a reading
            # (golden conductivities are all positive); only exact agreement
            # counts.
            return "correct" if pred == gold else "wrong"
        decades = abs(math.log10(pred) - math.log10(gold))
        if decades <= LOG_TIGHT:
            return "correct"
        return "near" if decades <= LOG_LOOSE else "wrong"
    if column in TEMPERATURE_COLUMNS:
        return "correct" if abs(pred - gold) <= TEMPERATURE_TOLERANCE_C else "wrong"
    if column in PERCENT_COLUMNS:
        return "correct" if abs(pred - gold) <= PERCENT_TOLERANCE else "wrong"
    denom = max(abs(gold), 1e-12)
    return "correct" if abs(pred - gold) / denom <= RELATIVE_TOLERANCE else "wrong"


def _compare_text(column: str, pred: Any, gold: Any) -> str:
    if column == "Anion":
        same = canonical_anion(pred) == canonical_anion(gold)
    elif column == "Solvent used":
        same = canonical_solvent(pred) == canonical_solvent(gold)
    elif column == "Polymer family":
        same = canonical_family(pred) == canonical_family(gold)
    elif column == "Polymer":
        same = polymer_similarity(pred, gold) >= POLYMER_MATCH_THRESHOLD
    elif column in ("SMILES descriptor 1", "SMILES descriptor 2"):
        same = canonical_smiles(pred) == canonical_smiles(gold)
    elif column in ("chain architecture", "crystalline?", "drying vacuum"):
        same = canonical_vocab(column, pred) == canonical_vocab(column, gold)
    else:
        same = canonical_text(pred) == canonical_text(gold)
    return "correct" if same else "wrong"


def compare_cell(column: str, pred: Any, gold: Any) -> str:
    pred_blank, gold_blank = is_blank(pred), is_blank(gold)
    if pred_blank and gold_blank:
        return "blank"
    if gold_blank:
        return "extra"
    if pred_blank:
        return "missing"
    if column in CATEGORICAL_COLUMNS or column in FUZZY_COLUMNS:
        return _compare_text(column, pred, gold)
    # Numeric columns -- and text-typed columns holding numbers, such as
    # `Tm` ("55" or "none") and `drying temp` ("60").
    pn, gn = as_number_with_unit(pred), as_number_with_unit(gold)
    if pn is not None and gn is not None:
        return _compare_numbers(column, pn, gn)
    if pn is None and gn is None:
        return _compare_text(column, pred, gold)
    return "wrong"  # a number against a word ("none" vs 55)
