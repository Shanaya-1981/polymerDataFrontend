"""Slice the full golden dataset down to the LLM extraction target schema.

Reads data/_Cleaned_Final_Data_6_2_2020.csv (305 columns: 76 columns a paper
actually reports, plus ~230 RDKit/Mordred cheminformatics descriptors computed
from SMILES, plus a handful of derived/lookup columns -- solvent BP, approxTg,
approxMW(kDa) -- that are deterministic functions of other columns, not
independently paper-reported; see pipeline/schema_columns.py for the full
reasoning). Writes data/golden_reported.csv containing only:

    Index (bookkeeping identity column, never scored/extracted)
    + the 76 REPORTED_COLUMNS (the actual LLM extraction target / eval schema)

Run from the project root:
    .venv/bin/python -m pipeline.scripts.make_golden_reported
"""

from pathlib import Path

import pandas as pd

from pipeline.schema_columns import IDENTITY_COLUMNS, REPORTED_COLUMNS

SOURCE_CSV = Path("data/_Cleaned_Final_Data_6_2_2020.csv")
OUTPUT_CSV = Path("data/golden_reported.csv")


def main() -> None:
    df = pd.read_csv(SOURCE_CSV)

    missing = [c for c in REPORTED_COLUMNS + IDENTITY_COLUMNS if c not in df.columns]
    if missing:
        raise SystemExit(
            f"Source CSV is missing expected columns: {missing}. "
            "The schema in pipeline/schema_columns.py no longer matches "
            f"{SOURCE_CSV} -- update REPORTED_COLUMNS before proceeding."
        )

    ordered_columns = IDENTITY_COLUMNS + REPORTED_COLUMNS
    reduced = df[ordered_columns].copy()

    assert list(reduced.columns) == ordered_columns
    assert len(reduced.columns) == len(IDENTITY_COLUMNS) + 76

    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    reduced.to_csv(OUTPUT_CSV, index=False)
    print(
        f"Wrote {OUTPUT_CSV}: {len(reduced)} rows x {len(reduced.columns)} columns "
        f"({len(IDENTITY_COLUMNS)} identity + {len(REPORTED_COLUMNS)} reported)."
    )


if __name__ == "__main__":
    main()
