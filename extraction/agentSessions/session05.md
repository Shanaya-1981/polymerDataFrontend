# Agent Session 05 — Handoff Report

**Date**: 2026-09-28 to 2026-09-29
**Scope**: GitHub issue #4, "a hacky way to mock Claude API calls". The
session built `ask_llm()`, one function that answers LLM requests through
Claude Code's non-interactive mode (`claude -p`) on the Claude Code login
instead of a paid API key. It then used that to test Claude on the extraction
task:
- the pipeline's prompt, text only and with figures;
- a new two-input tool: a PDF and a list of feature names in, a table out;
- Sonnet 5 against Opus 5.5;
- the PDF sent directly against MinerU's parse;
- the multi-call ("multistage") method.

It also fixed a bug in the multistage quote check that had silently dropped
real formulations, in the earlier local runs too. All work is on branch
`issue-4-claude-code-mock`, pushed and **not merged**.

Prior handoff: `session04.md`.

## What Was Built

- **`util/claudeAPIMock.py`** (repo root, standard library only). It has
  one function:

  ```python
  ask_llm(prompt, system=None, model=None, json_schema=None, images=(), documents=(), timeout=1800) -> str
  ```

  - **What it runs:** one `claude -p` call per request. The whole request
    goes in on standard input as one stream-json message (Claude Code's
    JSON-lines input format, the one Anthropic's Agent SDK uses), so it can
    carry images and PDFs.
  - **What it returns:** the reply text. With `json_schema` (a JSON Schema
    describing the reply's shape), it returns that JSON as a string.
  - **Isolation:** tools are off (`--tools ""`), and it runs from the system
    temp folder with CLAUDE.md files disabled
    (`CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`). `ANTHROPIC_API_KEY` and
    `ANTHROPIC_AUTH_TOKEN` are removed from the environment it passes on.
    One fixed line is appended to every system prompt: "use only the data in
    the user's message… no files, folders, tools".
  - **Failures:** raise `RuntimeError` carrying Claude Code's own message.
  - **Swapping to a real API** (Claude, OpenAI, a local server) means
    rewriting this function's body; its callers don't change.
  - `util/__init__.py` is empty. Import it with
    `from util.claudeAPIMock import ask_llm`; code run from inside
    `extraction/` needs `PYTHONPATH=..`.
- **`extraction/extract_features.py`**, the two-input tool the user asked for.

  ```
  python extract_features.py paper.pdf features.txt -o out.csv
  ```

  - **Input:** a PDF, and a text file with one feature name per line.
  - **Output:** a CSV with one row per sample and one column per feature.
  - **Prompt:** a 530-character system prompt, the feature list and the
    paper. There is no field guide or rules; a unit written in a feature
    name sets the unit of its numbers.
  - **Parsing:** MinerU parses the PDF first, and an already-parsed PDF is
    reused. A PDF not named `<id>-<name>.pdf` gets an id from its contents.
  - **`--send-pdf`** sends the PDF itself and skips MinerU.
  - It isn't wired into `pipeline/`.
- **`extraction/experiments/claude_code/`**, the experiment folder. All runs
  use the pinned 10-paper sample and the pipeline's scorer. The folder holds:
  - `run.py`: one extraction call per paper. Options: `--figures`,
    `--simple` (the `extract_features.py` prompt), `--pdf` (with
    `--simple`), `--model`, `--only`, `--redo` and `--jobs`. Each setting
    writes its own folder.
  - `run_multistage.py` and `claude_code_client.py`: the multistage method,
    with Claude behind the pipeline's `LLMClient` interface.
  - `SUMMARY.md`: every result table, hand-written.
  - Result folders: `sonnet-5/`, `sonnet-5-figures/`, `sonnet-5-simple/`,
    `opus-5-5/`, `opus-5-5-simple/`, `opus-5-5-simple-pdf/` and
    `multistage-opus-5-5/`, plus a `run-*.log` for each.
  - `experiments/README.md` has a section on all of it.
- **One pipeline change:** `pipeline/extraction/multistage.py`'s quote check
  (see Bugs below).
- **Commits**, oldest first: `2e00cba` (mock), `8d7ccb0` (data-only line),
  `f812a78` (Sonnet text-only run), `f8e17ab` (images), `0907fc6` (figures
  run), `7f7d9f6` (PDFs), `4aaee4b` (`extract_features.py`), `f04490c`
  (quote-check fix), `4f3765a` (simple / PDF / Opus / multistage runs).

## Results

These are on the pinned 10 papers, which have 127 golden formulations (a
formulation is one polymer + salt + concentration combination). The columns:
- **Found:** golden formulations paired with a predicted one.
- **Headline recall:** correct values out of all golden values in the
  fields a paper normally prints.
- **Conductivity:** accuracy within about ±26% / within about 3× of the
  golden value, in paired formulations.

Every Claude run went through `ask_llm()` on the Claude Code login.

| Run | Found | Headline recall | Conductivity | Median s/paper |
|---|---|---|---|---|
| **Opus 5.5, one call, simple prompt, MinerU text + figures** | **125** | **51%** | 46% / 51% | 92 |
| Sonnet 5, one call, pipeline prompt, MinerU text + figures | 121 | 49% | 33% / 36% | 482 |
| Opus 5.5, one call, simple prompt, PDF sent directly | 117 | 43% | 30% / 40% | 90 |
| Sonnet 5, one call, pipeline prompt, text only | 95 | 43% | 36% / 37% | 393 |
| Opus 5.5, one call, pipeline prompt, text only | 101 | 42% | 27% / 27% | 68 |
| Sonnet 5, one call, simple prompt, MinerU text + figures | 90 | 33% | 40% / 49% | 313 |
| Opus 5.5, multistage (per group and per formulation), text only | 90 | 32% | 22% / 25% | 135 / 266 |
| *Best local run:* Qwen3.5-4B, multistage per formulation | 46 | 8% | 1% / 6% | 1249 |

What the numbers say:
- **Claude is far ahead of the local 4B models**, and Opus 5.5 is both better
  and faster than Sonnet 5 through Claude Code. With the simple prompt, the
  whole sample took 6 minutes on Opus against 18 on Sonnet.
- **Figures help mainly by finding formulations.** Sonnet with the pipeline
  prompt went from 95 found text only to 121 with figures. `f3d2d4b6` went
  from 0/27 to 23/27, because the images let the model tell apart two
  plotted curves.
- **Conductivity blanks mostly come from the pipeline prompt's rules.** Its
  "don't read values off ambiguous plots" rule makes the model leave
  crowded-plot values empty. Almost no conductivity values are wrong: 11 of
  903 in the figures run.
- **The simple prompt loses on format conventions, not facts.** The golden
  column names don't say that `Li:functional group` is a fraction (0.05, not
  `1:20`), that `Polymer family` means `ether`, or that `crystalline?` is
  `yes` / `no` / `na`. Where a concentration came back as a ratio or as
  text, the scorer (which pairs on concentration) couldn't pair it: two
  Sonnet papers matched 0 formulations that way. Opus coped better with the
  same prompt.
- **MinerU beats sending the PDF directly, mostly on conductivity:** 421
  correct values against 267. MinerU gives the model its plot readings (the
  `~` tables) and a large crop of each figure. The PDF run was better on
  names, for example `Polymer` at 82% against 61%.
- **With Claude, multistage is worse than one call, because of its listing
  step's quote check** (see Bugs). On the 6 papers where the listing kept
  everything, multistage matched or beat the single call.
- **No invented values were found** in spot checks of what Claude filled
  where the golden set is blank. Every traced value is printed in the paper
  or calculated from printed numbers (e.g. wt% from a stated O/Li ratio,
  labelled "calculated" in the notes).

## Discussion and Decisions (with the user, in session order)

1. **The first plan was rejected as "convoluted".** It had 3 backends, a root
   `pyproject.toml` and wiring into `extraction/`. The user's words: "whenever
   we need a API call, we just ask claude code to do it". It was replaced by
   one function.
2. **"Frontend only talks to backend services."** So there's no web server
   for the browser; Python backend code imports `ask_llm()`.
3. **Build it on a new branch, don't integrate it yet, use auto mode.**
   Nothing in `pipeline/` calls the mock. The experiment scripts import it
   themselves.
4. **"Don't scan the whole directory; only use the data we provided."**
   Checked first: it already had no tools, so it could not read files. The
   data-only system-prompt line was added to stop the leftover "session" and
   "working folder" framing. The user prompt was left unchanged, so a real
   API later gets identical input.
5. **A test run on extraction, then the other 9 papers, then saving the
   results under `experiments/`.** Done, then committed.
6. **"Why can't we send images?"** They're supported by Claude Code; they had
   been cut from `ask_llm()` when it was simplified. Added `images=`, re-ran
   with figures, committed and pushed, not merged.
7. **"Keep the prompt simple. User only provides two inputs (paper in PDF,
   list of features)."** This became `extract_features.py`, tested with the
   golden column names as features.
8. **"Now try opus 5.5."** Done with the simple prompt, then the PDF sent
   directly against MinerU's parse.
9. **The user asked whether Claude replaced every step that used local
   models.** Only the extraction call did. MinerU's parse, which uses its own
   local models, was reused as saved, including its plot-read `~` tables.
   That's why the direct-PDF run (Claude doing everything) is the useful
   contrast.
10. **Run multistage with Claude.** Done after the quote-check fix. Commit
    and push: done.

## Bugs Encountered & How They Were Resolved

### Environment and the Claude Code CLI

- **`claude` on PATH was a broken install at the start.**
  `/opt/homebrew/bin/claude` pointed at a 500-byte placeholder with no execute
  bit, because npm's postinstall never ran. Within the session it was found
  reinstalled at 17:11 (Claude Code 2.1.284, not done by this session), and
  everything later ran on it. `ask_llm()` reports a missing or broken
  `claude` with install instructions.
- **The first live call answered as a Claude Code session "in
  `polymerData`".** Asking the model to list its context showed why:
  - it saw the working folder, git status, `~/.claude/CLAUDE.md`, the
    account email and the date;
  - `--system-prompt` only replaces Claude Code's instructions, not that
    context.

  Fixes, each verified by the same probe:
  - run from the temp folder, which removes the folder and git details;
  - `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`, which removes CLAUDE.md;
  - the data-only line, which stops "paste the file here / run `head`"
    replies.

  The date, platform and email are still injected.
- **API-key billing.** `ANTHROPIC_API_KEY` outranks the subscription login in
  `claude -p`, and `extraction/`'s `load_dotenv()` puts it in the
  environment. `ask_llm()` removes it, verified by a call with
  `ANTHROPIC_API_KEY=sk-bogus` succeeding. The startup event reported
  `apiKeySource: none`.
- **`--output-format stream-json` needs `--verbose` in `-p` mode.** Without
  it, `claude` exits with "When using --print, --output-format=stream-json
  requires --verbose".
- **`--tools` takes several values**, so it must come last and nothing
  positional may follow it. That's another reason the prompt goes on stdin.

### In the pipeline: the multistage quote check (fixed, `f04490c`)

The listing call keeps a formulation only if the quote it gives is found in
the paper (`quote_in_paper`). The check was built to stop Qwen from inventing
counting sequences.
- **HTML tables never matched.** `_norm()` stripped punctuation but not HTML
  tags, so `LiTFSI</td><td>20` became `litfsitdtd20` and every quote from a
  table MinerU writes as HTML failed.
  - **Fix:** remove tags first. The pattern needs `<` followed by a letter,
    so "T < 60 °C" survives.
  - **Effect on Claude:** its listing for `1dba839e` kept 2 of 14 before the
    fix.
  - **Effect on the earlier local run:** it dropped 31 of the 38
    formulations Qwen listed for `170fead2`, all of which pass now.
    `experiments/multistage/SUMMARY.md` predates the fix, and the experiments
    README says so.
- **Rows under a merged first cell** (`<td rowspan="4">LiTFSI</td>`) print the
  label once, but Claude quotes each row with it. **Fix:** accept the quote if
  the label and the rest of the row are both in the paper; the row's own
  cells must still match.
- **Still open (not fixed):** quotes that normalize to fewer than 8
  characters (`| ~0.31 | 8 | — | — | ~0.65 |`, `5:1`) and quotes Claude
  composes ("Table 4. … EO/Li 192/1; c (mol/kg) 0.114") are still rejected.
  That is why multistage lost 30 of 38 formulations in `170fead2`, 16 of 30 in
  `f3d2d4b6` and 10 of 30 in `5feba0f9`.

### In the experiment tooling

- **The scratch test script couldn't import `pipeline`.** A script run by
  path gets its own folder on `sys.path`, not the working folder. The
  experiment scripts now put both the repo root and `extraction/` on
  `sys.path` themselves.
- **"Did it stuck?"** The runner printed only when a paper finished, so long
  papers looked frozen. It now logs a "started" line too.
- **"It's done, there are 10 folders."** Folders were created when a paper
  started, but they are now created only when it finishes.
- **Stopping a background run.** `pgrep -f` matched the zsh wrapper, and
  killing it orphaned the Python runner and its `claude` calls. They were
  stopped by process ID and by child processes of that ID. Don't `pkill` by
  `claude -p` flags: the VS Code extension's own Claude process uses the
  same flags.
- **`arm.json` provenance.** It records the commit of the code that ran, plus
  "plus uncommitted changes" when that code wasn't committed. The simple and
  Opus runs say `f8e17ab plus uncommitted changes`. The code was committed
  afterwards with later additions (`documents=`, `--send-pdf`), which don't
  change what those runs sent: the parsed-input prompt was checked
  byte-identical.

### In this session's own reports (caught by checking, corrected)

- I said all 30 `5feba0f9` records gave the "overlapping plot" reason; 1 did.
- I said the rise in extra values came mostly from more paired formulations;
  it was entirely `f3d2d4b6`'s 47.
- I said `claude` was broken after it had been reinstalled. Always re-check
  before repeating an earlier finding.

## Things Learned

- **Re-validate safety filters when you change models.** The quote check
  protected against a 4B model's inventions and cost Claude a third of its
  formulations. A filter should report what it drops: `listing.json`'s
  `quote_check` counts are what exposed both the bug and the strictness.
- **A silent filter can hide a real bug for a long time.** The HTML-tag bug
  had been in every multistage run. Spot-check a sample of what a filter
  rejects, not only what it keeps.
- **For a capable model, conventions matter more than "don't guess" rules.**
  The simple prompt's losses were formats and vocabularies, and they can be
  fixed by saying what each feature means. The pipeline prompt's
  plot-reading rule, meanwhile, blanked out correct values.
- **MinerU's parse has value beyond extracting text.** Its plot readings and
  per-figure crops beat Claude reading the PDF's pages itself, on
  conductivity.
- **`claude -p` as an API stand-in** needs isolation (tools, cwd, CLAUDE.md,
  API key) and a data-only instruction. Budget 3–5 s of start-up per call.
- **Verify a claim against the data before writing it into a summary.** Two
  wrong sentences were caught this way.
- **Show that a long job is alive**, with start lines and outputs that appear
  only when finished. Otherwise it gets reported as stuck or done.

## Where to Pick Up Next Session

1. **Decide the multistage quote check for Claude.** Either drop it, or relax
   the 8-character minimum and accept composed quotes, then re-run
   `run_multistage.py --model claude-opus-5-5 --redo`, which takes about 40
   minutes. Or drop multistage for Claude, since one call is already better.
2. **Let features carry their conventions** in `extract_features.py`: an
   optional `name: description` per line (e.g.
   `Li:functional group: moles of Li per coordinating group, as a decimal
   (EO:Li 20:1 → 0.05)`). Re-run the sample with descriptions taken from
   `prompt.py`'s `_FIELD_NOTES`. The prompt stays short; it should recover
   concentration pairing and the vocabulary fields.
3. **Conductivity is still the weak spot, and session 04's plan still
   stands:**
   - extract (temperature, value) readings;
   - score them against the golden VFT fit, i.e. the curve the curators fitted
     to each paper's data points.

   Most remaining misses are blanks where golden values are curve-fit
   interpolations.
4. **Try MinerU text plus the PDF together.** MinerU won on conductivity and
   the PDF won on names.
5. **Integrate, when the user says so.** Move `claude_code_client.py` into
   `pipeline/extraction/llm_client/`, add a `claude_code` provider to
   `factory.py` and `settings.yaml`, or give `extract_features` a pipeline
   CLI command. Make `util` importable (`PYTHONPATH=..`, or a package
   install).
6. **Real API swap:** rewrite `ask_llm()`'s body. Consider also returning
   token usage; it returns text only now, so the runs have no token counts.
7. **Repeat runs to measure variance.** Every result above is a single run.
8. **Re-run the local multistage** if its numbers still matter, since they
   predate the quote-check fix. That needs llama-server and the GGUF files.
9. **Open a PR** from `issue-4-claude-code-mock` when ready.
10. **Set up an environment in the monorepo.** It has no `extraction/.venv`;
    this session used `/Users/merlin/projects/polymerDataExtractionTest/.venv`
    (Python 3.14.6, anthropic 1.7.0, openai 3.16.2).

## How to Run What Exists

```bash
cd extraction
PY=/Users/merlin/projects/polymerDataExtractionTest/.venv/bin/python   # or a new .venv

# One LLM call from Python (repo root on the path)
PYTHONPATH=.. $PY -c "from util.claudeAPIMock import ask_llm; print(ask_llm('Say ok'))"

# The two-input tool
$PY extract_features.py paper.pdf features.txt -o out.csv [--send-pdf] [--model claude-opus-5-5]

# Experiments (pinned 10 papers, scored at the end)
$PY -B experiments/claude_code/run.py [--figures | --simple [--pdf]] [--model claude-opus-5-5] [--only ID --redo]
$PY -B experiments/claude_code/run_multistage.py --model claude-opus-5-5

# Scorer on any run folder, and its instrument checks
$PY -m pipeline.evaluation.evaluate experiments/claude_code/opus-5-5-simple
$PY -m pipeline.evaluation.evaluate --self-test
```

Use `-B` (don't write `.pyc`): there is no root `.gitignore`, so
`util/__pycache__/` would show up in git. All runs count against the Claude
Code plan's usage limits.

## Reference Notes (don't rediscover these)

- **The stream-json user message:**
  `{"type":"user","session_id":"","parent_tool_use_id":null,"message":{"role":"user","content":[...]}}`.
  - Content blocks use the Messages API shape: `text`, `image` (base64 PNG,
    JPEG, GIF or WebP) and `document` (base64 `application/pdf`, placed
    before the text).
  - The answer is in the last `{"type":"result"}` line: `result`,
    `structured_output` (with `--json-schema`), `is_error`, `subtype`.
  - The first `system/init` line shows `tools`, `mcp_servers`, `model` and
    `apiKeySource`.
- **Flags `ask_llm()` uses:** `-p --input-format stream-json --output-format
  stream-json --verbose --no-session-persistence --system-prompt … [--model]
  [--json-schema <inline JSON>] --tools ""`.
- **Environment:**
  - `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` beat the subscription
    login.
  - `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` stops CLAUDE.md from loading.
  - `--bare` would skip context, but per the CLI docs it forbids
    subscription login, so it's unusable here.
  - `CLAUDECODE=1` in a parent session did not block nested `claude -p`
    calls (2.1.284).
- **Measured limits:**
  - The largest request, `5feba0f9` with 32 images, is about 3.4 MB and
    went through.
  - PDFs of 130–1,775 KB went through as documents.
  - A one-word reply takes 3–5 s.
  - With no `model`, `claude` uses the account's default, which was
    `claude-opus-5-5`.
- **The sample's inputs** are `experiments/tier_comparison/<paper>/hybrid/`
  (MinerU parse) and `<paper>/<paper>.pdf`. For 9 papers the prompt built
  from them is byte-identical to the one built from the old repo's
  `output/parsed/`. `170fead2` differs by 23 characters in one `~` table.
- **`extract_features.py` output folders:** a parse goes to
  `extraction/output/parsed/<id>/`, which is gitignored. The end-to-end test
  on a raw PDF MinerU had seen before took 73 s, parse and Claude call
  included.
- **Golden conventions a bare column name hides:**
  - `Li:functional group`: a fraction.
  - `Polymer family`: backbone group (`ether`).
  - `crystalline?`: `yes` / `no` / `na`.
  - `Tm`: `none` if no melting is reported.
  - `SMILES descriptor 1`: repeat-unit fragment (`COC` for PEO).
  - `Comonomer percentage`: `100` for a homopolymer.
  - `prompt.py`'s `_FIELD_NOTES` has the full list.
