# polymerData

Monorepo for the polymer electrolyte data project: paper extraction, data
pipelines, and the frontend explorer.

- [`extraction/`](extraction/) — parses uploaded papers (text, tables, figures) with MinerU,
  sends the parsed content to an LLM to extract structured data, and scores
  results against the golden dataset (`extraction/data/_Cleaned_Final_Data_6_2_2020.csv`).
- [`frontend/`](frontend/) — the client-side app that visualizes the polymer-electrolyte
  conductivity dataset (a rebuild of pedatamine.org).
- [`util/`](util/) — helpers shared across the project. `claudeAPIMock.py` is how
  project code makes an LLM call; see below.

Each subdirectory keeps its own README with setup and usage instructions.

## Making an LLM call (`util/claudeAPIMock.py`)

`ask_llm()` sends a prompt to Claude and returns the reply. For now it doesn't
use a paid API. It runs Claude Code's non-interactive mode (`claude -p`) on your
machine with your Claude Code login, so calls count against your Claude Code
plan's usage limits and nothing is billed to an API key.

**Setup:**
1. Install Claude Code: `npm install -g @anthropic-ai/claude-code`.
2. Run `claude` once and log in.

`ask_llm()` needs only the `claude` command on your PATH and the Python standard
library.

```python
import json
from util.claudeAPIMock import ask_llm

# Text in, text out
reply = ask_llm("Summarise this abstract in two sentences: ...")

# A system prompt (instructions for the whole reply) and a chosen model
reply = ask_llm(question, system="You are a polymer chemist.", model="claude-opus-5-5")

# JSON out: json_schema describes the shape the reply must have,
# and the reply is that JSON as a string
schema = {"type": "object",
          "properties": {"polymer": {"type": "string"}, "salt": {"type": "string"}},
          "required": ["polymer", "salt"], "additionalProperties": False}
data = json.loads(ask_llm("Which polymer and salt does this paper study? ...", json_schema=schema))

# Images, each optionally with a label shown just before it, such as its caption
reply = ask_llm("How many curves does this plot show?",
                images=[("fig4.png", "Fig. 4. Arrhenius plots for amorphous PEO ...")])

# PDFs, which Claude reads page by page
reply = ask_llm("List the samples this paper reports.", documents=["paper.pdf"])
```

**Importing it:** code run from the repo root imports it as shown. Code run from
inside `extraction/` needs the repo root on its path: `PYTHONPATH=.. python your_script.py`.

**What you'll notice:**
- **Even a one-word reply takes 3–5 seconds,** because every call starts the
  `claude` program.
- **`ANTHROPIC_API_KEY` is removed on purpose** from what `claude` sees. With it
  set, `claude` would bill that key instead of your plan. `extraction/` loads the
  key from `.env`, so it is usually set.
- **Each call is isolated, the way an API call is:**
  - it has no tools, so it can't read files or run commands;
  - it doesn't load CLAUDE.md files;
  - it runs outside the repo.

  It still gets a few lines of Claude Code's own context: the date, your
  platform and your account's email.
- **Leaving out `model`** uses your Claude Code default model.
- **A failed call raises `RuntimeError`** with Claude Code's own message, for
  example `claude` not installed, usage limit reached, or unknown model.

**Switching to a real API later** (the Claude API, OpenAI, or a local model
server) means rewriting the body of `ask_llm()`. Code that calls it doesn't
change.

`extraction/extract_features.py` is built on it. Give it a paper's PDF and a
text file with one feature name per line, and it writes a table with one row
per data point. The first column names the sample (one material the paper
tests) and the other columns hold the features. A sample gets several rows when
the paper gives a feature at several conditions, such as its conductivity at
several temperatures. Run `python extract_features.py paper.pdf features.txt -o out.csv`
from `extraction/`.
