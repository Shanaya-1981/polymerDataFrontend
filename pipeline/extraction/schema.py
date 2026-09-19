"""Pydantic extraction schema: what the LLM is asked to fill in per paper.

Built from pipeline/schema_columns.py's REPORTED_COLUMNS (the 76-column
target schema, single source of truth). Each golden-CSV column name becomes
one FormulationRecord field:
- the field's Python name is a slugified version of the column name
  (`Conductivity at 25C` -> `conductivity_at_25c`), since pydantic/Python
  field names can't contain spaces or punctuation;
- the column's *original* name is kept as the field's `alias`, so
  `model_dump(by_alias=True)` round-trips back to exactly the golden CSV's
  own column names -- this is what the evaluation harness (Milestone 6)
  will read, not the slugified names.
- the field's type (str vs float) was taken from the actual pandas dtype
  of data/golden_reported.csv (some numeric-looking columns like `Tm` and
  `drying temp` contain the literal string "none" alongside numbers in the
  real data, so they're typed as str, not float, to allow that value).

Every field is Optional with a None default: most golden-CSV cells are
blank for any given row (fill rates in the source data range from ~100%
down to well under 1% for figure-derived columns), and the LLM must be able
to say "not reported in this paper" rather than being forced to invent a
value.
"""

from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, Field, create_model

from pipeline.schema_columns import REPORTED_COLUMNS

# column name -> Python type, derived from data/golden_reported.csv dtypes.
# Only "str" and "float" appear in the real data; a column defaults to str
# if not listed here (safe default: no column that isn't purely numeric
# should be forced into float).
_FLOAT_COLUMNS: set[str] = {
    "Comonomer percentage",
    "Average functional group per monomer",
    "Li:monomer",
    "Li:functional group",
    "salt wt%",
    "Tg",
    "Tg polymer without salt",
    "Tm start",
    "Tm end",
    "% crystallinity",
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
    "storage modulus",
    "T for storage mod",
    "youngs modulus (Mpa)",
    "viscosity (mPa s)",
    "VFT prefactor (S/cm*T^(1/2))",
    "VFT activation energy (K)",
    "VFT T0 (degC)",
    "VFT prefactor with set T0",
    "VFT activation energy with fixed T0 (K)",
    "Fixed T0 (degC)",
    "Arrhenius Ea (eV) low T",
    "Arrhenius Ea (eV) high T",
    "Arrhenius Ea (eV) low T me",
    "Arrhenius prefactor low T me (S/cm)",
    "Arrhenius Ea (eV)",
    "Arrhenius prefactor (S/cm)",
    "Li diffusion coefficient cm^2/s",
    "temperature for D_Li",
    "X-ray structural data (aggregate? Distance?)",
    "PDI",
    "Polymer Mn (kDa)",
    "Polymer Mw (kDa)",
}


def slugify(column_name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", column_name.strip().lower())
    slug = re.sub(r"_+", "_", slug).strip("_")
    if slug and slug[0].isdigit():
        slug = f"f_{slug}"
    return slug


FIELD_NAME_TO_COLUMN: dict[str, str] = {slugify(c): c for c in REPORTED_COLUMNS}
assert len(FIELD_NAME_TO_COLUMN) == len(REPORTED_COLUMNS), "slugify() produced a field-name collision"


def _build_formulation_record() -> type[BaseModel]:
    fields: dict[str, tuple[type, Field]] = {}
    for column in REPORTED_COLUMNS:
        field_name = slugify(column)
        field_type = float if column in _FLOAT_COLUMNS else str
        fields[field_name] = (
            field_type | None,
            Field(default=None, alias=column),
        )
    model = create_model(
        "FormulationRecord",
        __config__=ConfigDict(populate_by_name=True, extra="forbid"),
        **fields,
    )
    return model


FormulationRecord = _build_formulation_record()


class PaperExtractionResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    paper_id: str
    formulations: list[FormulationRecord] = Field(
        description=(
            "One entry per distinct formulation reported in the paper "
            "(a formulation = one specific polymer + salt + concentration "
            "combination). Most papers report several -- e.g. the same "
            "polymer at multiple salt loadings, or multiple anions."
        )
    )
