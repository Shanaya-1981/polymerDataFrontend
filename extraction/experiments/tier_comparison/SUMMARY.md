# MinerU parsing modes compared: standard vs advanced vs hybrid

*Generated 2026-09-22 06:46 UTC by `pipeline/experiments/report.py`. Regenerate with `.venv/bin/python -m pipeline.experiments.report`.*

## Method

- **Modes**: `standard` and `advanced` are MinerU tiers. `hybrid` is advanced's text and tables plus figure crops from *both* tiers.
- **Sample**: 10 papers pinned in `sample.json` (seed `20260921`), stratified 5 old (published < 1995, 18 in corpus) + 5 modern (published >= 1995, 45 in corpus). Reused by every experiment so results stay comparable.
- **Both tiers forced** (`mineru parse --force`); MinerU caches by file sha256, so an unforced re-parse replays cache and reports a fictional ~0s.
- **Tier order alternates** per paper, so a warm-up advantage shows up in the data instead of silently favouring one tier.
- **`hybrid` is composed, not re-parsed.** It is by definition the two parses above combined, so re-forcing would repeat the same work to measure a duration already known to be their sum. Its `parse_seconds` is that sum (its true cost); `measured_seconds` in the CSV shows what the cache-backed composition actually took.

> **Read the text columns with this in mind:** hybrid's body text *is* advanced's body text, by construction. Every character, table and number metric below is therefore identical for those two by design, not by measurement. The only place hybrid can differ is figures — which is the entire point of it.

## Three-way totals

**All 10 papers**

| Metric | standard | advanced | hybrid |
|---|---|---|---|
| Parse time (s, total) | 774.3 | 1477.2 | 2251.3 |
| Characters | 393089 | 411361 | 448286 |
| Tables | 16 | 80 | 80 |
| Table rows | 155 | 1124 | 1124 |
| &nbsp;&nbsp;of which digitised from plots | 0 | 889 | 889 |
| &nbsp;&nbsp;of which printed in the paper | 155 | 235 | 235 |
| Numbers inside tables | 1165 | 4529 | 4529 |
| Flattened cells (data destroyed) | 20 | 0 | 0 |
| Figure crops | 115 | 33 | 148 |
| &nbsp;&nbsp;with a caption | 113 | 31 | 144 |

**Old papers (<1995) — 5 papers**

| Metric | standard | advanced | hybrid |
|---|---|---|---|
| Parse time (s, total) | 639.2 | 898.8 | 1538.0 |
| Characters | 172440 | 186978 | 205299 |
| Tables | 5 | 48 | 48 |
| Table rows | 78 | 779 | 779 |
| &nbsp;&nbsp;of which digitised from plots | 0 | 667 | 667 |
| &nbsp;&nbsp;of which printed in the paper | 78 | 112 | 112 |
| Numbers inside tables | 743 | 2983 | 2983 |
| Flattened cells (data destroyed) | 0 | 0 | 0 |
| Figure crops | 63 | 13 | 76 |
| &nbsp;&nbsp;with a caption | 63 | 13 | 76 |

**Modern papers (>=1995) — 5 papers**

| Metric | standard | advanced | hybrid |
|---|---|---|---|
| Parse time (s, total) | 135.1 | 578.4 | 713.3 |
| Characters | 220649 | 224383 | 242987 |
| Tables | 11 | 32 | 32 |
| Table rows | 77 | 345 | 345 |
| &nbsp;&nbsp;of which digitised from plots | 0 | 222 | 222 |
| &nbsp;&nbsp;of which printed in the paper | 77 | 123 | 123 |
| Numbers inside tables | 422 | 1546 | 1546 |
| Flattened cells (data destroyed) | 20 | 0 | 0 |
| Figure crops | 52 | 20 | 72 |
| &nbsp;&nbsp;with a caption | 50 | 18 | 68 |

## What each mode is actually for

- **`standard`** keeps charts as images: 115 crops, the most of any mode. But it flattens complex tables — 20 cells of run-together digits, where `advanced` has 0 — and that destroys the values outright.
- **`advanced`** recovers those tables, and additionally reads 889 rows of data off plots. But having digitised a chart it emits no crop for it: 33 crops versus standard's 115. When a digitisation is wrong there is no image left to catch it.
- **`hybrid`** takes advanced's text and keeps 148 crops — every image either tier found. The digitised values and the plot they came from are both in front of the model.

## Per-paper

Each cell is `standard / advanced / hybrid`.

| paper | stratum | year | pp | tables | numbers in tables | flattened cells | figure crops |
|---|---|---|---|---|---|---|---|
| 0a3655ba | modern | 2004 | 8 | 6 / 12 / 12 | 192 / 458 / 458 | 0 / 0 / 0 | 9 / 1 / 10 |
| 2c7161a7 | modern | 2010 | 7 | 2 / 6 / 6 | 116 / 409 / 409 | 3 / 0 / 0 | 14 / 8 / 22 |
| 663ed327 | modern | 2014 | 5 | 0 / 3 / 3 | 0 / 185 / 185 | 0 / 0 / 0 | 10 / 4 / 14 |
| 1dba839e | modern | 2015 | 4 | 1 / 5 / 5 | 25 / 189 / 189 | 17 / 0 / 0 | 6 / 2 / 8 |
| 569ebb10 | modern | 2018 | 11 | 2 / 6 / 6 | 89 / 305 / 305 | 0 / 0 / 0 | 13 / 5 / 18 |
| 5feba0f9 | old | 1986 | 11 | 0 / 15 / 15 | 0 / 670 / 670 | 0 / 0 / 0 | 25 / 7 / 32 |
| bdf71b01 | old | 1988 | 7 | 0 / 6 / 6 | 0 / 187 / 187 | 0 / 0 / 0 | 8 / 2 / 10 |
| f3d2d4b6 | old | 1988 | 6 | 0 / 8 / 8 | 0 / 316 / 316 | 0 / 0 / 0 | 8 / 0 / 8 |
| 6ca669ae | old | 1992 | 6 | 1 / 8 / 8 | 35 / 711 / 711 | 0 / 0 / 0 | 8 / 0 / 8 |
| 170fead2 | old | 1994 | 9 | 4 / 11 / 11 | 708 / 1099 / 1099 | 0 / 0 / 0 | 14 / 4 / 18 |

## Figure coverage — where hybrid earns its keep

Crops `advanced` discards because it digitised the chart instead, and `hybrid` keeps:

| paper | standard | advanced | hybrid | crops advanced dropped | rows it digitised | note |
|---|---|---|---|---|---|---|
| 5feba0f9 | 25 | 7 | 32 | 18 | 147 |  |
| 170fead2 | 14 | 4 | 18 | 10 | 117 |  |
| 0a3655ba | 9 | 1 | 10 | 8 | 33 |  |
| 569ebb10 | 13 | 5 | 18 | 8 | 54 |  |
| 6ca669ae | 8 | 0 | 8 | 8 | 311 | advanced kept no image at all |
| f3d2d4b6 | 8 | 0 | 8 | 8 | 62 | advanced kept no image at all |
| 2c7161a7 | 14 | 8 | 22 | 6 | 35 |  |
| 663ed327 | 10 | 4 | 14 | 6 | 76 |  |
| bdf71b01 | 8 | 2 | 10 | 6 | 30 |  |
| 1dba839e | 6 | 2 | 8 | 4 | 24 |  |

## How much of the table data is estimated?

**79% of `advanced`'s table rows (889 of 1124) are digitised plots, not printed tables** — points read off a figure and marked `~`. `standard` produces 0 such rows; it leaves charts as images.

This cuts both ways, and it is the main qualification on every number above.

- It is real new capability: a conductivity-vs-temperature plot is often the *only* place a paper reports those values.
- It is also **estimated** data with no quality signal beyond the `~` marker, and it can be badly wrong. A hand-check of one paper found a 246-row digitised Arrhenius plot with a misread axis — `1000/T` spanning 27.3-100 (i.e. T = 10-37 K) and `log sigma` up to +3.4 S/cm, a conductivity better than copper — sitting alongside *correctly* digitised tables in the same document.

This is the argument for `hybrid`: it is the only mode where a wrong digitisation can still be caught, because the plot is attached too.

## Agreement between modes

Text similarity is 0-100 after stripping image links and markup.

| pair | median text similarity | values only in the first | values only in the second |
|---|---|---|---|
| standard vs advanced | 94.5 | 42 | 1979 |
| advanced vs hybrid | 99.2 | 2 | 21 |
| standard vs hybrid | 93.7 | 31 | 1987 |

## Spot-check these

Values found by only one tier. Open the PDF and confirm which is right — this is the check the numbers above cannot do for you.

**`6ca669ae-10.1016@0167-27389290292-W`**

- only in `advanced` (614): `-0.1`, `-0.2`, `-0.3`, `-0.4`, `-0.5`, `-0.6`, `-0.7`, `-0.8`, `-0.9`, `-1.0`
- only in `standard` (0): _none_
- `diff experiments/tier_comparison/6ca669ae-10.1016@0167-27389290292-W/standard/content.md experiments/tier_comparison/6ca669ae-10.1016@0167-27389290292-W/advanced/content.md`

**`5feba0f9-robitaille1986`**

- only in `advanced` (300): `0.0`, `0.03`, `0.04`, `0.04`, `0.04`, `0.05`, `0.05`, `0.06`, `0.09`, `0.1`
- only in `standard` (0): _none_
- `diff experiments/tier_comparison/5feba0f9-robitaille1986/standard/content.md experiments/tier_comparison/5feba0f9-robitaille1986/advanced/content.md`

**`170fead2-lascaud1994`**

- only in `advanced` (221): `0.00000005`, `0.00000009`, `0.00000015`, `0.0000003`, `0.0000005`, `0.0000005`, `0.0000009`, `0.0000009`, `0.0000015`, `0.0000015`
- only in `standard` (7): `0.42`, `0.52`, `0.68`, `0.76`, `0.83`, `1.5`, `3.5`
- `diff experiments/tier_comparison/170fead2-lascaud1994/standard/content.md experiments/tier_comparison/170fead2-lascaud1994/advanced/content.md`

## Caveats

- The sample over-weights old papers (5 of 18) against modern ones (5 of 45), by design. Read the per-stratum tables; the pooled one is not a corpus-wide average.
- Timings are wall-clock on one machine with a warm local MinerU server, one run per paper/mode — an order-of-magnitude cost ratio, not a benchmark.
- Counts are regex measurements of the markdown: they measure what MinerU *emitted*, not whether it was emitted correctly.
- No ground truth is involved. Accuracy against `data/_Cleaned_Final_Data_6_2_2020.csv` is the evaluation harness's job; this only compares the modes to each other.
