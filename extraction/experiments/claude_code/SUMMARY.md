# Claude Code mock — Claude Sonnet 5, text only and with figures

_Written by hand from `sonnet-5*/scores.json` and the per-paper files on 2026-09-28; re-running `run.py` rescores but does not rewrite this file._

What was run:
- **Model and route:** Claude Sonnet 5 (`claude-sonnet-5`), called through `util/claudeAPIMock.py`. That runs Claude Code 2.1.284 in non-interactive mode on a Claude Code login, so nothing was billed to an API key.
- **Kept identical to the local-LLM benchmark:** the pinned 10-paper sample (127 golden formulations), the prompt built by `pipeline/extraction/prompt.py`, the output schema and the scorer.
- **Two runs:**
  - `sonnet-5/` — **text only**: the paper text, with each figure's caption but not its image. `claudeAPIMock.py` at `8d7ccb0`.
  - `sonnet-5-figures/` — **with figures**: the same, plus every figure crop, 8–32 images per paper, as the local `C` arm did. `claudeAPIMock.py` at `f8e17ab`, the version that can send images.

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
| **Claude Sonnet 5 via Claude Code + figures** | 10/10 | 121/127 (12 rank) | 64% | 50% | 49% | 33% / 36% | 482 |
| **Claude Sonnet 5 via Claude Code, text only** | 10/10 | 95/127 (12 rank) | 56% | 51% | 43% | 36% / 37% | 393 |
| Qwen3.5-4B | 9/10 | 21/127 (13 rank) | 47% | 18% | 3% | 0% / 0% | 300 |
| NuExtract3 (4B) | 9/10 | 5/127 (4 rank) | 33% | 18% | 1% | 0% / 0% | 160 |
| Qwen3.5-4B + figures | 9/10 | 34/127 (11 rank) | 63% | 27% | 7% | 2% / 3% | 497 |
| Qwen3.5-4B, multistage per group | 10/10 | 46/127 (14 rank) | 55% | 23% | 7% | 4% / 10% | 264 |
| Qwen3.5-4B, multistage per formulation | 10/10 | 46/127 (14 rank) | 55% | 25% | 8% | 1% / 6% | 1249 |

The local runs were on a MacBook Air M4. The Claude Code times include a few seconds of start-up per call. Run 3 papers at a time, the whole sample took 23 minutes of wall clock text only (for the 9 papers run in one go) and 29 minutes with figures.

## Per paper

| Paper | Year | Images | Golden formulations | Text only: found (predicted), headline recall | + figures: found (predicted), headline recall | Qwen3.5-4B + figures: headline recall | Time text / figures (s) |
|---|---|---|---|---|---|---|---|
| bdf71b01 | 1988 | 10 | 5 | 5 (7), 83% | 5 (7), 75% | 3% | 265 / 283 |
| f3d2d4b6 | 1988 | 8 | 27 | 0 (5), 0% | 23 (24), 42% | 15% | 229 / 550 |
| 6ca669ae | 1992 | 8 | 13 | 13 (18), 30% | 13 (17), 37% | 11% | 423 / 493 |
| 1dba839e | 2015 | 8 | 13 | 11 (14), 38% | 11 (14), 38% | 8% | 363 / 192 |
| 663ed327 | 2014 | 14 | 6 | 6 (6), 41% | 6 (6), 47% | 36% | 134 / 232 |
| 2c7161a7 | 2010 | 22 | 12 | 12 (12), 68% | 12 (12), 68% | 13% | 135 / 158 |
| 0a3655ba | 2004 | 10 | 3 | 3 (27), 87% | 3 (28), 87% | 0% | 517 / 964 |
| 5feba0f9 | 1986 | 32 | 25 | 22 (29), 22% | 25 (30), 25% | 1% | 612 / 563 |
| 170fead2 | 1994 | 18 | 21 | 21 (39), 83% | 21 (38), 83% | 0% | 491 / 472 |
| 569ebb10 | 2018 | 18 | 2 | 2 (12), 20% | 2 (13), 13% | 15% | 524 / 547 |

## Accuracy by field group (paired formulations)

Each cell: accuracy, with the number of golden-filled values it is out of.

| Run | identity | thermal | conductivity | transport | molecular_weight | classification | processing | fits | curator_computed |
|---|---|---|---|---|---|---|---|---|---|
| Claude Sonnet 5 via Claude Code + figures | 80% (530) | 63% (134) | 33% (903) | 75% (28) | 35% (184) | 78% (363) | 70% (428) | 4% (544) | 51% (392) |
| Claude Sonnet 5 via Claude Code, text only | 82% (426) | 51% (134) | 36% (806) | 82% (28) | 34% (158) | 82% (285) | 75% (370) | 4% (503) | 35% (308) |
| Qwen3.5-4B + figures | 63% (161) | 38% (55) | 2% (230) | 50% (12) | 4% (45) | 61% (102) | 61% (112) | 4% (146) | 51% (96) |

## What's behind the numbers

- **Figures mostly help by finding formulations: 95 → 121 of 127.**
  - The clearest case is `f3d2d4b6`, which went from 0 to 23 of 27. Text only, the model returned 5 records with no concentration: the plot-read table in the text has one value column for two plotted curves (commercial and high-purity PEO), and it wouldn't attribute them to either sample.
  - With the images it can tell the curves apart, and it splits the samples by concentration as the golden set does.
- **Conductivity is still mostly blanks, and the prompt is the reason.**
  - With figures, of 903 golden conductivity values in paired formulations: 301 correct, 25 close, 11 wrong, 566 blank. Text only it was 293 / 8 / 7 / 498 out of 806.
  - The blanks fit a prompt rule: "If a value is ONLY available by reading it off a compressed, overlapping, or otherwise ambiguous plot... leave the numeric field null".
  - For example, none of the 30 `5feba0f9` records has a conductivity value. Most notes just point at the plotted curve ("conductivity curve F in Fig.5"), and one says "discrete sigma(T) values not extracted due to overlapping multi-curve plot". The golden set's curators read those plots at 5 °C steps.
  - Getting those values means relaxing that rule, and it trades against the "don't guess" rule. Where the figures did add conductivity, it came partly right: `6ca669ae` went from 15 to 22 correct and from 7 to 23 close, and `f3d2d4b6` got 4 correct, 2 close and 9 wrong.
- **Two papers dropped with figures:** `bdf71b01` from 83% to 75%, and `569ebb10` from 20% to 13%. Each paper ran once per setting, so this can't be told apart from run-to-run variation.
- **Curve-fit constants and some molecular weights are left blank on purpose.**
  - `fits` holds the curators' own curve fits (`local_llm/SUMMARY.md`), which papers don't print, and the prompt says not to estimate. That is why `fits` scores 4% in both runs.
  - Some molecular weights are the same case. `bdf71b01` prints no Mn, and its golden 255.9 kDa matches a calculation from the chain structure the paper does give.
- **Extra values were checked for made-up data.** Headline extras were 152 text only and 193 with figures. The rise is `f3d2d4b6`'s newly paired formulations, with 47 extras; every other paper stayed the same or fell slightly. They fall into four kinds:
  - **Arithmetic on stated values:** `Li:monomer` from stated O:Li ratios (86 with figures), and `salt wt%` converted from stated O/Li ratios (22 for `5feba0f9` text only). The notes mark those as "calculated wt%", and 47.0% for O/Li = 4 with LiCF3SO3 re-derives correctly.
  - **The prompt's own conventions:** `Tm = none`, meaning no melting reported, and `Average functional group per monomer = 1.0`.
  - **Printed values the golden set leaves out:** the samples traced include the Arrhenius energies in `2c7161a7`'s table, 75 / 74.6 wt% in `0a3655ba`, the 229 K peak in `6ca669ae` reported as −44 °C, "in the order of 10⁻⁷ S cm⁻¹ at 60 °C" in `663ed327`, and "Mn = 40 kDa, Đ < 1.2" in `569ebb10`, recorded as PDI 1.2 because a numeric field can't hold "<". With figures, `f3d2d4b6`'s new records add 0.52 eV from its plot-read table and "dried... at 45–50 °C for about 48 h" from its methods.
  - **Not checked one by one:** the numeric `Tm` extras.
  - Nothing traced came from outside the paper.
- **Precision is 56–64%** because it lists more samples than the golden set keeps: 27–28 against 3 for `0a3655ba`, 38–39 against 21 for `170fead2`. For `bdf71b01` the two additions are real samples, an undoped polymer and a comparison sample; the other papers' additions weren't checked.

## Caveats

- **Inputs:** every paper used the committed parse in `tier_comparison/*/hybrid/`. For 9 papers the text-only prompt is byte-identical to the one built from the old checkout's `output/parsed/`, which the earlier runs read. For `170fead2` the committed parse differs in one table of plot-read (`~`) values, 23 characters in all.
- **Figure anchors:** the figures run's text differs from the text-only run's only in each figure's anchor line ("attached image #N" instead of "image not provided"), exactly as `prompt.py` builds them.
- **`bdf71b01` text-only** was run once, earlier the same day, with the same code, model and input, and its result was copied in. Everything else came from `run.py`.
- **One run per paper and setting:** the replies vary from run to run, and there are no repeats to show by how much.
- **Payload size:** the largest request, `5feba0f9` with 32 images, is about 3.4 MB.
- **No token counts:** `raw_llm_response.json` has none, because `ask_llm()` returns only the reply text.
- **Plan usage:** calls count against the Claude Code plan's usage limits. On the real API, the same runs would be billed per token.
