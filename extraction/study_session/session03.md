# Session 3 — Building the PDF-Extraction Pipeline

## Summary

This session pivoted the project from hands-on CS fundamentals (sessions 1-2)
to the actual data-extraction pipeline. Per your direction, I (Claude) wrote
the code directly this time rather than walking you through typing it — but
this doc exists so you can study *why* things are built the way they are, as
if a future apprentice inherited this codebase cold.

Across this one continuous session we: explored the project state and
discovered the golden CSV's real structure; designed the pipeline
architecture and evaluation methodology; built and verified Milestones 0-4
(setup, PDF parsing, the swappable LLM client, and the extraction
schema/prompt); stress-tested the parsing sub-pipeline against the full
63-paper corpus and fixed three real bugs it surfaced, plus a design gap you
caught (figures with no caption context); and, after you questioned whether
MinerU's `advanced` tier was worth using, ran a real comparison and switched
the pipeline to it, which surfaced and fixed two more bugs. This single file
covers all of that, in the order it happened.

## Part 1 — Kickoff: Schema Discovery, Git, MinerU Install (Milestones 0-1)

### The golden CSV is not a 305-column extraction target — verify, don't assume

The immediate temptation on seeing "extract data matching the CSV's headers"
is to treat all 305 columns as the goal. Three quick pandas checks disproved
that:

```python
df.groupby('Anion')['Anion Smiles'].nunique(dropna=True)   # every anion -> exactly 1 SMILES
df.groupby('Solvent used')['solvent BP'].nunique(dropna=True)  # every solvent -> exactly 1 BP
(df.dropna(subset=['Tg','approxTg'])['Tg'] == df.dropna(subset=['Tg','approxTg'])['approxTg']).all()  # True, 368/368
```

`nunique(dropna=True) == 1` for every group means the column is a **pure
function of another column** — a lookup table, not independently observed
data. `Anion Smiles` and `solvent BP` are exactly this. `approxTg` turned out
to be `Tg` copied through when available, with an imputed fallback otherwise
(you can see the fallback constants directly: every "polyethylene carbonate"
row with no `Tg` has `approxTg == 9.0`).

**Lesson**: when a dataset schema looks large, group-by-and-count-uniques is
a fast, mechanical way to find columns that are secretly derived rather than
independently reported — before spending LLM calls (and evaluation-harness
complexity) trying to "extract" something that's actually a formula.

This landed on a 76-column target schema (`pipeline/schema_columns.py`):
the 75 contiguous columns from `Polymer system Notes` through `Reference`,
plus `Anion Smiles` (which behaves like a third SMILES field, not a
descriptor). Everything else — ~230 RDKit/Mordred cheminformatics
descriptors, plus `solvent BP`/`approxTg`/`approxMW(kDa)`/`Index` — is
deferred to a future deterministic post-processing pass.

### Why `pipeline/schema_columns.py` exists as its own tiny module

`REPORTED_COLUMNS` is imported by at least three different places: the
CSV-slicing script, the pydantic extraction schema the LLM is asked to fill
in (Milestone 4), and the evaluation harness's column-scoring loop
(Milestone 6, not yet built). Defining the list once, in a module with no
other dependencies, means those three consumers are structurally incapable
of drifting out of sync — there's no second copy of the column list to
forget to update. This is the same reasoning behind "single source of
truth" you'll see in most real codebases: not a style preference, but a way
to make an entire class of bug (three lists that used to match) impossible
rather than just unlikely.

### MinerU: CLI-and-server, not a Python import

The `mineru` package installs 7 CLI executables (`mineru`, `mineru-kit`,
etc.), not something you `import`. It runs as a persistent local background
server (`mineru server start/status/stop`) that a CLI invocation talks to as
a thin client — this is why `mineru server status --json` responds almost
instantly even though the underlying model is a multi-hundred-MB PyTorch
model: the model is loaded once when the server starts, not per-command.

Getting local (non-cloud) parsing actually working took two separate steps,
which is worth understanding rather than memorizing:
1. **Install the tool**: `uv tool install --python 3.10 "mineru>=4.0,<5"` —
   installed into its own isolated environment via `uv` (not the project's
   `.venv`), because MinerU is a general-purpose agent tool, not a
   project-specific dependency. `uv tool find 3.10` located a compatible
   interpreter already on the system (via Homebrew) — MinerU requires
   Python `>=3.10,<3.15`, and the project's own `.venv` runs 3.14.6, which
   happens to be in range too, but keeping MinerU's environment separate
   avoids ever having its dependencies (torch, transformers, etc.) collide
   with the pipeline's own.
2. **Configure and start the local parse server**: installing the CLI tool
   is not the same as having a working local model server. That required
   downloading tier-specific model weights (`mineru-kit models download
   --tier standard`, ~2GB), then explicitly opting into local (vs. cloud)
   inference (`mineru config set parse_server.local.mode managed`), then
   restarting the server so it would actually launch the model process.
   `mineru server status --json`'s `parse_server.local.supported_tiers`
   field is the ground truth for what's actually usable right now — it went
   `[]` (nothing configured) -> `[]` with `mode: managed` but not yet
   running -> `["basic","standard","advanced"]` once the model process
   finished booting. Never assume a tier is available from documentation or
   hardware specs alone; this field is what to check.

**Gotcha found**: `mineru ... --json` output can contain raw control
characters in embedded log fields, which breaks Python's default
`json.loads` (`Invalid control character`). Parsing with `json.loads(raw,
strict=False)` works around it — baked into `pipeline/parsing/mineru_cli.py`.

Git repo was `git init`'d this session (there was none before) and the
initial scaffolding was later committed on request.

## Part 2 — Milestone 2: Parsing Spike

Built `pipeline/parsing/mineru_cli.py`, `manifest_schema.py`,
`parse_paper.py`, and `pipeline/paper_id.py`, then ran them against two real
papers to validate the design against actual MinerU behavior rather than
just the skill's documentation.

### Reading a tool's actual output beats reading its docs

One open question going in: "what field marks a block as a figure?" — not
documented anywhere in the MinerU skill text. Rather than guessing, the
first real step was:

```bash
mineru parse "papers/0a011d54-tominaga2012.pdf" --tier standard --pages all --json > /tmp/parse_sample.json
```

...and just reading the JSON. The answer turned out to be simpler than
expected: figures aren't a separate structured field at all — they're
inline markdown image links in the text itself:

```
![Chart block](doc:f5aada3/tier:standard/page:2/block:10)
```

The "URL" in a normal markdown image is, here, a MinerU locator string. One
regex (`_FIGURE_MARKDOWN_RE` in `mineru_cli.py`) finds every figure/chart in
the document in one pass over content you already have — no second API call
needed to discover *where* the figures are, only to fetch each one as a
cropped PNG via `mineru read <locator> --format image`.

**Lesson**: when a tool's docs don't specify something concrete (a field
name, a data shape), the fastest path is usually "run it once on real input
and look," not re-reading the docs more carefully or guessing from
conventions. This is the same instinct as using a debugger/print statement
over staring at code trying to mentally trace it.

### A design survived contact with a second real document — mostly

The first paper (`tominaga2012`, a 4-page "Rapid Communication") parsed in a
single call: `--pages all` returned everything, `next_request` was `None`.
That's a dangerously easy case to over-generalize from. Testing forced
truncation (`--limit 3000`) on the *same* short paper showed a `next_request`
shaped like `{"after": "doc:.../block:8", "page_range": "1-4"}` — continuation
via an `--after` cursor, re-issued with the same `--pages`.

Based on only that evidence, the first version of `MineruCLI.parse()`
assumed `next_request.after` would *always* be present when continuation was
needed, and raised loudly if it wasn't (a deliberate choice — silently
dropping content on an unrecognized shape would be far worse than crashing).
That assumption broke immediately on the second, longer paper
(`itoh2013.pdf`, 9 pages):

```
MineruError: unhandled_continuation: next_request has no 'after' cursor:
{'page_range': '5-9', 'after': None, 'locator': None}
```

This is a *second, distinct* continuation style: MinerU internally batches
`--pages all` into page windows for longer documents, and when a window is
exhausted it hands back a **new page range** to request next, not a cursor
into the current one. The fix checks `after` first and falls back to
`page_range`-based continuation, raising only if *neither* is present.

**Lesson, and why the loud failure was the right call**: a version of this
code that just did `after = next_request.get("after"); if after: continue`
with no `else` branch would have silently returned a truncated document —
pages 1-4 only, with no error, no warning, nothing distinguishing it from a
genuinely 4-page paper. That's a much worse failure mode than a crash,
because it corrupts data quietly instead of stopping loudly. Whenever you
write a loop that "continues until some stop condition," it's worth asking
"what happens if the stop condition looks different than I expect?" — the
answer should almost always be "fail loudly," not "assume it's fine."

### Verified, not assumed

Both papers were spot-checked by hand, not just trusted because the code
ran without errors:
- `tominaga2012`: 5 figures cropped, including a DSC thermogram and a
  chemical-structure diagram — visually inspected, both cropped cleanly with
  no surrounding page clutter.
- `itoh2013`: 18 figures across 9 pages, and — importantly — real data
  **tables** rendered correctly as GitHub-flavored markdown, confirming
  MinerU's `standard` tier table extraction is usable as-is for the LLM
  prompt without needing table images.
- Page markers (`<!-- page N of 9 -->`) appear once each, in order, with no
  gaps or duplicates at the internal batch boundary — confirming the
  continuation fix actually stitches content back together correctly rather
  than just suppressing the error.

## Part 3 — Milestone 3: Swappable LLM Client

Built the `LLMClient` abstraction (`pipeline/extraction/llm_client/`) with
two implementations — `ClaudeClient` (real, Anthropic API) and
`OpenAICompatibleClient` (written against the same interface, for future
self-hosted models on a compute cluster) — plus a config file
(`pipeline/config/settings.yaml`) and factory function that picks between
them.

### What "swappable" actually means in code, not just in a diagram

It's easy to say "make it swappable" and mean "put an if-statement
somewhere." The actual test used here: `base.py` (`ExtractionRequest`,
`ExtractionResponse`, the `LLMClient` Protocol) contains **zero** references
to Anthropic or OpenAI — no `anthropic.Message`, no `ChatCompletion`, just a
paper id, a system prompt string, plain text, and a list of `(path,
media_type, label)` tuples for images. Both `claude_client.py` and
`openai_compatible_client.py` translate that plain data into their own
provider's request shape internally, and translate the response back into
the same plain `ExtractionResponse`. Nothing upstream (the prompt builder,
the batch runner) will ever import `anthropic` or `openai` directly — only
`factory.py` does, and only to decide *which* class to instantiate.

**A concrete way to check whether an abstraction like this is real**: could
you delete one implementation file entirely and have the other one keep
working with zero edits anywhere else? Here, yes.

### Why write the untestable client anyway

`OpenAICompatibleClient` couldn't be exercised against a real server this
session — there's no self-hosted vLLM/TGI/Ollama endpoint running. It got
written anyway, for a specific reason: a single implementation behind an
interface tells you nothing about whether the interface itself is well
shaped. It's easy to accidentally design an interface around the one
provider you're actually using. Writing a *second*, structurally different
implementation against the same `base.py` is what actually forces the
abstraction to be honest — and it did: building `OpenAICompatibleClient`
confirmed `ExtractionRequest`'s plain-data image list (path + media_type +
label) was sufficient to build both Anthropic's `image` content blocks
*and* OpenAI's `image_url` data-URI blocks without changing `base.py` at
all.

### Don't trust training-data memory of fast-moving SDKs

The installed `openai` package is version 3.16.2 — a much newer major
version than what's typically remembered from training. Rather than writing
`response_format={"type": "json_object", ...}` (an older, less precise
pattern) from memory, the actual installed package was introspected
directly (`inspect.getsource()` on the real TypedDict definitions), which
confirmed the exact current shape (`{"type": "json_schema", "json_schema":
{"name", "schema", "strict"}}`) and the image content-part shape
(`{"type": "image_url", "image_url": {"url": "data:..."}}`) straight from
the library actually installed on this machine, rather than guessing and
finding out it was wrong later, potentially silently.

**Lesson**: for any library where you're not 100% certain the exact call
shape is current, a two-second `inspect.getsource()` on the real installed
version is cheap insurance against confidently-wrong code — the same
instinct as running MinerU once and reading its actual JSON, applied to a
Python package instead of a CLI tool.

### The model choice is a config value, not a hardcoded string

`claude_client.py` defaults to `claude-sonnet-5`, but that default only
lives in one place (`pipeline/config/settings.yaml`), with a comment
explaining *why* (cost/quality tradeoff for a 63-paper, vision-heavy batch,
not a blanket "cheaper is better" choice) and how to override it (bump to
`claude-opus-5` for specific hard cases once the evaluation harness
identifies where Sonnet underperforms). Config values that encode a
*reasoned* choice, with the reasoning written down next to the value, age
much better than the same choice buried as a magic string deep in a
function.

## Part 4 — Milestone 4: Extraction Schema + Prompt

Built `pipeline/extraction/schema.py` (the `FormulationRecord` pydantic
model, one field per reported column) and `pipeline/extraction/prompt.py`
(system prompt + request assembly), then dry-ran the full request assembly
against both sample papers.

### Deriving field types from data, not from column names

It would be tempting to guess field types from column names alone —
anything with "Tg", "Tm", "modulus" in the name looks numeric. Actually
checking `data/golden_reported.csv`'s pandas-inferred dtypes caught three
columns (`Tm`, `drying temp`, `drying time (h)`) that *look* numeric but are
stored as strings in the real data, because some rows contain the literal
text `"none"` instead of a number. Forcing those into a `float` field would
mean the LLM either can't express "not applicable" the same way the golden
data does, or a real `"none"` value would fail pydantic validation outright
during evaluation later. `_FLOAT_COLUMNS` in `schema.py` was built by
checking `df[column].dtype` for all 76 columns, not by pattern-matching
names — the same "verify against real data, don't guess" instinct as
Parts 1 and 2.

### Aliases: two names for the same field, on purpose

Pydantic field names can't contain spaces or punctuation, but the golden
CSV's column names are full of both (`"Conductivity at 25C"`, `"Li:monomer"`,
`"% crystallinity"`). Rather than picking one, every field has *two* names:
a Python-safe slug (`conductivity_at_25c`) for code, and the original
column name as its `alias` for everything else — the JSON schema sent to
the LLM, and the JSON written to disk. Confirmed this actually works both
ways: `FormulationRecord.model_json_schema()`'s `properties` keys are the
*original* column names (so the LLM sees `"Tg"`, `"Conductivity at 25C"`,
etc. directly — no translation step needed), and `model_dump(by_alias=True)`
serializes back to those same names for the extraction.json files the
evaluation harness will read later. `populate_by_name=True` in the model
config means both the alias and the slug work as input keys.

### `extra="forbid"` as a tripwire, not just strictness for its own sake

Both `FormulationRecord` and `PaperExtractionResult` set `extra="forbid"` —
an unexpected field in the LLM's JSON response raises a validation error
immediately, surfaced in `output/extracted/{paper_id}/raw_llm_response.json`'s
`validation_errors`, instead of silently being dropped. This matters
specifically because the schema has 76 near-identically-named fields
(eighteen `Conductivity at {T}C` columns alone) — a model hallucinating a
slightly-off field name is a realistic failure mode worth catching loudly
rather than losing silently.

### The prompt reuses the schema instead of duplicating it

`prompt.py`'s field guide is generated by iterating
`pipeline.schema_columns.REPORTED_COLUMNS` and checking
`pipeline.extraction.schema._FLOAT_COLUMNS` — not a hand-written list of 76
lines in the prompt template. If a column's type or the target schema
itself ever changes, the prompt updates automatically instead of silently
drifting out of sync with what the pydantic model actually accepts.

Everything through request assembly was verified (schema builds, JSON
schema uses the right property names, round-trip serialization works, the
system prompt renders sensibly, a real `ExtractionRequest` was built
successfully from a sample paper's actual manifest/text/figures). The one
thing that could not be tested was the actual live Claude API call — no
`ANTHROPIC_API_KEY` was configured on this machine (still true as of this
writing; see "Current Status" at the end of this doc).

## Part 5 — Stress-Testing the Parsing Sub-Pipeline: 3 Real Bugs Found

Before touching the LLM extraction side further, tested Milestone 2's
MinerU parsing sub-pipeline against a much more diverse set of papers than
the original 2 samples — deliberately picking old (1984/1986) papers, a
mixed-tables-and-figures paper, DOI-named files, and the largest PDF in the
corpus. This surfaced three real bugs, all fixed, plus a feature request
from you (figure captions) that turned into a real design gap once
investigated.

### Bug 1: the CLI's own default timeout was too short — but the work wasn't lost

Every paper except the very first new one hit `parse_wait_timeout` at
MinerU's default `--wait 60`. The natural first assumption is "something is
broken/hanging." Checking `mineru list parses --json` instead of guessing
showed the real story: parses were reaching `"status": "done"` well after
the CLI had already given up and returned an error — for `standard` tier,
MinerU runs a `flash` pass *and then* a `standard` pass internally, which
routinely takes longer than 60 seconds for anything beyond a handful of
pages.

This is a distinction worth internalizing: **the CLI timing out is not the
same as the job failing.** The fix was two parts — increase the default
`--wait` to something realistic (180s), and retry-with-a-longer-wait on
timeout rather than treating it as fatal, because re-issuing the identical
request just reconnects to (or catches the cached result of) the
still-running/already-finished server-side job. Re-running all 8
previously-"failed" papers after this fix, every one succeeded in under 10
seconds — because the actual parsing had already completed in the
background during the first, "failed" attempt.

### Bug 2 (found via bug 1): the skill's documented error code was wrong

The mineru skill's own error-code table lists `parse_timeout` as the code
for this situation. The code MinerU 4.0.4 actually returns is
`parse_wait_timeout` — a different string entirely. If the
exception-mapping dict had only trusted the documented code, every one of
these errors would have fallen through to the generic `MineruError` base
class instead of the specific, retryable `ParseWaitTimeout`. Caught only
because the actual error text was read directly rather than assumed to
match the docs. Both the documented code and the real one are now mapped.

### Feature request → design gap: figures had no caption

You noticed that a cleanly-cropped figure, sent to an LLM with no caption,
gives the model a chart with no idea what it's a chart *of*. Investigating
this surfaced that MinerU doesn't expose captions as a structured field at
all — same situation as figure locators in Part 2. The caption text just
sits in the markdown as a plain line starting "Figure N" or "Fig. N"
somewhere near the image.

The first implementation searched only the text between one figure and the
*next* figure block for a caption. Testing it immediately showed why that
was wrong: multi-panel figures get split into several consecutive
image/chart blocks by MinerU (one crop per panel), but the paper has only
one caption for the whole set, appearing after the *last* panel — so every
panel except the last showed up with no caption (12 of 18 figures in one
real paper). Widening the search to "look ahead up to ~1 page of markdown,
not just until the next figure" fixed this (95%+ hit rate across the test
set at the time).

The remaining few misses were manually inspected (viewed the actual cropped
PNGs), rather than assumed to be more of the same bug: two turned out to be
journal branding graphics (a "CrossMark" badge and a journal masthead
banner) — genuinely uncaptioned, correctly showing no caption. One was a
real polymer structure diagram whose caption used **"Scheme 1."** instead
of "Figure 1." — a real convention in chemistry papers for reaction/
structure diagrams — caught by grepping the source markdown for "scheme"
near the image, and fixed by adding it to the caption pattern.

**Lesson**: "search until it works" isn't the same as "search until it's
correct." Widening a match window and getting a higher hit-rate number
doesn't confirm the *matches* are right — actually opening several of the
resulting image+caption pairs (not just counting them) is what caught the
Scheme-vs-Figure gap and confirmed the journal-logo cases were correctly
left uncaptioned rather than a lurking bug.

### Bug 3: the table-counting regex silently matched zero tables

Wrote `count_markdown_tables()` for a new performance-tracking dataset,
using a regex intended to match a GFM table's separator row
(`| --- | --- | --- |`). It returned 0 on a paper already confirmed (by
eye, in Part 2) to contain 2 real tables. The bug: the character class
`[\s:-]` used to match "whatever's between the two outer pipes" doesn't
include `|` itself — but a real separator row has an internal `|` at every
column boundary, not just at the two ends. `repr()`-printing the actual
line made the missing character obvious immediately. One-character fix
(`[\s:|-]`), re-verified against the known-2-table paper before moving on.

This is the third bug this stretch caught by looking at raw, real output
(`mineru list parses --json`, the actual cropped PNGs, `repr()` of a text
line) rather than reasoning from what the code was *supposed* to do. Not a
coincidence — the same debugging habit paying off three times in a row.

### The performance-tracking dataset

Built `data/parsing_performance.csv` (via
`pipeline/batch/run_parsing_batch.py`, one row per paper) with automated
columns (`status`/`error_code`, `page_count`, `parse_duration_seconds`,
`wait_retries`, `num_figures`, `num_figures_with_caption`,
`caption_hit_rate`, `num_tables`, `content_md_chars`, `doi` where derivable
from filename) plus manual columns
(`manual_data_extraction_accuracy_1to5`,
`manual_figure_extraction_accuracy_1to5`,
`manual_table_extraction_accuracy_1to5`, `manual_notes`) left blank on
purpose for you to fill in while spot-checking `output/parsed/{paper_id}/`
against the actual source PDFs. The automated columns tell you *where* to
look; they don't replace manual review.

Ran this across all 63 papers at `standard` tier first: 0 failures, 586
figures (552 captioned, 94.2%), 61 tables across 33 papers, median parse
duration 0.9s (many cache hits from earlier testing) / max 197.2s.

## Part 6 — Switching to MinerU's `advanced` Tier

You asked whether MinerU's `advanced` tier is genuinely better than
`standard`, or just a different setting at the same quality — and whether,
given this corpus is polymer chemistry literature (dense notation, many
papers decades old), `advanced` is the right default. Answered with a real
comparison rather than just reading the docs back.

### "Better tier" needs an operational definition before you can test it

The MinerU skill's own docs say `advanced` gives "the same quality on
ordinary documents, better quality on difficult documents" — a claim, not
proof. `bdf71b01-linden1988.pdf` (a 1988 scan, flagged earlier for the
lowest chars-per-page in the whole corpus, with a manually-confirmed
garbled OCR artifact right after the title) was the natural test case.

Ran the same paper through `parse_paper()` at both tiers, into separate
output directories so both results could sit side-by-side. Results:

| | standard | advanced |
|---|---|---|
| duration | 53.3s | 122.7s |
| figures found | 8 | 2 |
| tables found | 0 | 6 |
| garbled OCR formula after title | present | **gone** |

The headline number that matters isn't the figure-count difference (both
tiers found real figures when spot-checked — the difference is just how
MinerU grouped sub-regions). It's the **tables**: `advanced` extracted 6
real markdown tables — actual numeric data — that `standard` left
completely unextracted, buried inside an image crop instead where an LLM
would have to read pixel positions off a chart rather than getting exact
numbers from a table. A concrete, checkable difference in how much usable
data the pipeline recovers, not just a vibe that one output "looks better."

### A settings.yaml value that nothing reads is worse than no value at all

While wiring the tier decision through, found that
`pipeline/config/settings.yaml` already had a `mineru.tier: standard` field
and `pipeline/config_loader.py` already exposed `Config.mineru_tier` — but
**three separate call sites** (`parse_paper()`, `cli.py`'s `--tier`
argparse default, and `run_parsing_batch.py` implicitly) each hardcoded
their own `"standard"` string independently, never actually reading the
config value. The config looked authoritative but wasn't — changing
`settings.yaml` alone would have silently done nothing.

This is a specific, checkable failure mode worth remembering: a config file
is only a real source of truth if something *reads* it. The fix
(`parse_paper(pdf_path, tier: str | None = None, ...)`, defaulting to
`tier or load_config().mineru_tier`) keeps the ability to override
explicitly while making the *config* the actual default, not a decorative
duplicate of one.

### Decision and full-corpus results

`pipeline/config/settings.yaml`'s `mineru.tier` is now `advanced`. Because
this is local compute with no per-call API cost, the ~2.3x time cost
observed on one paper was judged a reasonable trade for recovering real
tabular data that would otherwise be invisible. Re-ran the full 63-paper
batch at `advanced` tier (a genuine full re-parse, no cache hits — MinerU
caches per (document, tier) pair):

| Metric | `standard` (63 papers) | `advanced` (63 papers) |
|---|---|---|
| Failures | 0 | 0 |
| Total figures found | 586 | 166 |
| Figures with caption | 552 (94.2%) | 144 (86.7%, after a fix — see below) |
| Total tables found | 61 (33 papers had ≥1) | **367 (all 63 papers had ≥1)** |
| `content_md_chars` mean | ~31,476 | ~33,853 |
| Duration | median 0.9s / max 197.2s | median 116.7s / max 403.8s |
| `wait_retries` (any paper) | 1 paper | 11 papers |

Two caveats worth keeping attached to this table:

- **The timing row isn't a fair apples-to-apples comparison.** The
  `standard`-tier "full run" numbers include a lot of cache hits from
  earlier same-tier testing, which is why its median looks implausibly
  fast. The controlled, fair comparison is the single-paper test above
  (53.3s vs 122.7s, ~2.3x) — both fresh, same paper, only the tier changed.
- **The figures/tables shift is three distinct mechanisms, not one, and
  none of them lose data** — this needed a closer look than the first pass
  gave it (you asked the right question here: why did figures drop *and*
  tables rise, rather than one or the other). Verified against `75972f89`
  (itoh2013): `standard` tier reported 18 figures / 2 tables; `advanced`
  reported 7 figures / 5 tables. Tracing where the other 11 "figures" went
  turned up three separate things happening:
  1. **Over-segmentation fixed.** `standard` tier often cropped one panel
     per image block; `advanced` groups a multi-panel figure back into one
     block. Same content, counted once instead of several times.
  2. **Embedded tables reclassified.** Confirmed on the `linden1988` paper
     from earlier: 8 figures/0 tables (`standard`) became 2 figures/**6
     tables** (`advanced`) — an almost exact swap, meaning 6 of those
     "images" were actually small data tables `standard` tier had
     misclassified as pictures.
  3. **Full chart digitization — the one worth remembering.** Three of
     `itoh2013`'s figures (Fig. 1, a Tg-vs-concentration curve; Fig. 4, a
     Nyquist plot; Fig. 5, resistance-vs-time) have **no image block at
     all** under `advanced` tier — confirmed by grepping `content.md` for
     their captions and finding no `![Image block]`/`![Chart block]`
     reference nearby, only a markdown table of the actual data points
     immediately before each caption, with values explicitly marked as
     estimates (`~0.08`, `~-18`, ...). `advanced` tier read the curve and
     wrote out the numbers itself, rather than leaving that for the LLM to
     attempt visually from a cropped chart later. This is exactly the kind
     of figure-understanding work the pipeline's Stage 2 (LLM extraction)
     was going to have to do anyway — getting it done more consistently at
     the parsing stage, for free, is a real win, not a side effect to
     shrug off.

  The pattern (mechanisms 1-3 together) holds at corpus scale: 586→166
  figures, 61→367 tables, 0 papers with data unaccounted for in every case
  actually traced.

### A caption regression, found and fixed, plus a cleanliness bug

The caption hit rate dropped from 94.2% to 77.7% on the very first
`advanced`-tier pass (129/166) — worth investigating rather than shrugging
off, since it moved in the wrong direction. Root cause: `advanced` tier
keeps more body text between a structure diagram and its caption than
`standard` did (e.g. an entire synthesis section before a "Scheme 1."
caption) — measured a real case at **7406 characters**, almost double the
4000-character search window set in Part 5. Widened it to 8000 and
**recomputed captions for all 63 papers directly from the already-saved
markdown, without re-running MinerU at all** (the raw text was already on
disk; only the matching logic changed) — hit rate recovered to 86.7%
(144/166). The remaining misses were spot-checked again: still genuinely
uncaptioned images (a graphical abstract, journal branding).

While tracking down that discrepancy, found a second, unrelated bug:
`parse_paper()` never cleared a paper's `figures/` directory before writing
new crops, so re-parsing the same paper at a new tier left the *previous*
tier's crops sitting on disk alongside the new ones, orphaned and
unreferenced by the current `manifest.json` (one paper had 6 PNG files for
a manifest that only listed 1 figure). Fixed by clearing the directory
before each parse; cleaned up 485 already-accumulated stale files across
the corpus from this session's three rounds of re-parsing.

## Current Status / What's Next

- Milestones 0-4 are built and verified (structurally for 3-4, live for
  0-2). Milestone 2's parsing sub-pipeline has been stress-tested across
  the full 63-paper corpus at `advanced` tier with 0 failures.
- **Blocked on you**: `ANTHROPIC_API_KEY`. Copy `.env.example` to `.env`
  and fill it in (gitignored, so it never gets committed). This unblocks
  the first live Milestone 4 extraction test and Milestone 5 (the full
  63-paper LLM-extraction batch, not yet started — `pipeline/batch/`
  currently only has the parsing-half batch runner).
- `data/parsing_performance.csv` is ready for your manual QA pass with the
  final `advanced`-tier numbers.
- Milestone 6 (evaluation harness against the golden dataset) is designed
  in the plan doc but not yet built.
- Git: initial scaffolding was committed (commit `2f81edf`) on request;
  everything since is uncommitted pending your say-so on how to split it.
