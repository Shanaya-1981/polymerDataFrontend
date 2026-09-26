# Agent Session 02 — Handoff Report

**Date**: 2026-09-21 to 2026-09-22
**Scope**: ran a controlled experiment comparing MinerU's parsing modes,
which surfaced two structural defects in how the pipeline feeds an LLM
(figures unlinked from the text; temperatures mangled or destroyed). Built
a third parsing mode to fix the first, a markdown normaliser to fix the
second, and re-parsed the whole 63-paper corpus. 9 real defects found in
the pipeline/data, 7 more in code written during this session.

Prior handoff: `session01.md` in this directory (Milestones 0-4), the
direct predecessor to this one.

## What Was Built

**Tier-comparison experiment** — `pipeline/experiments/`, outputs in
`experiments/tier_comparison/`.

- `select_sample.py` — draws a **pinned** 10-paper benchmark set, stratified
  5 old (pre-1995) + 5 modern, seed `20260921`. Reused by every future
  experiment so a difference between runs is attributable to the change
  being tested, not to easier papers. Reproducible from the seed alone
  (verified: deleting and regenerating returns the identical 10 papers,
  fingerprint `5ff0e8f1`). `--resample` is required to redraw and
  invalidates comparability with everything recorded before it.
- `run_tier_comparison.py` — parses each paper in three modes side by side,
  resumable, per-paper error isolation, `--metrics-only` to rebuild the
  CSVs from disk without re-parsing (needed four times when a metric
  changed; a metric fix should never cost 40 minutes).
- `metrics.py` — content metrics aimed at what this project needs: numbers
  recovered *inside tables*, rows digitised off plots, and flattened cells.
- `report.py` — generates `SUMMARY.md`, pivoting the long CSV into
  side-by-side tables.

**Hybrid parsing mode** — `parse_paper_hybrid()` in
`pipeline/parsing/parse_paper.py`, selected by `mineru.figure_tier` in
`settings.yaml`. Takes text/tables from `advanced` and figure crops from
*both* tiers, namespaced `figures/{tier}/pageN-blockM.png`.
`parse_paper_auto()` is the single dispatcher both the CLI and the batch
runner call, so the config value is genuinely the switch it looks like.

**Figure-to-text anchoring** — `pipeline/parsing/figure_links.py`. Rewrites
MinerU's dead internal locator into (a) a real relative image path on disk,
so `content.md` renders during manual QA, and (b) an explicit anchor in the
LLM prompt that is byte-identical to the attached image's own label.
Backfilled into existing parses by `pipeline/scripts/rewrite_figure_links.py`.

**Markdown math normalisation** — `pipeline/parsing/md_cleanup.py`, applied
at parse time and backfilled by `pipeline/scripts/clean_parsed_math.py`.
Escapes literal dollars, converts temperature-only math spans to plain
text, and maps text-mode LaTeX commands to math-mode equivalents.

**`--force` support** — `MineruCLI.parse(force=...)`, threaded through
`parse_paper` and exposed as `python -m pipeline.cli parse --force`.

**Corpus re-parse** — all 63 papers re-parsed as hybrid.

| | advanced-only | hybrid |
|---|---|---|
| Figure crops | 166 | **752** |
| With a caption | 144 | **712** |
| Papers with **zero** crops | **13** | **0** |
| Tables (GFM-only count) | 367 | 367 |

Experiment result across the 10-paper sample:

| Metric | standard | advanced | hybrid |
|---|---|---|---|
| Tables | 16 | 80 | 80 |
| Table rows | 155 | 1124 | 1124 |
| &nbsp;&nbsp;digitised from plots | 0 | 889 | 889 |
| Numbers in tables | 1165 | 4529 | 4529 |
| Flattened cells (data destroyed) | **20** | 0 | 0 |
| Figure crops | 115 | 33 | **148** |

Each mode has exactly one failure mode, and they are different ones:
`standard` keeps charts as images but flattens complex tables; `advanced`
recovers the tables but discards the chart image once it has digitised it;
`hybrid` has neither. Hybrid's body text *is* advanced's text by
construction — the modes differ only in figures.

## Bugs Encountered & How They Were Resolved

### In the pipeline and its data

1. **A cached parse was being recorded as a measurement.** MinerU caches by
   file **sha256**, not path, so re-parsing an already-seen PDF replays the
   cached result in ~0s. `data/parsing_performance.csv` recorded `bdf71b01`
   at **0.3s** in the "advanced" batch — that row was a cache replay, not a
   parse. *Fix*: `--force` on the **first** request only — never on a
   continuation request (which would re-parse the document once per
   continuation) and never on a wait-timeout retry (which would discard the
   job still running server-side, defeating session 01's bug #3 fix).

2. **`count_markdown_tables()` counts GFM tables only.** 16 of 63 papers
   contain HTML `<table>` blocks (25 in total) that it never counts — and
   HTML is what MinerU reaches for on merged-cell tables, i.e. the complex
   ones. *Status*: **still unfixed**, deliberately; see "Pick up next".

3. **`standard` tier flattens multi-row tables into concatenated digits.**
   `| LiTFSI | 20406080 | 45424343 | 1755174817461749 |` is four rows
   (20/40/60/80 mol%) mashed into one. The digits all survive, so a
   character count or a number count still looks healthy, but the
   measurements are unrecoverable. 20 such cells in the sample. *Fix*: none
   possible at the parse level — it is a reason to prefer `advanced` text,
   and it is now measured as the `concat_cells` metric.

4. **`advanced` tier discards a chart's image once it has digitised it.**
   33 crops where `standard` kept 115 — 82 discarded. On `6ca669ae` and
   `f3d2d4b6` it emitted 311 and 62 rows of digitised chart data and **zero**
   images. A hand-check of `6ca669ae` found one 246-row digitised Arrhenius
   plot with a misread axis (`1000/T` spanning 27.3-100, i.e. T = 10-37 K,
   and `log sigma` up to +3.4 S/cm — better than copper) sitting beside
   *correctly* digitised tables in the same document. So the mode that
   produced the wrong numbers had also thrown away the only thing that could
   catch them. *Fix*: the hybrid mode.

5. **Figure markers in `content.md` pointed at nothing.** MinerU emits
   `![Chart block](doc:9c87b64/tier:standard/page:4/block:3)`. That locator
   resolves for neither a markdown viewer nor the LLM. The crop *was* being
   attached, labelled `Figure (page 4, block 3)` — so a shared key existed,
   but in two different formats with nothing in the prompt saying they
   referred to the same object. *Fix*: one shared anchor string emitted
   identically inline and as the image label, plus a prompt section stating
   the convention.

6. **An escaped literal dollar silently swallowed the rest of a page.**
   Journal page furniture carries prices (`CCC: \$27.50`). That is correct
   markdown, but it leaves an odd number of `$` on the line, and a math
   scanner that ignores the backslash pairs it with the *next* `$` in the
   document. On `0a3655ba` one such dollar swallowed 475 characters across
   13 lines — including the sentence "glass transition temperature, where
   the relaxation disappears". **The temperature had parsed correctly and
   was still unreadable.** 59 lines across 54 of 83 files, and 100% of the
   corpus's unbalanced-`$` lines had this one cause. *Fix*: emit `&#36;`,
   which renders as `$` and contains no `$` to mis-pair.

7. **The degree ring was sometimes OCR'd as a digit zero.**
   `$^\textrm{\scriptsize 4 5}^{\scriptsize\textrm{\scriptsize 0}}\mathbf{C}$`
   is 45 °C but reads literally as **450 °C** — a corrupted value, not just
   ugly markup. 4 papers. *Fix*: recover it, keyed on the zero being in a
   *superscript group immediately before the unit letter* — never on the
   magnitude of the number, so a genuine 450 °C or 1200 °C passes through
   untouched. Each of the 4 was confirmed against the paper's own prose
   first (e.g. `d4892d64` writes "22 °C" and "-49 °C" correctly with
   `\circ` in the same sentence).

8. **One temperature was written 351 different ways**, 15 of them invalid
   LaTeX (mostly `^\mathrm{~55~}^{\circ}C` — a superscript immediately
   followed by another superscript). *Fix*: convert temperature-only spans
   to plain `70 °C`, which fixes rendering and makes the value directly
   readable by the LLM rather than arriving wrapped in markup.

   Net effect, measured by rendering every math span through KaTeX 0.18.7.
   Two figures, because the *extraction* method had to be corrected partway
   through (the first one paired `$$` across lines, the same bug as #15):

   - Unbalanced-`$` lines, a direct count and method-independent:
     **59 → 1**.
   - Line-local extraction, which is how a renderer actually pairs
     delimiters: **1 of 11144 spans fails today, and it is a garbled author
     name, not a temperature.**
   - For scale, the first (cross-line) sweep over the untouched files found
     34 failures of which 15 were degree spans. That is not directly
     comparable to the 1 above — the equivalent line-local baseline was
     never captured before the files were rewritten.

9. **One genuinely unterminated math span.** `output/parsed/d6ac09cf/content.md:297`
   — MinerU escaped what should have been the closing delimiter. *Status*:
   **still unfixed**; one line, and the intended boundary is a guess.

### In code written during this session

These are listed because each one would have silently under-delivered or
produced a wrong conclusion, and the pattern is more instructive than the
individual fixes.

10. **The table metric was blind to the tier it was evaluating.** The first
    version counted GFM tables only, and `advanced` emits HTML for
    merged-cell tables — so a correctly recovered 13-row table scored as
    **zero tables**. The metric was biased against the thing under test.
    *Fix*: count both. The measured gap moved from 4-vs-1 tables to
    5-vs-1, and 119-vs-25 numbers to 189-vs-25.

11. **The flattened-cell detector fired on legitimate decimals.** `\d{6,}`
    matched the zeros in `0.000015`, producing 18 false positives on one
    paper and making `advanced` look like it flattened tables when the
    values were correct conductivities `standard` had not recovered at all.
    *Fix*: require the run to be a bare integer, not part of a decimal.

12. **The temperature regex could not match MinerU's own output.** MinerU
    letter-spaces digits (`1 2 0` for 120); the value pattern expected
    `\d+`. Nothing matched at all until digit runs were rejoined first.

13. **The digit-preservation guard counted its own fix as data.** The
    literal-dollar replacement emits `&#36;`, whose `36` read as two digits
    appearing from nowhere.

14. **The guard then blocked a legitimate change — correctly.** Recovering
    `^{45}^{0}C` as `45 °C` *deliberately* deletes a zero, so a
    "digits must be identical" check refused 4 files. *Fix*: make the guard
    more precise rather than looser — `_only_zeros_deleted` allows a zero
    to vanish but rejects any reordering, insertion, or loss of a non-zero
    digit.

15. **A document-wide `$$...$$` with `DOTALL` paired across the whole
    file.** The first `$$` matched the next one *anywhere later*, swallowing
    regions of ordinary inline spans into one bogus "display" match and
    **silently skipping 33 convertible spans**. Discovered only because a
    span that converted fine in isolation refused to convert in its file.
    *Fix*: make the transform line-local — MinerU never emits inline math
    across a newline, so a line is the natural unit and the pairing cannot
    run away.

16. **Escaping mangled through a nested heredoc** produced
    `re.PatternError: bad escape \l`. *Fix*: write the block to a file
    plainly and splice it in, instead of hand-escaping through three layers.

## Things Learned From Fixing These Bugs

- **A cached result is not a measurement.** Bug #1's 0.3s row looked like a
  fast parse and was a replay. Any experiment that reports a duration has
  to defeat the cache first, or its timing column is fiction.
- **Check that your instrument can see the thing you are evaluating.** Bug
  #10 is the sharpest lesson of the session: the metric was structurally
  incapable of observing `advanced`'s main advantage, and it would have
  produced a confident, wrong, well-formatted conclusion.
- **Trace an aggregate to one real example before believing it.** Bugs #4,
  #11 and #15 were all caught that way — the 18 false positives in #11
  looked exactly like a genuine finding until the actual strings were read.
- **A guard that blocks a legitimate change is working.** The instinct in
  #14 is to loosen the check; the right move was to make it state the
  property actually wanted (only zeros may be deleted), which is both
  stricter and more permissive than "digits must match".
- **In a paired comparison, alternate the order.** It was not hypothetical:
  `standard` ran about twice as fast when it went second (6.4 vs 13.3
  s/page) while `advanced` was stable. A fixed order would have baked that
  into the headline ratio invisibly. Recording `first_tier` made the effect
  visible in the data instead.
- **Separate reformatting from inference, and make inference auditable.**
  Two of the three markdown fixes only change spelling; the degree-as-zero
  rule decides what the page *meant*. It is the only one that is logged in
  full and switchable (`mineru.recover_degree_as_zero`) — a distinction
  worth keeping whenever a pipeline is pointed at a new corpus.
- **Regex state that spans a whole document is fragile** (#15). Prefer the
  smallest unit the data actually uses.
- **"It failed to extract X" can mean X was extracted and then made
  unreadable.** Bug #6 is the clearest case: the temperature parsed
  perfectly and was lost to a delimiter three paragraphs earlier. Worth
  checking *downstream of* a correct parse before blaming the parser.
- **Reproducibility is cheap if designed in.** Re-running the whole
  experiment from scratch reproduced the earlier numbers exactly (155/1124
  rows, 889 digitised, 20 flattened, 115/33 crops), which is what made it
  safe to delete `experiments/` and rebuild.

## Where to Pick Up Next Session

1. **Still blocked on you**: no `ANTHROPIC_API_KEY` anywhere on this
   machine. Copy `.env.example` to `.env` and fill one in. Nothing
   downstream of parsing has ever run, so *none* of this session's work is
   yet validated against extraction quality — the 586 extra crops and the
   figure anchoring are structurally verified and empirically untested.
2. **Fix `count_markdown_tables()`** (bug #2, `pipeline/parsing/parse_paper.py:26`) to count
   HTML tables. One line; `data/parsing_performance.csv`'s 367 is an
   undercount and can be rebuilt from saved markdown without re-parsing.
   Left alone this session only because it was outside the asked scope.
3. **Patch `output/parsed/d6ac09cf/content.md:297`** (bug #9) by hand.
4. **Milestone 5** — the LLM-extraction batch over all 63 hybrid parses.
   The first real test should be `5feba0f9` (32 crops) or `6ca669ae`
   (the misread-axis paper), since both stress the new figure handling.
5. **Milestone 6** — the evaluation harness. This is now the only way to
   answer the question the whole session raises: does hybrid's extra
   figure context actually improve extraction, and do the `~`-marked
   digitised values help or hurt?
6. **Kelvin is not normalised.** `$1733\;\mathrm{K}$` stays as LaTeX
   because it has no degree symbol. Renders fine, just less readable to the
   LLM than the `°C` values now are.
7. **Git**: `output/parsed` (63 MB) and `experiments/` (34 MB) are
   untracked and mostly regenerable binary. `experiments/README.md` has
   suggested `.gitignore` lines. Nothing has been committed this session.

## How to Run What Exists

```bash
export PATH="/Users/merlin/.local/bin:$PATH"   # mineru; needed in a fresh shell

# Parse one paper per settings.yaml (hybrid by default)
.venv/bin/python -m pipeline.cli parse "papers/0a011d54-tominaga2012.pdf"
.venv/bin/python -m pipeline.cli parse "papers/..." --figure-tier none --force

# Full 63-paper batch -> data/parsing_performance.csv
.venv/bin/python -m pipeline.batch.run_parsing_batch

# Tier experiment (pinned sample, three modes)
.venv/bin/python -m pipeline.experiments.select_sample
.venv/bin/python -m pipeline.experiments.run_tier_comparison
.venv/bin/python -m pipeline.experiments.run_tier_comparison --metrics-only
.venv/bin/python -m pipeline.experiments.report

# Backfills for parses made before this session's fixes (no re-parse)
.venv/bin/python -m pipeline.scripts.rewrite_figure_links --dry-run
.venv/bin/python -m pipeline.scripts.clean_parsed_math --dry-run
```

## Reference Notes (don't rediscover these)

- MinerU caches by **file sha256**, not path. A copy of a parsed PDF is a
  cache hit. `mineru parse --force` exists; `mineru invalidate` also.
- `mineru list parses --json` is the ground truth for what actually ran.
- MinerU emits tables as **either** GFM pipes **or** HTML `<table>` with
  rowspan/colspan. Any table metric must handle both.
- Digitised chart rows are marked `~` and carry a `Series` column. 79% of
  `advanced`'s table rows in the sample are these, not printed tables.
- Crops for the same `(page, block)` differ between tiers — 20 same-named
  pairs checked, **0 byte-identical**, some differing 3-4x in size. So
  neither `(page, block)` nor a content hash is a safe dedup key; hybrid
  keeps both crops rather than risk dropping a figure.
- `data/parsing_performance_advanced_only.csv` is the pre-hybrid baseline.
  The current CSV's timing column is cache-inflated and meaningless.
- KaTeX 0.18.7 was installed in the session scratchpad to validate math
  spans; it is not a project dependency and is gone.
