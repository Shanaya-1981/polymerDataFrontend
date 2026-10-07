# Agent Session 03 — Handoff Report

**Date**: 2026-09-22 to 2026-09-23
**Scope**: researched on-device LLMs for lab machines with 8 / 16 / 32 GB of
RAM (the lab can't reach outside websites), built the local-model extraction
path on llama.cpp, built a scorer against the golden CSV (a slice of
Milestone 6), ran the first benchmark (Round 1), found that the one-call
output format is the main problem, built a multi-call design (list the
formulations first, then fill in values), compared its two layouts (per
field group vs per formulation), and agreed with the user that the first
(listing) call is now the priority.

Prior handoff: `session02.md` (MinerU tier comparison, hybrid parsing).
Plan: `/Users/merlin/.claude/plans/take-a-look-at-humble-kurzweil.md`.

## What Was Built

**Research** — `experiments/local_llm/RESEARCH.md`: candidate models per RAM
tier with sources, runtimes, browser feasibility, air-gapped deployment,
model-origin (Qwen) and license notes. Picks: Qwen3.5-4B and NuExtract3
(8 GB), Qwen3.5-9B and Gemma 4 12B (16 GB), Qwen3.6-35B-A3B / Qwen3.8-27B /
Gemma 4 26B-A4B (32 GB, research only). The reason 2026 models fit: hybrid
attention keeps the context memory (KV cache) at ~32 KiB/token for
Qwen3.5-4B vs 144 KiB for 2025 models.

**Runtime** — llama.cpp 0.4.1 (build 10964) via Homebrew; `hf` download CLI
via `uv tool`; GGUF files under `models/` (gitignored): Qwen3.5-4B and 9B
(+ vision encoders), NuExtract3 Q4 and Q8, Gemma 4 12B and E2B.

**Local client** — `openai_compatible_client.py`: 3600 s timeout, 0 retries,
explicit sampling (temperature 0.2, presence_penalty 0, seed 0), loud
failures for cut-off output (`output_truncated`) and server-truncated
prompts (`prompt_truncated`, fewer than 1 token per 6 characters sent),
wall time and llama-server timings recorded. `factory.build_llm_client()`
builds a client from any settings dict; `provider: nuextract` selects
`nuextract_client.py` (NuExtract3's own template via `chat_template_kwargs`).
`settings.yaml` now defaults to the local server (`openai_compatible`,
text-only). CLI: `extract --figures/--no-figures`.

**Schema and prompt** — the model fills `ExtractedFormulations`
(formulations only); the pipeline attaches `paper_id` in
`PaperExtractionResult`. Every text field has a length cap and the list has
`maxItems` 80 (caps go into the output grammar). The field guide now states
units (°C, S/cm) and golden conventions; concentration and conversion rules
added; text-only prompt variant (captions only).

**Scorer** — `pipeline/evaluation/`: `mapping.py` (+ `data/paper_mapping.csv`,
10 pinned papers, each checked against the paper's first page), `fields.py`
(field groups; headline = identity, thermal, conductivity, transport,
molecular weight), `normalize.py` (anion / solvent / vocabulary spellings),
`rowmatch.py` (pairing on anion + concentration: direct, rank, anion-only),
`scoring.py`, `evaluate.py` (+ `--self-test`: golden vs golden 100%,
conductivities ×10 fail exactly, 4-paper fixture for eyeballing).

**Round 1 benchmark** — `experiments/local_llm/arms.yaml`,
`pipeline/experiments/run_local_llm_benchmark.py` (starts/stops llama-server
per setup, memory from llama.cpp's breakdown at `-lv 4`),
`local_llm_report.py` → `experiments/local_llm/SUMMARY.md`.

**Multi-call extraction** — `pipeline/extraction/multistage.py`: a listing
call (formulations only, one per concentration; code numbers them F1, F2,
...), then value calls either **per field group** (5 calls, values tagged
with IDs, "ALL" for shared values) or **per formulation** (one call each).
Only stated values, as name–value pairs; conductivity as (temperature, value)
points mapped to the 22 columns in code; derived columns not asked; paper
first in every prompt so the prompt cache reuses it. Placeholder values
("na", "not reported", "") and conductivities outside 1e-13..1 S/cm are
dropped and counted. Comparison runner:
`pipeline/experiments/run_multistage_benchmark.py` →
`experiments/multistage/SUMMARY.md`.

## Results

**Round 1** (one call per paper, Qwen-family 8 GB setups, 10 pinned papers,
127 golden formulations; D was stopped at its first paper, E–H not run):

| Setup | Memory (budget 5461 MiB) | Formulations found | Headline accuracy | Conductivity | Total time |
|---|---|---|---|---|---|
| A Qwen3.5-4B, text | 5106 | 21 / 127 | 18% | 0% | 89 min |
| B NuExtract3, text | 5075 | 5 / 127 | 18% | 0% | 57 min |
| C Qwen3.5-4B + figures | 5418 | 34 / 127 | 27% | 2% | 114 min |

Each setup failed one paper by overrunning the 24,576-token output limit.
~65% of every answer was empty fields written as `null`. Figures helped
(C > A) at the cost of time and memory (C barely fits 8 GB).

**Multi-call comparison** (same model and papers; both layouts fill the same
quote-checked formulation list; details in `experiments/multistage/SUMMARY.md`):

| | Round 1: one call | Per group | Per formulation |
|---|---|---|---|
| Total time, 10 papers | 89 min (1 failed) | **53 min** | 197 min |
| Calls / tokens written | 10 / 72,934 | 60 / 44,192 | 93 / 198,147 |
| Formulations found | 21 / 127 | 46 / 127 | 46 / 127 |
| Headline accuracy | 18% | 23% | 25% |
| Thermal accuracy | 20% | 12% | 53% |
| Conductivity (0.1 / 0.5 decades) | 0% / 0% | 4% / 10% | 1% / 6% |

- Listing first more than doubled the formulations found (21 → 46).
- Per group is 3.7× faster. Per formulation's accuracy lead is almost all
  thermal: in per-group, **all 135 thermal values used the "ALL" tag** (104
  of them Tg/Tm/crystallinity, which vary with concentration), copying one
  value onto every formulation. Proposed fix, not yet run: offer "ALL" only
  in the material/processing group.
- Two more side-effects of prompt changes, both handled in code: requiring
  a quote in the listing made the model stop filling numeric concentrations
  (now parsed from "concentration as written" by `parse_concentration`), and
  the quote check drops real formulations whose evidence is a table header
  the model paraphrased (e.g. bdf71b01's 16:1 and 12:1).
- `--reassemble` rebuilds every result from saved raw call outputs, so
  assembly or scoring fixes never need the model again.

**The first call (listing) per paper** — answer-sheet formulations, what the
listing returned and kept after the quote check, and how many scoring could
pair with the answer sheet:

| Paper | Answer sheet | Returned → kept | Paired | What went wrong |
|---|---|---|---|---|
| 2c7161a7 | 12 | 12 → 12 | 12 | nothing: perfect |
| f3d2d4b6 | 27 | 20 → 20 | 17 | a few missed |
| 1dba839e | 13 | 12 → 12 | 0 | mol% concentrations not converted, so unpairable (plus the answer sheet's mol%/wt% error) |
| 663ed327 | 6 | 6 → 6 | 0 | not yet investigated |
| 170fead2 | 21 | 38 → 7 | 6 | quote check dropped most (likely paraphrased table-header evidence) |
| bdf71b01 | 5 | 6 → 2 | 2 | quote check dropped real 16:1 and 12:1 |
| 5feba0f9 | 25 | 8 → 7 | 3 | genuine under-listing (merging) |
| 6ca669ae | 13 | 10 → 8 | 6 | all 6 paired only by rank (mol% units) |
| 0a3655ba | 3 | 60 → 6 | 0 | runaway to the 60 cap |
| 569ebb10 | 2 | 60 → 3 | 0 | runaway to the 60 cap |

Found formulations hold 566 of the answer sheet's 1,835 headline values
(31%); about 24% of those came back right, so overall recall ≈ 7%.

## Discussion and Decisions (with the user, in session order)

**Decisions.**
- Lab hardware unknown → stay portable: GGUF files + the llama.cpp engine
  (Ollama, LM Studio, Jan and the in-browser wllama all use it).
- Build a small scorer on the pinned 10 papers.
- 32 GB tier: research only.
- Mentor mode dropped: removed from memory at the user's request.
- Communication: technical writing, with every technical term explained in
  one plain sentence. The user prefers this over "simple English".
- Model origin: every top pick is Qwen-derived. No federal rule names Qwen
  (DeepSeek is named), but ask the lab; each tier has a Gemma (Google)
  control.

**What goes into the model.**
- Instructions with a field guide (units and conventions).
- The parsed paper `content.md`: tables, MinerU's `~` tables digitised from
  charts, and figure captions where the figures were.
- Figure images only in the figure setups.
- 75 fields (the 76 columns minus `Anion Smiles`).
- Clearly derived columns are not asked for in the multi-call design:
  SMILES descriptors, Average functional group per monomer, the two "me"
  Arrhenius fits, X-ray.
- Sometimes-derived columns should be computed in code: `Li:functional
  group` from wt% or mol%, VFT/Arrhenius fits, and conductivities read from
  fits.

**Terms clarified.**
- Hierarchy: polymer family > polymer > formulation. One answer-sheet row
  = one formulation = one ID.
- The user first read "ID" as polymer family. That is the same grouping the
  4B model made, so the listing prompt now says "one entry per
  concentration".
- A token is ~3 characters. The tokenizer has a fixed 248,320-piece
  vocabulary built by BPE (byte-pair encoding); every digit is its own
  token; our papers average ~3.1 characters per token.
- At the output limit the answer is cut off, not shortened. The model is
  never told the limit; the server stops it mid-answer; the JSON is invalid
  and rejected.

**The user's two ideas for shorter output.**
- *Values only, in a fixed order.* Measured on a real entry: 1,047 → 233
  tokens. Risk: one missing slot shifts every later value into the wrong
  column, silently. "Only filled fields, with names" gets 255 tokens without
  that risk.
- *Split the fields into groups, one call each.* This needs a first call
  that lists the formulations with IDs, so all groups fill the same list.
  The prompt cache makes re-reading the paper cheap.
- Blended design adopted: list first → value calls → filled-only name–value
  pairs → derived values in code → fine-tune later.

**How IDs link calls.**
- Code passes the list (ID plus description) into every later call.
- The grammar allows only listed IDs (plus "ALL"), and code joins the
  results by ID.
- Limits:
  - later calls can't add a formulation the first call missed;
  - a value can still land on the wrong ID;
  - "ALL" was misused for Tg (see Results).

**Fine-tuning (the user's idea).**
- Feasible: LoRA (training a small add-on instead of the whole model) on
  Qwen3.5-4B or 9B. Deployment is unchanged: merged and saved as GGUF.
- Data: ~53 non-test papers. Keep the 10 test papers out; train on stated
  values only; check training rows for answer-sheet errors.
- Settle the output format first.
- MLX on this Mac is slow; a GPU cluster is faster.
- NuExtract3 (a general extraction fine-tune) still merged formulations, so
  training must teach our convention.

**The user's RAG research** (RAG = giving the model only retrieved
passages).
- Gupta et al. 2024 used retrieval to control cost across 2.4M articles.
- Wang et al. 2025 (arXiv 2510.05142; alloys; o3-mini at high reasoning;
  four stages; full article at every step), missed / invented materials of
  396:

  | Setup | Missed | Invented |
  |---|---|---|
  | Single pass | 37 | 12 |
  | List first | 43 | not reported |
  | List first + source tracking | 13 | 0 |

  Source tracking made the difference, not listing first alone.
- DocETL: splitting the data or task, 25–80% better.
- Chem Soc Rev 2025: chunking can help; retrieval mainly for many documents.
- Conclusion: no retrieval now (our papers fit whole). Retrieval may help
  later with choosing which figures to send.

**Source tracking.**
- Every value carries a short verbatim quote. Code checks that the quote is
  in the paper and that the number is in the quote.
- Complements IDs: the ID says *which formulation*, the quote says *where
  from*.
- Example: bdf71b01's `salt wt% = 3` came from "approximately 3% solutions
  by weight", the casting solution, not the salt content. A code check can't
  catch that kind of misreading; a person or a checking call can.
- Used so far only in the listing call.

**Two pairings — don't confuse them.**
- Inside the pipeline, values join formulations by ID (reliable).
- Scoring pairs our formulations with answer-sheet rows by content, because
  the answer sheet has no IDs:
  - anion must match;
  - concentration: direct (within 15%), then rank (order within the
    anion), then anion-only;
  - tie-breakers: comonomer % and polymer name;
  - best pairs first, one-to-one.
- Blind spots: mol% isn't converted; rank can mis-pair within a series;
  663ed327 not yet investigated. Rules: top of
  `pipeline/evaluation/rowmatch.py`.

**The user's latest point: the first call is paramount.**
- Agreed: it gates everything; a missed formulation is gone for good.
- Two qualifications:
  1. Part of the apparent listing loss is ours. There are four failure
     kinds in the table above: unpairable units, the quote check dropping
     real entries, runaways, and genuine under-listing (only 5feba0f9).
  2. Value accuracy is an equal lever: a perfect listing alone gives
     ~24% overall, perfect values alone ~31%.
- Proposed next workflow: a listing-only test loop. See next steps.

## Bugs Encountered & How They Were Resolved

### In the pipeline, the prompt and the model's behaviour

1. **`openai` SDK defaults: 600 s timeout, then 2 automatic retries** of the
   whole request — ~30 min lost on a slow paper. *Fix*: 3600 s, 0 retries.
2. **The model invented the paper ID** ("Linden_Owen_1988_Amorphous_PEO")
   because the schema asked for one. *Fix*: not asked; attached by code.
3. **A 10,000+-token loop** writing `SMILES descriptor 1` as the whole
   polymer chain ("CCOCCOCC…"). *Fix*: length caps in the schema, which
   llama.cpp compiles into the grammar, so a runaway is impossible.
4. **The prompt never stated units.** The golden set uses °C and S/cm; a
   model faithfully copying "mS/cm" or "K" would be scored wrong. *Fix*:
   units and conventions in the field guide.
5. **Prompt caching made timings fiction**: a repeated prompt reused 6,901
   of 6,905 tokens (0.13 s instead of 24 s). *Fix*: cache off for Round 1
   (cold reads, `cache_n` recorded as a guard); deliberately on for the
   multi-call test, where reuse is part of the design.
6. **Memory not visible**: llama.cpp logs its memory breakdown only at
   `-lv 4`; the OS footprint omits the memory-mapped model file (1,974 MiB
   vs ~5,100 real). *Fix*: parse llama.cpp's breakdown.
7. **~65% of output was `null` fields, and big papers overran the output
   limit** (0a3655ba: 23 real formulations, cut off after 28 min, whole
   answer lost). *Fix*: the multi-call design (name–value pairs, no slots).
8. **"Never write null" produced 374 fabricated `0.0` conductivities** on
   one paper. *Fix*: reverted to explicit nulls for the one-call prompt
   (documented in `prompt.py`); archived under
   `experiments/local_llm/_superseded/`.
9. **Formulations merged**: the model grouped by polymer + salt and wrote the
   concentration series as a range in its notes ("O/Li ratios range from 4
   to 100") on 6 of 7 short answers. *Fix*: the listing call, with the
   definition stated outright.
10. **Log values in conductivity fields** (−7.0 instead of 1e-7), and a
    frequency sweep's `log f` column read as conductivity at 20–50 °C.
    *Fix* (multi-call): range check 1e-13..1 S/cm, dropped and counted.
11. **A sentence meant for value calls reached the listing call**: "an empty
    list is a correct answer" in the shared system prompt cut the listing
    from 6 formulations to 1. *Fix*: moved into the value-call questions;
    with an identical prompt the listing reproduced exactly (653 tokens).
12. **Placeholders in the pairs format** (`''`, `na`, `not reported`: 793 in
    six per-formulation calls). *Fix*: dropped and counted in code; the
    value-call sentence cut them sharply for per-group, erratically for
    per-formulation.

### In the golden data (not fixed; flagged)

- **Tominaga 2015 (1dba839e)**: the paper states "mol% ([Li+]/[EC])"; the
  golden rows record the same numbers as `salt wt%`, with `Li:monomer`
  computed as if they were wt%.
- **Robitaille 1986 (5feba0f9)**: the PDF's first page opens with the end of
  the previous article in the journal issue.
- **"acetone" and "dimethyl ketone"** are both used for the same solvent.
- **f3d2d4b6**: golden reference lists three authors; the paper shows one.
- **`Li:functional group`** is the golden set's main concentration column
  (filled in all 655 rows) and is often curator-computed from wt% or mol%,
  so even a perfect model can't always reproduce it. The scorer's rank
  pairing exists for this.

### In the scorer (caught by its own checks)

- Anion spellings like "TFSI (bis(…)imide)" matched nothing → 0 matches on
  the 4-paper fixture. Fixed: code-plus-name forms, longest-first search.
- Disagreeing concentrations had no fallback, so a correct model would lose
  rows where the golden value was computed differently. Fixed: rank pairing.
- "55 °C" in text-typed numeric fields scored wrong. Fixed.
- `Reference` length cap 300 was below the golden's longest (324). Fixed.

## Things Learned

- **One sentence can change a small model's behaviour somewhere you didn't
  aim it.** Twice this session (bugs 8 and 11). Change one thing at a time
  and measure. A fixed seed made identical prompts reproduce exactly, which
  is what proved each cause.
- **A grammar guarantees shape, not sense.** The SMILES loop was valid JSON
  in progress. Bounds turn "unlikely" into "impossible".
- **A cached result is not a measurement** — session 02's MinerU lesson,
  again, in the LLM server.
- **Check the instrument first.** The fixture check caught a scorer bug that
  would have reported 0% for every model.
- **Trace an aggregate to real cells.** "0% conductivity" was log values,
  placeholder zeros and a misread frequency sweep — three different fixes.
- **The golden set is not gospel** (see above).
- **A model asked for something it can't know will invent it.**
- **Prompt changes kept having side-effects somewhere else** — a third
  time with the listing quote, which made the model stop writing numeric
  concentrations. Saving every call's raw output (`--reassemble`) meant the
  fix cost minutes of code, not hours of model time.
- **Separate the model's failures from the instrument's.** Two papers with
  reasonable-looking lists paired 0 formulations because of our unit
  handling, not the model: measure the listing on its own before blaming it.

## Where to Pick Up Next Session

The agreed priority is **the first call (listing)**.

1. **Build a listing-only test loop.**
   - Run just the first call on the 10 papers: ~1 min per paper, so
     ~10–15 min per experiment.
   - Score it alone: formulation recall (answer-sheet formulations found)
     and precision (entries that are real).
2. **Fix the scorer's pairing blind spots first**, so the listing score
   measures the model rather than our tools:
   - convert mol% where the paper defines it;
   - investigate why 663ed327's 6 formulations paired 0.
3. **Attack the four listing failure kinds:**
   - unpairable units;
   - the quote check dropping table-header evidence (idea: when a quote
     fails, check the ratio token itself, e.g. "16:1", against the paper);
   - runaways (two papers hit the 60 cap);
   - genuine under-listing (5feba0f9).

   **The user wants to propose solutions first — my ideas were not shared
   yet.** Ask before presenting them.
4. **Then the value calls.**
   - Per group, with "ALL" offered only in the processing group. The ~1 h
     re-run to confirm the thermal fix is not yet done.
   - Figures in the conductivity call (text-only models found almost no
     conductivities).
   - Source quotes on values.
5. **Compute derived values in code:** concentration conversions with molar
   masses, and VFT/Arrhenius fits from the extracted points.
6. **Fine-tuning (LoRA)** after the format settles; see Discussion.
7. **Other model sizes** (9B, 12B) in the new format, rather than finishing
   Round 1.
8. **Deployment:** an Ollama bundle, and check that MinerU runs offline.
9. **`~/.claude/CLAUDE.md`** still has the "Use simply english" line. The
   user prefers the jargon-explained style; I offered to delete the line,
   not done.
10. **Git:** nothing committed this session. `models/` is gitignored;
    `experiments/` and `output/` are large and regenerable.

## How to Run What Exists

```bash
export PATH="/Users/merlin/.local/bin:$PATH"     # mineru, hf

# One paper, production path (llama-server must be running, see settings.yaml)
llama-server -m models/qwen3.5-4b/Qwen3.5-4B-Q4_K_M.gguf -c 49152 -np 1 --reasoning off --offline --port 8080
.venv/bin/python -m pipeline.cli extract bdf71b01 --no-figures

# Scorer
.venv/bin/python -m pipeline.evaluation.evaluate --self-test
.venv/bin/python -m pipeline.evaluation.evaluate output/extracted

# Round 1 (starts/stops its own server)
.venv/bin/python -m pipeline.experiments.run_local_llm_benchmark --list
.venv/bin/python -m pipeline.experiments.run_local_llm_benchmark --arm A-qwen3.5-4b
.venv/bin/python -m pipeline.experiments.local_llm_report

# Multi-call comparison (starts/stops its own server)
.venv/bin/python -m pipeline.experiments.run_multistage_benchmark
.venv/bin/python -m pipeline.experiments.run_multistage_benchmark --summary-only
```

## Reference Notes (don't rediscover these)

- llama-server: always pass `-c` (otherwise `--fit` may shrink the
  context); `-np 1`; `--reasoning off`; `-lv 4` to get the memory breakdown;
  an over-long prompt returns HTTP 400 `exceed_context_size_error` (verified).
- Ollama silently truncates over-long prompts and defaults to a 4,096-token
  context on every 8–32 GB Mac; the client's `prompt_truncated` check exists
  for this.
- Qwen3.5 tokenizer: 248,320-piece BPE vocabulary; every digit is its own
  token; our papers average ~3.1 characters per token.
- The answer sheet has **22** conductivity columns (0–125 °C), not 18.
- This M4 MacBook Air reports an 18,186 MiB GPU budget (~74% of 24 GB).
- Speeds here: Qwen3.5-4B reads ~200–310 tokens/s and writes ~16–26 tokens/s
  (slower as the context grows and as the fanless Mac warms up).
- NuExtract3 returned 1 formulation on 8 of 10 papers in Round 1 — general
  extraction fine-tuning did not fix the merging.
