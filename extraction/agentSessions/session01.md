# Agent Session 01 — Handoff Report

**Date**: 2026-09-19 to 2026-09-21
**Scope**: planned and built the PDF-extraction pipeline (Milestones 0-4 of
the approved plan) from a project that previously had only a `.venv` and
some exploratory paper-download code left over from earlier sessions.
Stress-tested the parsing sub-pipeline across the full 63-paper corpus,
found and fixed 8 real bugs/gaps, and switched the pipeline to MinerU's
`advanced` tier after empirically confirming it recovers real data that
`standard` tier misses. Committed the initial scaffolding to git.

For *why*-focused teaching material (concepts, design reasoning, the full
narrative of each fix) see `study_session/session03.md` — one file, one
Claude session, covering everything below in more depth. This doc is the
terse status/continuity version: what exists, what broke, what to do next.

## What Was Built

**Milestone 0 — Setup.** `git init`; MinerU 4.0.4 installed via `uv tool
install` (isolated from the project's own `.venv`); local `advanced`-tier
parse server downloaded, configured, and verified healthy. Project
dependencies (`anthropic`, `openai`, `pydantic`, `rdkit`, `rapidfuzz`, etc.)
installed into `.venv`.

**Milestone 1 — Target schema.** `pipeline/schema_columns.py` defines the
76-column LLM-extraction target (verified empirically that the golden
CSV's other ~230 columns are either RDKit/Mordred cheminformatics
descriptors or deterministic lookups, not paper-reported facts).
`pipeline/scripts/make_golden_reported.py` slices this into
`data/golden_reported.csv`.

**Milestone 2 — PDF parsing.** `pipeline/parsing/` (`mineru_cli.py`,
`parse_paper.py`, `manifest_schema.py`) drives MinerU as an external
CLI/server via subprocess, producing per-paper `content.md` + cropped
figure PNGs + a `manifest.json` under `output/parsed/{paper_id}/`.
`pipeline/batch/run_parsing_batch.py` runs this across all 63 papers into
`data/parsing_performance.csv`, a QA dataset with automated columns
(timing, figure/table/caption counts) and blank manual columns for
accuracy ratings.

**Milestone 3 — Swappable LLM client.** `pipeline/extraction/llm_client/`:
a provider-agnostic `LLMClient` Protocol (`base.py`), a real
`claude_client.py`, and an `openai_compatible_client.py` for future
self-hosted models — both proven against the same interface. Provider and
model are config-driven (`pipeline/config/settings.yaml`), not hardcoded.

**Milestone 4 — Extraction schema + prompt.** `pipeline/extraction/schema.py`
(the 76-field `FormulationRecord` pydantic model, field types derived from
actual data, not column-name guessing) and `prompt.py` (system prompt +
request assembly, figures paired with their captions). Verified
structurally end-to-end; the live API call is the one thing not yet
tested (see Blockers).

Current milestone status against the approved plan
(`/Users/merlin/.claude/plans/plan-the-approach-and-crystalline-snail.md`):

| Milestone | Status |
|---|---|
| 0 — git + MinerU install | Done |
| 1 — reduced golden schema | Done |
| 2 — parsing sub-pipeline | Done, tested on all 63 papers, 0 failures |
| 3 — LLM client abstraction | Done, structurally verified |
| 4 — extraction schema + prompt | Code done, dry-run verified; live call untested |
| 5 — full 63-paper LLM-extraction batch | Not started |
| 6 — evaluation harness | Not started |

## Bugs Encountered & How They Were Resolved

1. **MinerU `--json` output breaks strict JSON parsing.** Raw control
   characters appear inside embedded log fields. *Fix*: parse with
   `json.loads(raw, strict=False)` in `mineru_cli.py`.

2. **Continuation logic only handled one of two real shapes.** Built
   against a short paper where continuation used an `after`-cursor;
   broke immediately on a 9-page paper where MinerU instead returned a
   new `page_range` to request next (`next_request.after` was null).
   *Fix*: check `after` first, fall back to `page_range`-based
   continuation, raise loudly if neither is present rather than silently
   returning truncated content.

3. **`--wait 60` (CLI default) routinely timed out on real papers.**
   `standard` tier runs a `flash` pass then a `standard` pass internally,
   which often exceeds 60s. The parse job kept succeeding server-side even
   after the CLI gave up. *Fix*: raised the default wait to 180s and added
   retry-with-longer-wait on timeout, which reconnects to the
   already-finished job instead of reparsing from scratch.

4. **The error code for #3 didn't match the mineru skill's own docs.**
   Docs say `parse_timeout`; the real code returned is `parse_wait_timeout`.
   *Fix*: mapped both codes to the same retryable exception class.

5. **Figure captions weren't found for multi-panel figures.** First
   caption-search implementation only looked between one figure and the
   *next* figure block; multi-panel figures share one caption after the
   *last* panel, so every panel but the last showed "no caption." *Fix*:
   widened the search to a character budget instead of "next figure
   block," and separately added support for "Scheme N" captions (a
   chemistry-paper convention for structure diagrams, distinct from
   "Figure N").

6. **Table-counting regex silently returned 0 on a paper with real
   tables.** The character class `[\s:-]` didn't include `|`, so a GFM
   table's separator row (which has internal pipes at every column
   boundary) never matched. *Fix*: one-character regex fix (`[\s:|-]`).

7. **A config value existed but nothing read it.**
   `pipeline/config/settings.yaml`'s `mineru.tier` field was defined, but
   three separate call sites each hardcoded `"standard"` independently.
   Changing the config would have silently done nothing. *Fix*: made
   `parse_paper()`'s tier parameter default to `load_config().mineru_tier`
   instead of a hardcoded string.

8. **Switching to `advanced` tier caused a caption-hit-rate regression,
   which led to a second, unrelated bug.** `advanced` tier keeps more body
   text between a diagram and its caption than `standard` did (measured a
   real case at 7406 characters, nearly double the existing 4000-char
   search window). *Fix*: widened to 8000 and recomputed captions for all
   63 papers directly from already-saved markdown, no MinerU re-run
   needed. While investigating this, separately found that re-parsing
   never cleared a paper's `figures/` directory, so switching tiers left
   old crops orphaned on disk (one paper had 6 stale PNGs for a manifest
   listing only 1 current figure). *Fix*: clear the directory before each
   parse; cleaned up 485 already-accumulated stale files.

## Things Learned From Fixing These Bugs

- **A tool timing out is not the same as a job failing.** Bug #3's fix
  only worked because the actual MinerU job queue was checked
  (`mineru list parses --json`) instead of assuming a CLI error meant the
  work was lost.
- **A documented error code is a claim, not a guarantee.** Bug #4 was
  only caught because the real error text was read directly rather than
  trusted to match the skill's own docs — this happened twice this session
  (also true of MinerU's figure-locator field, which isn't documented at
  all and had to be found by reading real `--json` output).
- **Fail loudly on an unrecognized shape, don't silently degrade.** Bug
  #2's fix specifically preserved a hard failure for the "neither shape
  matches" case — a version that silently kept going would have returned
  truncated documents with no error, which is a much worse failure mode
  than a crash.
- **A higher match-rate number doesn't confirm the matches are correct.**
  Bug #5's fix was verified by opening the actual resulting image+caption
  pairs, not just by the hit-rate percentage going up — that's what caught
  the "Scheme" vs. "Figure" gap, which a pure numbers check would have
  missed.
- **A config file is only a real source of truth if something reads it.**
  Bug #7 — the value looked authoritative and wasn't.
- **When an aggregate metric moves the wrong direction, trace it to a
  specific example before accepting or dismissing it.** Bug #8's caption
  regression, and the later figure-count/table-count investigation
  prompted by the user's question, were both resolved by tracing one real
  paper's before/after in detail rather than treating the aggregate number
  as self-explanatory. That tracing turned up a genuinely good finding
  (MinerU's `advanced` tier digitizes some chart data directly into tables
  instead of leaving it as an image) that a surface-level reading of the
  numbers would have missed entirely.
- **For fast-moving SDKs, introspect the installed version rather than
  trust training-data memory.** The `openai` package here is version
  3.16.2; `inspect.getsource()` on the real installed TypedDicts confirmed
  the current `response_format`/image-block shapes rather than risking a
  confidently-wrong guess.

## Where to Pick Up Next Session

1. **Blocked on you**: no `ANTHROPIC_API_KEY` is configured anywhere on
   this machine. Copy `.env.example` to `.env` and fill one in
   (`python-dotenv` loads it automatically via `pipeline/config_loader.py`)
   — this unblocks everything below.
2. Run the first live Milestone 4 extraction test against the two
   already-parsed, already-familiar sample papers (`0a011d54` tominaga2012,
   `75972f89` itoh2013 — `.venv/bin/python -m pipeline.cli extract
   0a011d54`), hand-verify output against the actual PDFs. Their figure
   labels now include captions, so this also tests whether that context
   helps extraction quality.
3. Milestone 5: extend `pipeline/batch/` with the LLM-extraction half —
   loop `extract` over all 63 parsed papers, per-paper error isolation,
   structured logging. Consider the Message Batches API (50% cost) once
   the prompt is stable.
4. Milestone 6: the evaluation harness (`pipeline/evaluation/`, currently
   an empty package) — paper-to-golden-row mapping (fuzzy DOI/surname+year
   matching, human-reviewed once), row matching within a paper, per-column
   scoring (log-scale tolerance for conductivity columns), and a
   report/summary output. Full design in the plan doc's Stage 3 section.
5. You: `data/parsing_performance.csv` is ready for manual QA with final
   `advanced`-tier numbers (166 figures/144 captioned, 367 tables across
   all 63 papers, 0 failures) — good starting points are papers with
   `wait_retries > 0` or low `content_md_chars` relative to `page_count`.
6. Continue the `study_session/session0N.md` teaching write-up pattern —
   one file per actual Claude session, not per milestone or per topic
   (this was gotten wrong once this session and corrected; see
   `study_session/session03.md`'s note on it).

## How to Run What Exists

```bash
export PATH="/Users/merlin/.local/bin:$PATH"   # MinerU's uv-tool install; needed in a fresh shell

# Parse one paper (MinerU) -> output/parsed/{paper_id}/
.venv/bin/python -m pipeline.cli parse "papers/0a011d54-tominaga2012.pdf"

# Run LLM extraction on an already-parsed paper -> output/extracted/{paper_id}/
# (needs ANTHROPIC_API_KEY in .env first)
.venv/bin/python -m pipeline.cli extract 0a011d54

# Full 63-paper parsing batch -> data/parsing_performance.csv
.venv/bin/python -m pipeline.batch.run_parsing_batch

# Rebuild the reduced golden schema CSV, if the source golden CSV ever changes
.venv/bin/python -m pipeline.scripts.make_golden_reported
```

## Reference Notes (don't rediscover these)

- `data/matched_papers_headers_only.csv` is byte-identical to
  `data/matched_papers_filled.csv` — redundant; Milestone 6 will likely
  want `ground_truth_matched_papers_data.csv` (golden) +
  `matched_papers_filled.csv` (predicted stand-in) as a 4-paper smoke-test
  fixture.
- DOI coverage in `data/parsing_performance.csv` is low (4/63) — only
  DOI-named PDF filenames yield one via the current heuristic; the rest
  need Milestone 6's fuzzy matching, deliberately not attempted here.
- MinerU is on `PATH` via `~/.local/bin` (isolated `uv tool` install,
  separate from the project's `.venv`) — needs the `export PATH=...` line
  above in a fresh shell until a new terminal picks up `uv tool
  update-shell`'s `.zshenv` change.
