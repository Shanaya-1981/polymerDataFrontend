"""Shared definition of the LLM extraction target schema.

The golden dataset (data/_Cleaned_Final_Data_6_2_2020.csv) has 305 columns, but
only these 76 are things a paper actually reports. The rest (Comonomer1/2 *,
anion * -- Mordred/RDKit descriptors; solvent BP, approxTg, approxMW(kDa),
Index -- deterministic lookups/derived values) are out of scope for the LLM
and are computed in a later post-processing step instead. See the plan doc
for the empirical verification behind this split.

This is the single source of truth for the schema: both the golden-CSV
slicing script (make_golden_reported.py) and the pydantic extraction schema
(extraction/schema.py, Milestone 4) import REPORTED_COLUMNS from here so the
two never drift apart.
"""

REPORTED_COLUMNS: list[str] = [
    "Polymer system Notes",
    "Polymer family",
    "Polymer",
    "SMILES descriptor 1",
    "SMILES descriptor 2",
    "Comonomer percentage",
    "Average functional group per monomer",
    "Anion",
    "Li:monomer",
    "Li:functional group",
    "salt wt%",
    "Tg",
    "Tg polymer without salt",
    "Tm",
    "Tm start",
    "Tm end",
    "% crystallinity",
    "crystalline?",
    "Conductivity at 0C",
    "Conductivity at 15C",
    "Conductivity at 20C",
    "Conductivity at 21C",
    "Conductivity at 25C",
    "Conductivity at 27C",
    "Conductivity at 30C",
    "Conductivity at 35C",
    "Conductivity at 40C",
    "Conductivity at 45C",
    "Conductivity at 50C",
    "Conductivity at 55C",
    "Conductivity at 60C",
    "Conductivity at 65C",
    "Conductivity at 70C",
    "Conductivity at 75C",
    "Conductivity at 80C",
    "Conductivity at 85C",
    "Conductivity at 90C",
    "Conductivity at 100C",
    "Conductivity at 110C",
    "Conductivity at 125C",
    "Transference number",
    "T for transference",
    "Transference notes",
    "storage modulus",
    "T for storage mod",
    "youngs modulus (Mpa)",
    "viscosity (mPa s)",
    "VFT prefactor (S/cm*T^(1/2))",
    "VFT activation energy (K)",
    "VFT T0 (degC)",
    "VFT Notes (above temp)",
    "VFT prefactor with set T0",
    "VFT activation energy with fixed T0 (K)",
    "Fixed T0 (degC)",
    "Arrhenius Ea (eV) low T",
    "Arrhenius Ea (eV) high T",
    "Arrhenius Ea (eV) low T me",
    "Arrhenius prefactor low T me (S/cm)",
    "Arrhenius Ea (eV)",
    "Arrhenius prefactor (S/cm)",
    "Arrhenius notes",
    "Li diffusion coefficient cm^2/s",
    "temperature for D_Li",
    "X-ray structural data (aggregate? Distance?)",
    "PDI",
    "Polymer Mn (kDa)",
    "Polymer Mw (kDa)",
    "chain architecture",
    "Solvent used",
    "drying temp",
    "drying time (h)",
    "drying vacuum",
    "Notes",
    "DOI",
    "Reference",
    "Anion Smiles",
]

# Bookkeeping columns carried alongside the golden CSV for joining/matching
# purposes. Never an LLM extraction target, never scored.
IDENTITY_COLUMNS: list[str] = ["Index"]

assert len(REPORTED_COLUMNS) == 76, f"expected 76 columns, got {len(REPORTED_COLUMNS)}"
