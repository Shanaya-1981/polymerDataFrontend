"""Turn a model's spelling and the golden set's spelling of the same thing
into the same string before comparing them.

The golden set uses short, consistent vocabularies (12 anions, 14 solvents,
24 polymer families). A model reading the paper writes what the paper
writes: "LiTFSI", "Li(CF3SO2)2N", "bis(trifluoromethanesulfonyl)imide". An
exact string comparison would score all of those wrong, and that would
measure spelling, not extraction.
"""

from __future__ import annotations

import math
import re
from typing import Any

from rapidfuzz import fuzz

# Canonical golden spelling -> other spellings, each pre-normalised by
# `_squash` (lowercase, no whitespace/dashes/charges).
_ANION_ALIASES: dict[str, list[str]] = {
    "TFSI": [
        "tfsi", "tfsa", "ntf2", "tf2n", "n(so2cf3)2", "n(cf3so2)2", "(cf3so2)2n", "(so2cf3)2n",
        # the trailing "2" dropped, as Qwen3.5-4B wrote it on 0a3655ba
        "n(cf3so2)", "n(so2cf3)",
        "bis(trifluoromethanesulfonyl)imide", "bis(trifluoromethylsulfonyl)imide",
        "bis(trifluoromethane)sulfonimide", "bistrifluoromethanesulfonimide", "imide",
    ],
    "CF3SO3": ["cf3so3", "so3cf3", "triflate", "otf", "trifluoromethanesulfonate", "trifluoromethylsulfonate"],
    "ClO4": ["clo4", "perchlorate"],
    "BF4": ["bf4", "tetrafluoroborate"],
    "PF6": ["pf6", "hexafluorophosphate"],
    "AsF6": ["asf6", "hexafluoroarsenate"],
    "AlCl4": ["alcl4", "tetrachloroaluminate"],
    "MPSA": ["mpsa"],
    "N(SO2C2F5)2": [
        "n(so2c2f5)2", "n(c2f5so2)2", "(c2f5so2)2n", "beti",
        "bis(pentafluoroethanesulfonyl)imide", "bis(perfluoroethylsulfonyl)imide",
    ],
    "I": ["i", "iodide"],
    "SCN": ["scn", "thiocyanate"],
    "FSI": ["fsi", "fsa", "n(so2f)2", "(fso2)2n", "bis(fluorosulfonyl)imide"],
}
_ANION_LOOKUP = {alias: canon for canon, aliases in _ANION_ALIASES.items() for alias in aliases}

_SOLVENT_ALIASES: dict[str, list[str]] = {
    "acetonitrile": ["acetonitrile", "acn", "mecn", "ch3cn"],
    "methanol": ["methanol", "meoh"],
    "thf": ["thf", "tetrahydrofuran"],
    "none": ["none", "solventfree", "nosolvent", "meltprocessed", "hotpressed"],
    "nmp": ["nmp", "nmethyl2pyrrolidone", "nmethylpyrrolidone", "nmethylpyrrolidinone"],
    "benzene": ["benzene"],
    # The golden set itself uses both names for this one solvent.
    "acetone": ["acetone", "dimethylketone"],
    "dimethoxyethane": ["dimethoxyethane", "dme", "12dimethoxyethane"],
    "dmf": ["dmf", "dimethylformamide", "nndimethylformamide"],
    "dimethylcarbonate": ["dimethylcarbonate", "dmc"],
    "dmso": ["dmso", "dimethylsulfoxide", "dimethylsulphoxide"],
    "chloroform": ["chloroform", "chcl3"],
    "water": ["water", "h2o"],
}
_SOLVENT_LOOKUP = {alias: canon for canon, aliases in _SOLVENT_ALIASES.items() for alias in aliases}

# Common polymer abbreviations -> the squashed full name, so "PEO" and
# "poly(ethylene oxide)" compare equal.
_POLYMER_ABBREVIATIONS = {
    "peo": "polyethyleneoxide",
    "pec": "polyethylenecarbonate",
    "ppo": "polypropyleneoxide",
    "ptmc": "polytrimethylenecarbonate",
    "pan": "polyacrylonitrile",
    "pmma": "polymethylmethacrylate",
    "pcl": "polycaprolactone",
    "pei": "polyethylenimine",
    "pdms": "polydimethylsiloxane",
    "pvc": "polyvinylchloride",
    "pvdf": "polyvinylidenefluoride",
}

_SUBSCRIPTS = str.maketrans("₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹", "01234567890123456789")


def is_blank(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    return isinstance(value, str) and value.strip() == ""


def as_number(value: Any) -> float | None:
    """A float for anything that is a plain number, else None ("none", text, blank)."""
    if is_blank(value) or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip())
    except ValueError:
        return None


# A number followed only by the unit the field guide already names -- "55 °C",
# "80C", "24 h". Accepted for text-typed columns that hold numbers (`Tm`,
# `drying temp`, `drying time (h)`): the unit is formatting, not a wrong value.
_NUMBER_WITH_UNIT_RE = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*(?:°\s*C|º\s*C|C|h|hr|hrs|hours?)?\s*$", re.IGNORECASE)


def as_number_with_unit(value: Any) -> float | None:
    n = as_number(value)
    if n is not None or is_blank(value):
        return n
    m = _NUMBER_WITH_UNIT_RE.match(str(value))
    return float(m[1]) if m else None


def _squash(value: Any) -> str:
    s = str(value).translate(_SUBSCRIPTS).lower()
    s = s.replace("﻿", "")
    return re.sub(r"[\s\-–—−⁻_]+", "", s)


# For finding a known spelling *inside* a longer string, longest first:
# "imide" (TFSI) is a substring of "bis(fluorosulfonyl)imide" (FSI). Aliases
# under 3 characters ("i", "tf") would match almost anything and are only
# ever matched whole.
_ANION_SEARCH_ORDER = sorted((a for a in _ANION_LOOKUP if len(a) >= 3), key=len, reverse=True)


def canonical_anion(value: Any) -> str | None:
    """Golden spelling of an anion, however the model wrote it.

    Handles "LiTFSI", "Li(CF3SO2)2N" and the code-plus-name form
    "TFSI (bis(trifluoromethanesulfonyl)imide)" -- the form the pre-existing
    4-paper fixture uses, which made every one of its rows unmatchable before
    this function looked past the first token.
    """
    if is_blank(value):
        return None
    s = _squash(value)
    head = s.split("(", 1)[0] if not s.startswith("(") else s
    for candidate in (s, head):
        for c in (candidate, candidate.removeprefix("lithium"), candidate.removeprefix("li")):
            if c in _ANION_LOOKUP:
                return _ANION_LOOKUP[c]
    for alias in _ANION_SEARCH_ORDER:
        if alias in s:
            return _ANION_LOOKUP[alias]
    return s  # unknown spelling: compared as-is, so it can still match itself


def canonical_solvent(value: Any) -> str | None:
    if is_blank(value):
        return None
    s = re.sub(r"[^0-9a-z]", "", _squash(value))
    return _SOLVENT_LOOKUP.get(s, s)


def canonical_text(value: Any) -> str | None:
    if is_blank(value):
        return None
    return re.sub(r"\s+", " ", str(value).replace("﻿", "")).strip().lower().rstrip(".")


def canonical_family(value: Any) -> frozenset[str] | None:
    """`carbonate, ether`, `ether, carbonate` and `polyether, polycarbonate`
    are the same family: the golden set names the functional group, a model
    often names the polymer class."""
    text = canonical_text(value)
    if text is None:
        return None
    parts = (p.strip() for p in re.split(r"[,;/]| and ", text))
    return frozenset(re.sub(r"s$", "", p.removeprefix("poly").strip()) for p in parts if p)


# Small fixed vocabularies: golden term -> words that mean it. A prediction
# that names exactly one term ("linear homopolymer", "high vacuum",
# "amorphous") is snapped to it; anything ambiguous is compared as written.
_VOCABULARIES: dict[str, dict[str, list[str]]] = {
    "chain architecture": {
        "linear": ["linear"],
        "branched": ["branched", "comb", "graft", "brush", "star", "hyperbranched"],
        "cross-linked": ["cross-linked", "crosslinked", "cross linked", "network"],
    },
    "crystalline?": {
        "yes": ["yes", "crystalline", "semicrystalline", "semi-crystalline", "true"],
        "no": ["no", "amorphous", "false"],
        "na": ["na", "n/a", "not applicable"],
    },
    "drying vacuum": {
        "high": ["high", "high vacuum"],
        "yes": ["yes", "vacuum", "under vacuum", "in vacuo", "true"],
        "none": ["none", "no", "false", "no vacuum"],
    },
}


def canonical_vocab(column: str, value: Any) -> str | None:
    text = canonical_text(value)
    if text is None or column not in _VOCABULARIES:
        return text
    hits = set()
    for term, words in _VOCABULARIES[column].items():
        for w in words:
            if re.search(rf"(?<![\w-]){re.escape(w)}(?![\w-])", text):
                hits.add(term)
    # "high vacuum" also contains "vacuum": prefer the more specific term.
    if hits == {"high", "yes"}:
        hits = {"high"}
    return hits.pop() if len(hits) == 1 else text


def _squash_polymer(value: Any) -> str:
    s = re.sub(r"[^0-9a-z]", "", _squash(value))
    return _POLYMER_ABBREVIATIONS.get(s, s)


def polymer_similarity(a: Any, b: Any) -> float:
    """0..1 similarity of two polymer names after normalisation."""
    if is_blank(a) or is_blank(b):
        return 0.0
    sa, sb = _squash_polymer(a), _squash_polymer(b)
    if sa == sb:
        return 1.0
    return fuzz.ratio(sa, sb) / 100.0


POLYMER_MATCH_THRESHOLD = 0.85


def canonical_smiles(value: Any) -> str | None:
    if is_blank(value):
        return None
    try:
        from rdkit import Chem, RDLogger

        RDLogger.DisableLog("rdApp.*")
        mol = Chem.MolFromSmiles(str(value).strip())
        return Chem.MolToSmiles(mol) if mol is not None else str(value).strip()
    except ImportError:
        return str(value).strip()
