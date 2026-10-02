# Claude Code mock — Claude Sonnet 5 and Opus 5.5, one call and multistage

_Written by hand from `sonnet-5*/scores.json` and the per-paper files on 2026-09-28; re-running `run.py` rescores but does not rewrite this file._

What was run:
- **Model and route:** Claude Sonnet 5 (`claude-sonnet-5`), called through `util/claudeAPIMock.py`. That runs Claude Code 2.1.284 in non-interactive mode on a Claude Code login, so nothing was billed to an API key.
- **Kept identical to the local-LLM benchmark:** the pinned 10-paper sample (127 golden formulations) and the scorer.
- **Three runs:**
  - `sonnet-5/` — **pipeline prompt, text only**: the prompt built by `pipeline/extraction/prompt.py` and its output schema, with the paper text and each figure's caption but not its image. `claudeAPIMock.py` at `8d7ccb0`.
  - `sonnet-5-figures/` — **pipeline prompt with figures**: the same, plus every figure crop, 8–32 images per paper, as the local `C` arm did. `claudeAPIMock.py` at `f8e17ab`, the version that can send images.
  - `sonnet-5-simple/` — **simple prompt with figures**: `extract_features.py`, which takes a paper and a list of feature names and returns one row per sample. The features were the golden CSV's 76 column names, as they are. Its system prompt is 530 characters (the pipeline's is about 7,400), with no field guide, unit conversions or rules. It was run before `extract_features.py` was committed (`f8e17ab plus uncommitted changes`).

Later runs with **Claude Opus 5.5** (`claude-opus-5-5`) are in the next section. They cover the same prompts, the PDF sent directly instead of MinerU's output, and the multi-call method.

## Claude Opus 5.5

| Run | Papers OK | Calls | Formulations found | Precision | Headline accuracy | Headline recall | Conductivity (tight / loose) | Median s/paper |
|---|---|---|---|---|---|---|---|---|
| **One call, simple prompt, MinerU text + figures** (`opus-5-5-simple/`) | 10/10 | 10 | 125/127 (10 rank) | 66% | 52% | 51% | 46% / 51% | 92 |
| **One call, simple prompt, PDF sent directly** (`opus-5-5-simple-pdf/`) | 10/10 | 10 | 117/127 (11 rank) | 66% | 45% | 43% | 30% / 40% | 90 |
| One call, pipeline prompt, MinerU text only (`opus-5-5/`) | 10/10 | 10 | 101/127 (16 rank) | 72% | 47% | 42% | 27% / 27% | 68 |
| Multistage, per group, MinerU text only (`multistage-opus-5-5/per_group/`) | 10/10 | 60 | 90/127 (15 rank) | 68% | 45% | 32% | 22% / 25% | 135 |
| Multistage, per formulation, MinerU text only (`multistage-opus-5-5/per_formulation/`) | 10/10 | 143 | 90/127 (15 rank) | 68% | 45% | 32% | 21% / 23% | 266 |
| *For comparison:* Sonnet 5, one call, pipeline prompt, MinerU text + figures | 10/10 | 10 | 121/127 (12 rank) | 64% | 50% | 49% | 33% / 36% | 482 |
| *For comparison:* Qwen3.5-4B, multistage per formulation (`../multistage/`) | 10/10 | 93 | 46/127 (14 rank) | 55% | 25% | 8% | 1% / 6% | 1249 |

What each run changes:
- **Where the paper comes from:** MinerU's output (text, tables, the `~` tables its `advanced` setting reads off plots, and figure crops), or the PDF itself with no MinerU at all.
- **The prompt:** the simple prompt from `extract_features.py`, or the pipeline's own. The simple prompt gets the golden CSV's 76 column names as its features.

Findings:
- **Opus 5.5 is both more accurate and faster than Sonnet 5.** With the simple prompt it found 125 formulations against Sonnet's 90, and its headline recall was 51% against 33%. The whole sample took 6 minutes against 18.
- **Parsing with MinerU beats sending the PDF directly**, mainly on conductivity.
  - With MinerU: 421 correct, 46 close and 19 wrong conductivity values, out of 911 in paired formulations.
  - With the PDF: 267 correct, 93 close and 52 wrong, out of 896.
  - MinerU gives the model its plot readings and a large image of each figure. From the PDF, the model reads plots off whole pages.
  - The PDF run was a little better on identity fields, for example `Polymer` 82% against 61%.
- **Multistage scored below one call, because of its listing step.**
  - The listing keeps a formulation only if its quote is found in the paper. That check was written to stop the local 4B model from inventing entries.
  - Here it dropped real formulations that Claude quoted tersely or from table rows: 30 of 38 in `170fead2`, 16 of 30 in `f3d2d4b6`, 10 of 30 in `5feba0f9`.
  - A table-row quote such as `| ~0.31 | 8 | — | — | ~0.65 |` reduces to fewer than the 8 characters the check requires. For `170fead2`, Claude cited "Table 4. Conductivity Data of the PEO–LiTFSI System; EO/Li 192/1; c (mol/kg) 0.114", which joins a caption and a row rather than copying either.
  - On the six papers where the listing kept everything, multistage matched or beat the single call (`bdf71b01`: 83% against 25%).
- **The quote check had a real bug, fixed in `pipeline/extraction/multistage.py` before this run.**
  - It didn't strip the HTML tags of tables that MinerU writes as HTML, so every quote from such a table failed.
  - It also rejected rows under a merged first cell (`rowspan`), where the model repeats the row's label.
  - The same bug affected the earlier local run: 31 of the formulations Qwen listed for `170fead2` were dropped, and all 38 of its quotes pass with the fix. `../multistage/SUMMARY.md` predates the fix.

Per paper, multistage against one call (all Opus 5.5, MinerU text only):

| Paper | Golden formulations | Listed (kept / returned) | Per group: found, headline recall, calls, s | Per formulation: found, headline recall, calls, s | One call (pipeline prompt): found, headline recall, s |
|---|---|---|---|---|---|
| bdf71b01 | 5 | 6 / 6 | 5, 83%, 6, 96 | 5, 83%, 7, 133 | 5, 25%, 44 |
| f3d2d4b6 | 27 | 14 / 30 | 13, 25%, 6, 135 | 13, 23%, 15, 317 | 4, 6%, 51 |
| 6ca669ae | 13 | 15 / 15 | 13, 36%, 6, 134 | 13, 32%, 16, 285 | 13, 30%, 79 |
| 1dba839e | 13 | 14 / 14 | 11, 38%, 6, 92 | 11, 38%, 15, 246 | 11, 38%, 60 |
| 663ed327 | 6 | 6 / 6 | 6, 47%, 6, 68 | 6, 47%, 7, 123 | 6, 47%, 42 |
| 2c7161a7 | 12 | 12 / 12 | 12, 68%, 6, 72 | 12, 68%, 13, 192 | 12, 68%, 55 |
| 0a3655ba | 3 | 20 / 27 | 3, 41%, 6, 225 | 3, 46%, 21, 518 | 3, 57%, 175 |
| 5feba0f9 | 25 | 20 / 30 | 17, 17%, 6, 150 | 17, 17%, 21, 480 | 24, 24%, 128 |
| 170fead2 | 21 | 8 / 38 | 8, 27%, 6, 158 | 8, 27%, 9, 226 | 21, 83%, 115 |
| 569ebb10 | 2 | 18 / 18 | 2, 7%, 6, 167 | 2, 7%, 19, 362 | 2, 11%, 76 |

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
| **Claude Sonnet 5, simple prompt + figures** | 10/10 | 90/127 (23 rank) | 45% | 43% | 33% | 40% / 49% | 313 |
| **Claude Sonnet 5, pipeline prompt + figures** | 10/10 | 121/127 (12 rank) | 64% | 50% | 49% | 33% / 36% | 482 |
| **Claude Sonnet 5, pipeline prompt, text only** | 10/10 | 95/127 (12 rank) | 56% | 51% | 43% | 36% / 37% | 393 |
| Qwen3.5-4B | 9/10 | 21/127 (13 rank) | 47% | 18% | 3% | 0% / 0% | 300 |
| NuExtract3 (4B) | 9/10 | 5/127 (4 rank) | 33% | 18% | 1% | 0% / 0% | 160 |
| Qwen3.5-4B + figures | 9/10 | 34/127 (11 rank) | 63% | 27% | 7% | 2% / 3% | 497 |
| Qwen3.5-4B, multistage per group | 10/10 | 46/127 (14 rank) | 55% | 23% | 7% | 4% / 10% | 264 |
| Qwen3.5-4B, multistage per formulation | 10/10 | 46/127 (14 rank) | 55% | 25% | 8% | 1% / 6% | 1249 |

The local runs were on a MacBook Air M4. The Claude Code times include a few seconds of start-up per call. Run 3 papers at a time, the whole sample took 23 minutes of wall clock text only (for the 9 papers run in one go), 29 minutes with figures and 18 minutes with the simple prompt.

## Per paper

The pipeline prompt, text only and with figures:

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

The simple prompt next to the pipeline prompt, both with figures:

| Paper | Year | Golden formulations | Simple + figures: found (predicted), headline recall | Pipeline + figures: found (predicted), headline recall | Time simple / pipeline (s) |
|---|---|---|---|---|---|
| bdf71b01 | 1988 | 5 | 5 (7), 67% | 5 (7), 75% | 224 / 283 |
| f3d2d4b6 | 1988 | 27 | 17 (19), 19% | 23 (24), 42% | 311 / 550 |
| 6ca669ae | 1992 | 13 | 0 (24), 0% | 13 (17), 37% | 353 / 493 |
| 1dba839e | 2015 | 13 | 11 (14), 32% | 11 (14), 38% | 152 / 192 |
| 663ed327 | 2014 | 6 | 6 (7), 49% | 6 (6), 47% | 177 / 232 |
| 2c7161a7 | 2010 | 12 | 0 (12), 0% | 12 (12), 68% | 105 / 158 |
| 0a3655ba | 2004 | 3 | 3 (33), 48% | 3 (28), 87% | 352 / 964 |
| 5feba0f9 | 1986 | 25 | 25 (29), 19% | 25 (30), 25% | 534 / 563 |
| 170fead2 | 1994 | 21 | 21 (42), 78% | 21 (38), 83% | 606 / 472 |
| 569ebb10 | 2018 | 2 | 2 (12), 15% | 2 (13), 13% | 315 / 547 |

## Accuracy by field group (paired formulations)

Each cell: accuracy, with the number of golden-filled values it is out of.

| Run | identity | thermal | conductivity | transport | molecular_weight | classification | processing | fits | curator_computed |
|---|---|---|---|---|---|---|---|---|---|
| Claude Sonnet 5, simple prompt + figures | 49% (393) | 51% (74) | 40% (746) | 71% (28) | 36% (166) | 49% (270) | 65% (326) | 2% (447) | 16% (299) |
| Claude Sonnet 5, pipeline prompt + figures | 80% (530) | 63% (134) | 33% (903) | 75% (28) | 35% (184) | 78% (363) | 70% (428) | 4% (544) | 51% (392) |
| Claude Sonnet 5, pipeline prompt, text only | 82% (426) | 51% (134) | 36% (806) | 82% (28) | 34% (158) | 82% (285) | 75% (370) | 4% (503) | 35% (308) |
| Qwen3.5-4B + figures | 63% (161) | 38% (55) | 2% (230) | 50% (12) | 4% (45) | 61% (102) | 61% (112) | 4% (146) | 51% (96) |

## The simple prompt

- **It reads more conductivity off the plots, and gets more of it wrong.** Nothing in it says to leave crowded plots alone. Of 746 golden conductivity values in paired formulations: 295 correct, 72 close, 28 wrong, 351 blank. The pipeline prompt with figures had 301 / 25 / 11 / 566 out of 903.
- **It loses formulations when the concentration comes back as something other than a number.** Formulations are paired on salt concentration.
  - `2c7161a7`: it put `1:9`, `1:12`… in `Li:monomer` and left `Li:functional group` empty.
  - `6ca669ae`: it wrote "10 mol% relative to EO unit".
  - Neither leaves a number to pair on, so both papers matched none of their formulations. That accounts for most of the drop from 121 to 90.
- **Most of the lost score is format conventions**, which the pipeline prompt's field guide spells out and a bare column name doesn't:

  | Feature | Accuracy, pipeline → simple | Golden set expects | Simple prompt returned |
  |---|---|---|---|
  | `Li:functional group` | 76% → 46% | `0.05` | `1:20` |
  | `Polymer family` | 79% → 5% | `ether` | "Poly(ethylene oxide) copolymer (oxyethylene-oxymethylene)" |
  | `crystalline?` | 50% → 31% | `yes` / `no` / `na` | "two-phase (crystalline+amorphous)" |
  | `Polymer` | 61% → 26% | "poly(ethyleneoxide-co-methyleneoxide)" | the same polymer with its salt ratio appended |
  | `SMILES descriptor 1` | 76% → 0% | `COC` for PEO's repeat unit | the monomer (`C1CO1`), the unit written another way (`CCO`, `OCC`), or starred units such as `*OCCOC(=O)*` |
  | `Comonomer percentage` | 87% → 0% | `100` for a homopolymer | mostly left blank |

- **So the golden set's column names alone don't carry their conventions.** A name such as `Li:functional group` doesn't say "as a fraction", and `crystalline?` doesn't say "yes, no or na". Keeping the prompt short means those conventions have to come from the feature list itself, for example a short description next to each name.

## What's behind the numbers (pipeline prompt)

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
