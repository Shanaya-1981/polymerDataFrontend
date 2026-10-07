# Experiments

Controlled comparisons of pipeline choices, kept apart from production runs
(`output/`, `data/parsing_performance.csv`) so an experiment can never be
mistaken for the real pipeline's output.

## The pinned sample

`tier_comparison/sample.json` holds a fixed 10-paper benchmark set, drawn
once and **reused by every experiment from here on**. If each experiment
drew its own papers, a difference between two results could come from the
change being tested or from the papers being easier that time, and nothing
would tell you which.

It is stratified 5 old (pre-1995) + 5 modern, because the corpus runs
1984-2020 and parser behaviour diverges most on old scanned papers. A
uniform draw of 10 from 63 would average ~1.4 old papers and could contain
none. The cost is that pooled numbers are not a corpus-wide average — read
the per-stratum tables.

The draw is reproducible from the seed alone, so deleting `sample.json` and
regenerating gives back the identical 10 papers. `--resample` changes them
and invalidates comparability with everything recorded before it.

```bash
.venv/bin/python -m pipeline.experiments.select_sample            # show the pinned sample
.venv/bin/python -m pipeline.experiments.select_sample --resample # redraw (breaks comparability)
```

## The three modes

| mode | text and tables | figure crops |
|---|---|---|
| `standard` | standard tier | standard tier |
| `advanced` | advanced tier | advanced tier |
| `hybrid` | advanced tier | **both** tiers |

`advanced` reads data points off plots into tables, and having done so it
emits no crop for that chart. `hybrid` pairs advanced's text with every
crop either tier produced, so a digitised value and the plot it came from
are both available. Hybrid's body text *is* advanced's body text — the two
differ only in figures.

## Running it

```bash
export PATH="/Users/merlin/.local/bin:$PATH"   # mineru lives in ~/.local/bin

# All 10 papers, all three modes (~40 min). Resumable: re-running reuses
# any mode already on disk.
.venv/bin/python -m pipeline.experiments.run_tier_comparison

# One paper, for debugging
.venv/bin/python -m pipeline.experiments.run_tier_comparison --only 1dba839e

# Rebuild the CSVs from parses already on disk, no MinerU (seconds).
# Use after editing metrics.py -- a metric fix should never cost a re-parse.
.venv/bin/python -m pipeline.experiments.run_tier_comparison --metrics-only

# Rebuild SUMMARY.md from the CSVs
.venv/bin/python -m pipeline.experiments.report
```

## Layout

```
tier_comparison/
  sample.json        the pinned 10 papers, the seed, the strata
  comparison.csv     long: one row per (paper, mode)
  pairwise.csv       one row per (paper, mode pair): similarity + value diffs
  SUMMARY.md         generated read-out, three modes side by side
  {paper}/
    {paper}.pdf      copy of the source PDF, so the folder stands alone
    number_diff.json values found by only one tier
    standard/        content.md + manifest.json + figures/
    advanced/        content.md + manifest.json + figures/
    hybrid/          content.md + manifest.json + figures/{standard,advanced}/
```

`comparison.csv` is long rather than wide on purpose: three modes x ~12
metrics as one row per paper would be a 40-column row nobody can read, and
adding a fourth mode would rename every column. `SUMMARY.md` pivots it for
side-by-side reading.

## Note on git

These folders hold copied PDFs and figure crops — tens of megabytes of
regenerable binary. The small durable records are `sample.json`,
`comparison.csv`, `pairwise.csv`, `SUMMARY.md` and each `number_diff.json`.
If this gets committed, consider ignoring the rest:

```gitignore
experiments/**/*.pdf
experiments/**/figures/
experiments/**/content.md
```

---

# Local-LLM benchmark (`local_llm/`)

Which on-device model extracts the data best on a machine with 8 or 16 GB of
RAM, measured on the same pinned 10 papers and scored against the golden CSV.
`local_llm/RESEARCH.md` explains how the candidates were chosen;
`local_llm/SUMMARY.md` is the generated read-out.

An **arm** is one model plus one set of settings, defined in
`local_llm/arms.yaml`. The runner starts `llama-server` itself from that
definition, so an arm is reproducible from the file alone, and it stops the
server when the arm finishes or fails.

```bash
# needs llama.cpp (brew install llama.cpp) and the GGUF files under models/
.venv/bin/python -m pipeline.experiments.run_local_llm_benchmark --list
.venv/bin/python -m pipeline.experiments.run_local_llm_benchmark --arm A-qwen3.5-4b
.venv/bin/python -m pipeline.experiments.run_local_llm_benchmark --arm A-qwen3.5-4b --only bdf71b01

# Re-score saved extractions without a model, e.g. after editing the scorer
.venv/bin/python -m pipeline.experiments.run_local_llm_benchmark --arm A-qwen3.5-4b --score-only

# Rebuild SUMMARY.md from what every arm saved
.venv/bin/python -m pipeline.experiments.local_llm_report

# The scorer's instrument checks -- run after any change to pipeline/evaluation/
.venv/bin/python -m pipeline.evaluation.evaluate --self-test
```

A re-run of an arm skips papers that already succeeded, so it can look as if
nothing happened; pass `--redo` to force them.

```
local_llm/
  arms.yaml          arm definitions (model file, context, KV cache, figures)
  RESEARCH.md        desk research: candidates, runtimes, browser, deployment
  SUMMARY.md         generated results
  logs/round1.log    console output of the full run
  {arm}/
    arm.json         server command, llama.cpp version, memory breakdown
    server.log       llama-server's log
    scores.json      totals; scores_papers.csv / scores_cells.csv for detail
    {paper}/         raw_llm_response.json, extraction.json, run.json
```

---

# Multi-call extraction (`multistage/`)

List the formulations first, then fill in values either one call per field
group or one call per formulation (`pipeline/extraction/multistage.py`). Same
model and papers as the local-LLM benchmark; `multistage/SUMMARY.md` compares
both layouts with Round 1's single call.

```bash
.venv/bin/python -m pipeline.experiments.run_multistage_benchmark            # full run (~4 h)
.venv/bin/python -m pipeline.experiments.run_multistage_benchmark --reassemble  # rebuild from saved raw outputs, no model
```
