# Claude Code mock — Claude Sonnet 5, text only

_Written by hand from `sonnet-5/scores.json` and the per-paper files on 2026-09-28; re-running `run.py` rescores but does not rewrite this file._

What was run:
- **Model and route:** Claude Sonnet 5 (`claude-sonnet-5`), called through `util/claudeAPIMock.py` (commit `8d7ccb0`). That runs Claude Code 2.1.284 in non-interactive mode on a Claude Code login, so nothing was billed to an API key.
- **Kept identical to the local-LLM benchmark:** the pinned 10-paper sample (127 golden formulations), the prompt built by `pipeline/extraction/prompt.py`, the output schema, the text-only setting (no figure images, only their captions) and the scorer.
- **What differs:** only the model, and how it is reached.

## How to read this

The definitions are those of `local_llm/SUMMARY.md`. In short:
- **Formulations found:** golden formulations (one polymer + salt + concentration combination) that were paired with a predicted one. Pairing uses anion and salt concentration. *Rank* pairings, made by concentration order when the two sources use different units, are counted in brackets.
- **Precision:** predicted formulations that paired, out of all predicted.
- **Accuracy:** correct values out of the golden-filled values in *paired* formulations. It answers: when a formulation is found, how right is it?
- **Recall:** correct values out of the golden-filled values in *all* golden formulations, so a missed formulation costs every one of its values.
- **Headline:** the fields a paper normally prints (identity, thermal, conductivity, transport, molecular weight).
- **Conductivity *tight* / *loose*:** within about ±26% of the golden value, or within a factor of about 3.
- **Extra values:** values filled in where the golden set is blank. They are not scored.

## Results next to the earlier runs

| Run | Papers OK | Formulations found | Precision | Headline accuracy | Headline recall | Conductivity (tight / loose) | Median s/paper |
|---|---|---|---|---|---|---|---|
| **Claude Sonnet 5 via Claude Code** | 10/10 | 95/127 (12 rank) | 56% | 51% | 43% | 36% / 37% | 393 |
| Qwen3.5-4B | 9/10 | 21/127 (13 rank) | 47% | 18% | 3% | 0% / 0% | 300 |
| NuExtract3 (4B) | 9/10 | 5/127 (4 rank) | 33% | 18% | 1% | 0% / 0% | 160 |
| Qwen3.5-4B + figures | 9/10 | 34/127 (11 rank) | 63% | 27% | 7% | 2% / 3% | 497 |
| Qwen3.5-4B, multistage per group | 10/10 | 46/127 (14 rank) | 55% | 23% | 7% | 4% / 10% | 264 |
| Qwen3.5-4B, multistage per formulation | 10/10 | 46/127 (14 rank) | 55% | 25% | 8% | 1% / 6% | 1249 |

The local runs were on a MacBook Air M4. This run's times are Claude Code's, including a few seconds of start-up per call. The 9 papers run for this report took 23 minutes of wall clock, 3 at a time.

## Per paper

"Best earlier" is the highest headline recall any run above reached on that paper.

| Paper | Year | Paper text (chars) | Golden formulations | Found (predicted) | Headline recall | Best earlier headline recall | Time (s) |
|---|---|---|---|---|---|---|---|
| bdf71b01 | 1988 | 14,190 | 5 | 5 (7) | 83% | 7% (per_group) | 265 |
| f3d2d4b6 | 1988 | 25,367 | 27 | 0 (5) | 0% | 27% (per_group) | 229 |
| 6ca669ae | 1992 | 26,813 | 13 | 13 (18) | 30% | 11% (C-qwen3.5-4b-figures) | 423 |
| 1dba839e | 2015 | 30,405 | 13 | 11 (14) | 38% | 8% (C-qwen3.5-4b-figures) | 363 |
| 663ed327 | 2014 | 32,036 | 6 | 6 (6) | 41% | 36% (C-qwen3.5-4b-figures) | 134 |
| 2c7161a7 | 2010 | 42,613 | 12 | 12 (12) | 68% | 41% (per_formulation) | 135 |
| 0a3655ba | 2004 | 56,680 | 3 | 3 (27) | 87% | 0% (per_group) | 517 |
| 5feba0f9 | 1986 | 69,382 | 25 | 22 (29) | 22% | 2% (per_group) | 612 |
| 170fead2 | 1994 | 70,615 | 21 | 21 (39) | 83% | 5% (per_group) | 491 |
| 569ebb10 | 2018 | 82,772 | 2 | 2 (12) | 20% | 15% (C-qwen3.5-4b-figures) | 524 |

## Accuracy by field group (paired formulations)

Each cell: accuracy, with the number of golden-filled values it is out of.

| Run | identity | thermal | conductivity | transport | molecular_weight | classification | processing | fits | curator_computed |
|---|---|---|---|---|---|---|---|---|---|
| Claude Sonnet 5 via Claude Code | 82% (426) | 51% (134) | 36% (806) | 82% (28) | 34% (158) | 82% (285) | 75% (370) | 4% (503) | 35% (308) |
| Qwen3.5-4B + figures | 63% (161) | 38% (55) | 2% (230) | 50% (12) | 4% (45) | 61% (102) | 61% (112) | 4% (146) | 51% (96) |

## What's behind the numbers

- **Conductivity misses are blanks, not wrong numbers.**
  - Of 806 golden conductivity values in paired formulations: 293 correct, 8 close, 7 wrong and 498 left blank.
  - The blanks sit in papers whose conductivities exist only as plotted curves. All 377 values for `5feba0f9` are blank; this run sends no images, and `ask_llm()` has no image input yet.
  - Where a paper prints the numbers they come back: 212/212 for `170fead2`, 35/35 for `bdf71b01`.
- **`f3d2d4b6`: none of its 27 formulations found.**
  - The golden set has PEO with CF3SO3 or ClO4 at 13–14 concentrations each, read off plotted curves.
  - The model returned 5 records (commercial vs high-purity PEO, per salt) with no concentration. Its notes say the plot-read table has one value column for the two plotted curves, so the values can't be attributed to either sample.
  - The prompt tells it not to use ambiguous plot readings, so it left them out. The scorer pairs on concentration, so nothing paired.
- **Curve-fit constants and some molecular weights are left blank on purpose.**
  - `fits` holds the curators' own curve fits (`local_llm/SUMMARY.md`), which papers don't print, and the prompt says not to estimate. That is why `fits` scores 4%.
  - Some molecular weights are the same case. `bdf71b01` prints no Mn, and its golden 255.9 kDa matches a calculation from the chain structure the paper does give.
- **Extra values were checked for made-up data.** The 152 headline extras and the rest fall into four kinds:
  - **Arithmetic on stated values:** 60 `Li:monomer` values from stated O:Li ratios, and 22 `salt wt%` values for `5feba0f9` converted from its stated O/Li ratios. The notes mark those as "calculated wt%", and 47.0% for O/Li = 4 with LiCF3SO3 re-derives correctly.
  - **The prompt's own conventions:** 38 `Tm = none`, meaning no melting reported, and 17 `Average functional group per monomer = 1.0`.
  - **Printed values the golden set leaves out:** in the samples traced, these include the Arrhenius energies in `2c7161a7`'s table, 75 / 74.6 wt% in `0a3655ba`, the 229 K peak in `6ca669ae` reported as −44 °C, "in the order of 10⁻⁷ S cm⁻¹ at 60 °C" in `663ed327`, and "Mn = 40 kDa, Đ < 1.2" in `569ebb10`, recorded as PDI 1.2 because a numeric field can't hold "<".
  - **Not checked one by one:** 18 numeric `Tm` extras.
  - Nothing traced came from outside the paper.
- **Precision is 56%** because it lists more samples than the golden set keeps: 27 against 3 for `0a3655ba`, 39 against 21 for `170fead2`. For `bdf71b01` the two additions are real samples, an undoped polymer and a comparison sample; the other papers' additions weren't checked.

## Caveats

- **Input for `170fead2`:** every paper used the committed parse in `tier_comparison/*/hybrid/`. For 9 papers the prompt this builds is byte-identical to the one built from the old checkout's `output/parsed/`, which the earlier runs read. For `170fead2` the committed parse differs in one table of plot-read (`~`) values, 23 characters in all.
- **`bdf71b01` was run once, earlier the same day,** with the same code, model and input, and its result was copied in. The other 9 came from `run.py`.
- **One run per paper:** the replies vary from run to run, and there are no repeats to show by how much.
- **No token counts:** `raw_llm_response.json` has none, because `ask_llm()` returns only the reply text.
- **Plan usage:** calls count against the Claude Code plan's usage limits. On the real API, the same run would be billed per token.
