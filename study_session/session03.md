# Session 3 Handoff — Pipeline Kickoff (Milestones 0-1)

## Summary

This session pivoted the project from hands-on CS fundamentals (sessions 1-2)
to the actual data-extraction pipeline. Per your direction, I (Claude) wrote
the code directly this time rather than walking you through typing it — but
this doc exists so you can study *why* things are built the way they are, as
if a future apprentice inherited this codebase cold.

We: explored the project state, discovered the golden CSV's real structure
(305 columns, only 76 of which are actually paper-extractable), designed the
pipeline architecture and evaluation methodology via two parallel planning
passes, then executed Milestone 0 (git + MinerU install) and Milestone 1
(the reduced target schema).

## Teaching Points

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

`REPORTED_COLUMNS` will be imported by at least three different places over
the coming milestones: the CSV-slicing script (this session), the pydantic
extraction schema the LLM is asked to fill in (Milestone 4), and the
evaluation harness's column-scoring loop (Milestone 6). Defining the list
once, in a module with no other dependencies, means those three consumers
are structurally incapable of drifting out of sync — there's no second copy
of the column list to forget to update. This is the same reasoning behind
"single source of truth" you'll see in most real codebases: not a style
preference, but a way to make an entire class of bug (three lists that used
to match) impossible rather than just unlikely.

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
strict=False)` works around it. This will be baked into
`pipeline/parsing/mineru_cli.py` in the next milestone rather than
re-discovered later.

## What's Next

- Milestone 2 (parsing spike): run `mineru parse` on one real paper from
  `papers/`, inspect the actual JSON to find the field that marks a block as
  a figure/image (not documented in the skill text), then write
  `pipeline/parsing/mineru_cli.py` + `parse_paper.py` for real.
- Milestone 3: the swappable LLM client abstraction (`base.py` Protocol +
  `claude_client.py` + `openai_compatible_client.py`).
- Milestone 4: the pydantic `FormulationRecord` schema + prompt design,
  tested against the Milestone 2 sample paper.
- Continuing this session's working style: I write the pipeline code, and
  each milestone gets a `study_session/session0N.md` write-up like this one.
- Git repo is now initialized (`git init` done this session) — the plan is
  to commit this scaffolding (`.gitignore`, `requirements.txt`,
  `pipeline/schema_columns.py`, `pipeline/scripts/make_golden_reported.py`,
  `data/golden_reported.csv`, this doc) as the first real commit.
