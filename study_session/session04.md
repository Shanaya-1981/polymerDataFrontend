# Session 3 (cont'd) — Milestone 2: Parsing Spike

## Summary

Built `pipeline/parsing/mineru_cli.py`, `manifest_schema.py`, `parse_paper.py`,
and `pipeline/paper_id.py`, then ran them against two real papers from
`papers/` to validate the design against actual MinerU behavior rather than
just the skill's documentation. Found and fixed a real gap in the first
implementation along the way — worth walking through, because the fix
process is the more useful lesson than the final code.

## Teaching Points

### Reading a tool's actual output beats reading its docs

The plan flagged one open question explicitly: "what field marks a block as
a figure?" — not documented anywhere in the MinerU skill text. Rather than
guessing, the first real step was:

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
into the current one. The fix (`pipeline/parsing/mineru_cli.py`) checks
`after` first and falls back to `page_range`-based continuation, raising
only if *neither* is present.

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
  **tables** rendered correctly as GitHub-flavored markdown (`| Run | ... |`
  with a `mp:` cast to superscript for `M<sub>n</sub>`), confirming
  MinerU's `standard` tier table extraction is usable as-is for the LLM
  prompt without needing table images.
- Page markers (`<!-- page N of 9 -->`) appear once each, in order, 1
  through 9, with no gaps or duplicates at the internal batch boundary —
  confirming the continuation fix actually stitches content back together
  correctly rather than just suppressing the error.

## What's Next

- Milestone 3: the swappable `LLMClient` interface (`base.py` Protocol),
  a real `claude_client.py`, and an `openai_compatible_client.py` written
  against the same interface to prove it's genuinely provider-agnostic.
- Milestone 4: the pydantic `FormulationRecord` schema (using
  `pipeline/schema_columns.py`'s `REPORTED_COLUMNS` from Milestone 1) and
  prompt design, tested against these same two sample papers.
