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

How to run the frontend and the extraction server on your computer is below.
[`frontend/README.md`](frontend/README.md) has more about the app itself.

## Running it locally

The frontend and the extraction server both run on your own computer, each in
its own terminal. Every page of the frontend except **Extract** works without
the server. Extract sends a paper's PDF to the extraction server
(`extraction/api.py`) and shows the data it sends back.

Run each command block below from the repo root, the folder this README is in.

### Once: install what they need

1. **Node.js**, the LTS (long-term support) version, from https://nodejs.org.
   The frontend and Claude Code both need it.
2. **Claude Code, logged in.** The extraction server uses it to have Claude read
   the paper. Run `npm install -g @anthropic-ai/claude-code`, then run `claude`
   once and log in. [Making an LLM call](#making-an-llm-call-utilclaudeapimockpy)
   explains why it goes through Claude Code instead of an API key.
3. **MinerU**, the tool that turns a PDF into text and figure images before
   Claude reads it. It runs on your computer and needs about 2 GB of model
   files. Install it with [uv](https://docs.astral.sh/uv/), a tool that
   installs Python programs, each with its own packages:

   ```sh
   uv tool install --python 3.10 "mineru>=4.0,<5"
   uv tool update-shell     # lets terminals find the mineru command
   ```

   **Then open a new terminal,** and run the rest there. uv puts `mineru` in
   `~/.local/bin`, and a terminal only learns that folder's commands when it
   opens. A terminal opened earlier can't find `mineru`, and neither can an
   extraction server started from it. Activating the extraction server's
   virtual environment (step 4) doesn't help, because `mineru` isn't in it. That server works on papers it parsed
   before, but on a new one the page says "The extraction failed" with the
   reason `[Errno 2] No such file or directory: 'mineru'`.

   ```sh
   mineru-kit models download --tier standard           # the model files, about 2 GB
   mineru config set parse_server.local.mode managed    # parse on this computer, not on MinerU's online service
   mineru server restart
   mineru server status --json
   ```

   MinerU is ready when the last command's `supported_tiers`, under
   `parse_server` → `local`, lists `"advanced"`. That's the parsing quality
   the extraction uses. Right after the restart the list can still be empty
   while MinerU loads its models, so run the command again a little later.
4. **The extraction server's Python packages,** in a virtual environment: a
   folder, `extraction/.venv/`, that holds this project's own copy of each
   package.

   ```sh
   cd extraction
   python3 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   ```
5. **The frontend's packages:**

   ```sh
   cd frontend
   npm install
   ```

### Each time: start both

In one terminal, start the extraction server:

```sh
cd extraction
.venv/bin/python api.py      # listens on http://127.0.0.1:8000
```

In a second terminal, start the frontend:

```sh
cd frontend
npm run dev                  # prints http://localhost:5173
```

Then open http://localhost:5173 and choose **Extract** in the menu. Ctrl+C in a
terminal stops what's running there.

**What you'll notice:**
- **Open `http://localhost:5173`, not `http://127.0.0.1:5173`.** Nothing
  answers at the second address, because the frontend's development server
  only listens on `localhost`.
- **If the extraction server isn't running,** Extract says "Couldn't reach the
  extraction server". The other pages don't notice.
- **Results stay after a refresh.** Once an extraction starts, the page's
  address becomes `/extract?job=<id>`. Refreshing it, opening it again later,
  or coming back through the menu shows that extraction, running or finished.
  **New extraction** takes the address back to plain `/extract`. The address
  only works on a computer that can reach the same extraction server.
- **Download CSV** on the results saves them as `<PDF name>-extracted.csv`: a
  `sample` column, then one column per feature, one row per data point, and an
  empty cell where the paper doesn't give a value.
- **Stopping the extraction server loses any extraction still running;**
  finished ones are saved. When it starts again, the page says "The server
  lost this extraction". **Try again** starts it over, unless the page was
  reloaded since you chose the PDF. A reloaded page no longer has the file, so
  wherever starting over is the fix (this, or an extraction that failed),
  **Try again** isn't offered: choose the PDF again under **Change file or
  features**.
- **MinerU's own server keeps running in the background** after you close both
  terminals. `mineru server stop` stops it.
- **How long an extraction takes,** and what the server's answers look like, is
  under [Extraction API](#extraction-api-extractionapipy) below.

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

## Extraction API (`extraction/api.py`)

A small web server that lets the frontend use `extract_features.py`. The page
sends a PDF and the feature names, and gets the data back grouped by sample.

**Start it** with `.venv/bin/python api.py` from `extraction/`, after the
one-time setup in [Running it locally](#running-it-locally).

- It listens on http://127.0.0.1:8000, which only this computer can reach. To
  let other computers on the network reach it, run
  `.venv/bin/uvicorn api:app --host 0.0.0.0 --port 8000` instead.
- http://127.0.0.1:8000/docs lists the endpoints and has a form for trying each
  one.

**An extraction runs as a job, because it takes minutes.** The page starts the
job, then keeps asking whether it has finished.

1. `POST /extract` with a form (the format a browser uses to send a file) that
   has two fields:
   - `pdf`: the paper's PDF.
   - `features`: the feature names, separated by commas, for example
     `Temperature (°C), Conductivity (S/cm)`.

   It answers at once with `202` and the job's id: `{"job": "07561dd6..."}`.
2. `GET /extract/<job id>` answers with one of:
   - `{"status": "running"}`: not finished yet, so ask again in about 5 seconds.
   - `{"status": "failed", "error": "..."}`, with the reason.
   - `{"status": "done", "samples": {...}}`, with the data.

   Each answer also has `file`, the PDF's file name as uploaded; `features`,
   the feature names as the server split them; and `started`, when the job
   started, in seconds since 1970 (Unix time). A page opened later at a job's
   address learns them from here, since it no longer has the PDF.

From the frontend:

```js
const form = new FormData();
form.append("pdf", file);               // the File from an <input type="file">
form.append("features", featuresText);  // the text box, as typed
const res = await fetch("http://127.0.0.1:8000/extract", { method: "POST", body: form });
if (!res.ok) throw new Error((await res.json()).detail);  // not a PDF, or no feature names
const { job } = await res.json();

let result;
do {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  result = await (await fetch(`http://127.0.0.1:8000/extract/${job}`)).json();
} while (result.status === "running");
```

From a terminal:

```sh
curl -F pdf=@papers/bdf71b01-linden1988.pdf -F "features=Temperature (°C), Conductivity (S/cm)" http://127.0.0.1:8000/extract
curl http://127.0.0.1:8000/extract/<job id>
```

That paper's answer, shortened (it gave 6 samples with 7 temperatures each):

```json
{
  "status": "done",
  "file": "bdf71b01-linden1988.pdf",
  "features": ["Temperature (°C)", "Conductivity (S/cm)"],
  "started": 1790000000.0,
  "samples": {
    "Amorphous PEO (undoped)": [
      {"Temperature (°C)": 20, "Conductivity (S/cm)": 1e-07},
      {"Temperature (°C)": 25, "Conductivity (S/cm)": 2.82e-07}
    ],
    "Amorphous PEO:LiClO4 - 64:1": [
      {"Temperature (°C)": 20, "Conductivity (S/cm)": 1.78e-07},
      {"Temperature (°C)": 25, "Conductivity (S/cm)": 5.62e-07}
    ]
  }
}
```

- **Each key under `samples` is a sample's name** as the paper gives it, or its
  composition when the paper doesn't name it. Its list has one entry per data
  point.
- **Every data point has every feature,** in the order they were typed. `null`
  means the paper doesn't give that value for that data point.

**What you'll notice:**
- **A PDF the server has seen before takes from about 30 seconds to 2 minutes,**
  which is the Claude call alone. A new PDF adds about 4 minutes while MinerU
  parses it. The parse is kept, so the same PDF uploaded again, under any file
  name, skips that step.
- **Jobs run one at a time, in the order they came in.** `running` also covers
  waiting for earlier jobs, so a job can stay `running` longer than the times
  above.
- **Every finished job is saved** to `extraction/output/extractions/<job id>.json`,
  holding the same answer `GET /extract/<job id>` gives, so its id keeps
  working after a restart. Failed jobs are saved too, with their reason. The
  files stay on the computer running the server: `output/` isn't in git.
- **A job still running when the server stops is lost.** Its id answers `404`
  after the restart, and so does an id the server never made.
- **Commas separate the feature names,** so a name can't contain a comma.
  Spaces around each name are dropped.
- **The server answers `400`,** with the reason in `detail`, when the file isn't
  a PDF or no feature names are left.
- **Only pages opened from a localhost address can read the answers,** meaning
  `http://localhost:<port>` or `http://127.0.0.1:<port>`. That covers the Vite
  dev server on any computer. A browser hides a server's answers from pages at
  other addresses unless the server allows them (the browser rule called CORS),
  and this server allows only those.

## Finding papers (`extraction/discover.py`, issue #7)

`discover.py` finds papers likely to report the data you want, to feed
`extract_features.py`. Give it keywords, and optionally papers you already have
(DOI or title) and feature names. It searches [OpenAlex](https://openalex.org),
has Claude judge each paper from its title, journal, year and abstract, and
follows the references and citing papers of the ones judged likely. A search
takes 5 minutes and returns the papers best first.

```sh
python discover.py "solid polymer electrolyte ionic conductivity" --feature Tg -o found.json
```

**It needs an OpenAlex key.** OpenAlex charges each request against a daily
budget. Without a key, everyone on your network's IP address shares 1,000
credits a day, less than one search. A free key (make an account, then
https://openalex.org/settings/api) gives 10,000, about 10 searches. Put it in
`extraction/.env` as `OPENALEX_API_KEY=...`.

The extraction API serves it too, for the Discover page:

1. `POST /discover` with JSON `{"keywords": "...", "seeds": ["10.1021/...", "a title"], "features": ["Tg"]}`.
   `seeds` and `features` may be left out. It answers `202` and `{"job": "..."}`,
   or `400` when the keywords are blank.
2. `GET /discover/<job id>` answers `{"status": "running", "progress": {"candidates", "judged", "likely", "seconds", "credits"}}`
   (`progress` is `null` at first), then `{"status": "done", "papers": [...]}` or
   `{"status": "failed", "error": "..."}`. Each paper has `title`, `authors`,
   `year`, `journal`, `doi`, `pdf` (an open-access PDF, or `null`), `score`
   (2 probably reports the data, 3 clearly), `reason`, `description` (from the
   abstract, or `null`) and `openalex`.

**What you'll notice:**
- **Most papers have no description.** OpenAlex has no abstracts for most
  Elsevier papers, which is most of this field, and Semantic Scholar and
  Crossref had none it lacked. Those papers are judged from their title alone.
- **Few have an open-access PDF,** so you usually get the PDF yourself before
  extracting.
- **The list is long,** often thousands of papers. Measured on the 63 papers
  behind the golden dataset, a keywords-only search listed 75% of them, but only
  11 in its top 100 (`extraction/experiments/discovery/`).
- **Searches run one at a time,** apart from extractions.
