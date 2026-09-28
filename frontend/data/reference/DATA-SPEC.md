# Data spec — verified against the live pedatamine.org server (2026-09-21)

Everything here was confirmed empirically. Treat these as hard requirements and assert them
in the build script.

## Source files (`data/raw/`, MIT, from github.com/nschauser/PolymerElectrolyte@main)

| file | shape | used for |
|---|---|---|
| `_Cleaned_Final_Data_6_2_2020.csv` | 655 × 305 | everything except the correlation heatmap |
| `_Cleaned_Final_Data-forML_6_2_2020.csv` | 271 × 237 | correlation heatmap only |

## 1. The 41 plottable columns already exist verbatim in the CSV

All 41 options offered by the live site's x/y/color dropdowns map 1:1 to literal CSV headers —
**including the two that look derived.** Do not recompute them:

- `approxTg` is column index **302** (441 non-null)
- `approxMW(kDa)` is column index **303**

Verified: the shipped `approxTg` equals `Tg` else `Tg polymer without salt` with **0 mismatches**
across all 655 rows, and `approxMW(kDa)` equals `Polymer Mn (kDa)` else `Polymer Mw (kDa)` with
**0 mismatches**. Assert those two rules in the build script as integrity checks, but read the
precomputed columns.

⚠️ Still true and still a trap: the scatter page uses `approxTg` (441 rows); the **temperature
page uses the raw `Tg` column only** (368 rows). They are different columns.

The exact 41 option labels and all control defaults are in `ui-controls.json`.

## 2. Numeric parsing rules

The data is cleaner than expected. The complete set of non-numeric junk is:

| token | occurrences | rule |
|---|---|---|
| `none` | 172 (across all cols; 2 inside plottable numeric cols: `drying temp`, `drying time (h)`) | → null |
| `na` | 19 (incl. all 3 `crystalline?` values are `yes`/`no`/`na`) | → null in numeric cols; a **real category** in `crystalline?` |
| `unknown atom type (Vabc/nARing/mordred.RingCount.Rings()/naRing/nBonds)` | 10, only in `anion Vabc` | → null |
| empty string | many | → null |

Everything else in numeric columns matches `^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$`.
Scientific notation is common (conductivity reaches `6.79e-11`). Trim whitespace before parsing.
Parse case-insensitively for the sentinels.

## 3. Log-axis hazard — must be handled in the UI

Non-positive values vanish on a log axis. Measured counts:

| column | n | min | max | ≤ 0 |
|---|---|---|---|---|
| `Conductivity at 60C` | 389 | 6.79e-11 | 3.34e-3 | 0 |
| **`Tg`** | 368 | −82.66 | 210 | **287** |
| `Li:functional group` | 655 | 1.67e-3 | 4 | 0 |
| `Transference number` | 80 | 0.05 | 0.8 | 0 |
| `Arrhenius Ea (eV)` | 424 | 0.126 | 3 | 0 |
| `Polymer Mw (kDa)` | 528 | 0.618 | 1.68e5 | 0 |

Tg is in °C and mostly negative, so switching a Tg axis to Log silently drops **78 %** of the
points. **Drop non-positive values (never clamp), and surface a visible notice** telling the user
how many points were hidden. The original just showed a misleadingly empty plot.

## 4. Correlation matrix — recompute it; the original is off by a constant factor

All 36 heatmap labels exist in the forML CSV. Recomputing pairwise-complete Pearson and comparing
to the live figure:

```
max|diff| = 0.003704      median|diff| = 6.4e-04
original / correct = 1.003703704 for EVERY entry (min == max, zero spread)
271/270                  = 1.003703704   ← exact match
```

The original standardized with population std (ddof=0) then took the sample covariance (ddof=1),
multiplying the whole matrix by n/(n−1) — an easy mismatch to make, and one that leaves the
*relative* structure of the matrix intact, which is why it went unnoticed.
**Compute plain Pearson; the diagonal must be exactly 1.0.**
`correlations-original.json` holds the original matrix if you want a regression comparison.

## 5. Invariants the build script must assert (fail the build on mismatch)

```
rows                              = 655
non-null conductivity cells       = 5225     (sum over the 22 temperature columns)
rows with non-null Tg             = 368
rows with non-null approxTg       = 441
distinct Anion                    = 12    Polymer family = 24    Polymer = 14→78
distinct Solvent used             = 14    crystalline?   = 3     DOI     = 65
correlation matrix                = 36×36, diagonal exactly 1.0
```
(`Polymer` = 78 distinct; no categorical column has blanks.)

Temperature columns, in order:
`0, 15, 20, 21, 25, 27, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 100, 110, 125` °C

## 6. Transform ground truth

Fixtures in `live-figure-fixtures.json`. Reference row: `polyethylene carbonate` / TFSI /
Tg = −3.0 °C, conductivity 3.98e-8 at 30 °C.

| mode | formula | x at T=30 °C | series | points |
|---|---|---|---|---|
| Arrhenius | `1000/(T+273.15)` | 3.29869 | 655 | 5225 |
| T | `T` | 30 | 655 | 5225 |
| T/Tg | `(T+273.15)/(Tg+273.15)` | 1.12215 | 368 | 3401 |
| VFT | `1000/(T−Tg+50)` | 12.04819 | 368 | 3401 |

---

## 7. Category ordering — colors must be stable under filtering

The original assigns trace order by **first appearance in the CSV**, not frequency (verified:
live order is `TFSI, N(SO2C2F5)2, BF4, ClO4, CF3SO3, …`, which is first-appearance, not the
frequency order `TFSI, CF3SO3, ClO4, BF4, …`).

We do something better, but the rule that matters is: **a category's color must never change
when the user filters.** Compute, at build time, one canonical ordered category list per
categorical column from the **full 655-row dataset**:

> sort by global frequency descending, ties broken by first appearance

Freeze that list in the generated data. Colors, the top-7 hue assignment, and the "Other"
fold are all derived from this fixed list — never from the currently visible subset.
Recomputing per filtered view would repaint surviving series on every interaction, which is a
documented anti-pattern.

## 8. Rows with no conductivity data

**36 of the 655 rows have no conductivity value at any temperature.** The original still emits
a trace for each of them (hence 655 traces for 5225 points). Skip them on the temperature page
— an empty series is not a line — but they are still real rows: they must appear in the scatter
plot where applicable and in the `/data` table. Do not drop them from the dataset.

## 9. Confirmed counts (all verified against the CSV)

```
all rows                     655        all conductivity points     5225
rows with Tg                 368        their conductivity points   3401
rows with zero conductivity   36
```

### Plottable series counts (what actually reaches a chart)

The counts above are *rows considered*. Rows with no conductivity contribute no line,
so the number of series actually drawn is lower. Both figures verified:

| mode | rows considered | series actually drawn | points |
|---|---|---|---|
| Arrhenius, T | 655 | **619** (655 − 36) | 5225 |
| T/Tg, VFT | 368 | **351** (368 − 17) | 3401 |

17 of the 368 Tg-bearing rows are *also* among the 36 with no conductivity at all, which is
why the second subtraction is 17 rather than 36. Point totals are unaffected either way,
since the dropped rows contributed zero points. Prefer showing the drawn count in the UI —
it is the honest one.
