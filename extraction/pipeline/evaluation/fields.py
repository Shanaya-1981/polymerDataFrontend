"""How each of the 76 target columns is grouped and compared.

Groups exist because one blended accuracy number would hide the thing that
matters most: whether a model gets the values a paper actually *prints*
right. Several golden columns were computed or judged by the dataset's
curators rather than copied from the paper -- e.g. Tominaga 2015 reports salt
only as wt%, but its golden rows also give `Li:monomer` = 0.199513; and the
Arrhenius prefactors (up to ~1e19 S/cm for Linden 1988) are the curators' own
fits. A model that correctly leaves those blank shouldn't look worse than one
that invents them, so they are scored in their own diagnostic groups.

Every column appears in exactly one group (asserted at import), so adding a
column to the schema without deciding how to score it fails loudly.
"""

from __future__ import annotations

from pipeline.schema_columns import REPORTED_COLUMNS

CONDUCTIVITY_COLUMNS = [c for c in REPORTED_COLUMNS if c.startswith("Conductivity at ")]

GROUPS: dict[str, list[str]] = {
    # What makes a formulation *this* formulation. Also the row-matching keys.
    "identity": [
        "Polymer",
        "Anion",
        "Comonomer percentage",
        "Li:monomer",
        "Li:functional group",
        "salt wt%",
    ],
    "thermal": [
        "Tg",
        "Tg polymer without salt",
        "Tm",
        "Tm start",
        "Tm end",
        "% crystallinity",
    ],
    "conductivity": CONDUCTIVITY_COLUMNS,
    "transport": [
        "Transference number",
        "T for transference",
        "Li diffusion coefficient cm^2/s",
        "temperature for D_Li",
    ],
    "molecular_weight": ["PDI", "Polymer Mn (kDa)", "Polymer Mw (kDa)"],
    "mechanical": ["storage modulus", "T for storage mod", "youngs modulus (Mpa)", "viscosity (mPa s)"],
    "processing": ["Solvent used", "drying temp", "drying time (h)", "drying vacuum"],
    # Curator judgments about the material rather than measurements.
    "classification": ["Polymer family", "chain architecture", "crystalline?"],
    # Model fits. Some papers print their own; many golden values are the
    # curators' fits to the paper's data.
    "fits": [
        "VFT prefactor (S/cm*T^(1/2))",
        "VFT activation energy (K)",
        "VFT T0 (degC)",
        "VFT prefactor with set T0",
        "VFT activation energy with fixed T0 (K)",
        "Fixed T0 (degC)",
        "Arrhenius Ea (eV) low T",
        "Arrhenius Ea (eV) high T",
        "Arrhenius Ea (eV)",
        "Arrhenius prefactor (S/cm)",
    ],
    # Computed by the curators: diagnostic only, never in the headline.
    "curator_computed": [
        "SMILES descriptor 1",
        "SMILES descriptor 2",
        "Average functional group per monomer",
        "Arrhenius Ea (eV) low T me",
        "Arrhenius prefactor low T me (S/cm)",
        "X-ray structural data (aggregate? Distance?)",
    ],
    # Free text or identifiers: shown, never scored.
    "unscored": [
        "Polymer system Notes",
        "Transference notes",
        "VFT Notes (above temp)",
        "Arrhenius notes",
        "Notes",
        "DOI",
        "Reference",
        "Anion Smiles",
    ],
}

# Groups whose values a paper normally prints, i.e. the headline score.
HEADLINE_GROUPS = ["identity", "thermal", "conductivity", "transport", "molecular_weight"]

GROUP_OF: dict[str, str] = {c: g for g, cols in GROUPS.items() for c in cols}

_missing = [c for c in REPORTED_COLUMNS if c not in GROUP_OF]
_dupes = [c for c in REPORTED_COLUMNS if sum(c in cols for cols in GROUPS.values()) > 1]
assert not _missing and not _dupes, f"ungrouped: {_missing}; in several groups: {_dupes}"

# --- how a column is compared -------------------------------------------------

# Values spanning many orders of magnitude: compared as |log10(pred/gold)|,
# at two tolerances. 0.1 decades (~26%) is "the same number"; 0.5 decades
# (~3.2x) is "right order of magnitude", the realistic bar for a value read
# off a log-scale plot.
LOG_COLUMNS = set(CONDUCTIVITY_COLUMNS) | {
    "Li diffusion coefficient cm^2/s",
    "VFT prefactor (S/cm*T^(1/2))",
    "VFT prefactor with set T0",
    "Arrhenius prefactor (S/cm)",
    "Arrhenius prefactor low T me (S/cm)",
    "viscosity (mPa s)",
    "storage modulus",
}
LOG_TIGHT = 0.1
LOG_LOOSE = 0.5

# °C columns: absolute tolerance.
TEMPERATURE_COLUMNS = {
    "Tg",
    "Tg polymer without salt",
    "Tm",
    "Tm start",
    "Tm end",
    "T for transference",
    "T for storage mod",
    "temperature for D_Li",
    "VFT T0 (degC)",
    "Fixed T0 (degC)",
    "drying temp",
}
TEMPERATURE_TOLERANCE_C = 2.0

# Percent-scale columns: absolute tolerance in percentage points.
PERCENT_COLUMNS = {"Comonomer percentage", "salt wt%", "% crystallinity"}
PERCENT_TOLERANCE = 1.0

# Everything else numeric: relative tolerance.
RELATIVE_TOLERANCE = 0.05

# Text columns compared by vocabulary after normalisation.
CATEGORICAL_COLUMNS = {"Anion", "crystalline?", "chain architecture", "drying vacuum", "Solvent used", "Polymer family"}
# Free-form names compared fuzzily.
FUZZY_COLUMNS = {"Polymer", "SMILES descriptor 1", "SMILES descriptor 2"}
