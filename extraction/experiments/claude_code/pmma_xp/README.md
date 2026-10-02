# Balke & Hamielec (1973), extracted and checked

Extractions of *Bulk Polymerization of Methyl Methacrylate* (Balke & Hamielec, 1973), the
paper behind a researcher's figure of conversion (X<sub>p</sub>), M<sub>n</sub> and dispersity
(Đ) against time. Every run uses `extract_features.py` with Claude Opus 5.5. "MinerU" runs
send MinerU's text and figure crops of the paper; "PDF" runs send the PDF itself.

## Results

Scored against the paper's printed tables: Tables IV–XI for conversion (202 values) and
XII–XVIII for molecular weights (105 GPC readings × 5 = 525 values).

| Run | Features | Exactly as printed |
|---|---|---|
| `extract-page-run-cf1a75e3.json` (from the Extract page), `balke1973-extracted.csv` (the same, as CSV) | `Time (min), Cov Exp` | 202 / 202 |
| `balke1973-pdf.json` (PDF) | the same | 202 / 202 |
| `mw_mineru.csv` (MinerU) | `Time (min), Mn×10−5, Mw×10−5, Mz×10−5, Mz+1×10−5, PDI` | 525 / 525 |
| `mw_pdf.csv` (PDF) | the same | 524 / 525 |
| `repeat/conv_1..5.json` (MinerU, 5 more runs) | conversion | 202 / 202 each, identical to each other |
| `repeat/mw_1..5.csv` (MinerU, 5 more runs) | molecular weights | 524 or 525 / 525 |

The one value that varies is a misprint in the paper: Table XVII prints sample 25F's M<sub>w</sub>
as 5.64E+06, larger than its M<sub>z</sub> (1.45E+06). Runs copy it (56.4) or correct it to
5.64E+05 (5.64); across the 6 MinerU runs, 2 copied it and 4 corrected it. Every other value is
identical in every run. Table VII also prints sample 16H's time as "46.5" with no unit in a
minutes column; every run reads it as 46.5 hours, as Table VIII's matching "46.5 hr" row
suggests.

## Scripts

Run from this folder, with `uv` for the plotting ones:

- `score_runs.py RUN.json ...`: scores conversion runs against Tables IV–XI.
- `score_mw.py RUN.csv ...`: scores molecular-weight runs against Tables XII–XVIII.
- `compare_repeats.py`: compares the repeated runs with each other and with the tables.
- `run_pdf.py`, `repeat_runs.py`: make the PDF run and the repeated runs.
- `plot_xp.py`, `plot_mw.py`, `slide_figure.py`: draw the extracted values over the researcher's
  figure (`uv run --with matplotlib --with numpy python plot_xp.py --marker ^`).

**What's not in git:**
- **The researcher's figure** (`reference.png`) and every image drawn on it, because the figure may
  hold unpublished work and this repo is public. The plotting scripts need it in this folder.
- **The PDF** (`papers/balke1973.pdf` at the repo root, kept outside git).
- **MinerU's parse** (`extraction/output/parsed/fcac8200/`), which the scorers read as their answer
  key and the MinerU runs read as their input. Running `extract_features.py` on the PDF once makes it.

`table_vii_page.png`, `page_22.png` and `pages_fig2_and_tables.png` are renders of the paper's
pages with Tables IV–XI, Table XVII and Fig. 2, used to check disputed values against the scan.
