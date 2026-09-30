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

## Extraction API (`extraction/api.py`)

A small web server that lets the frontend use `extract_features.py`. The page
sends a PDF and the feature names, and gets the data back grouped by sample.

**Start it** from `extraction/`, after `pip install -r requirements.txt`:

```sh
python api.py
```

- It listens on http://127.0.0.1:8000, which only this computer can reach. To
  let other computers on the network reach it, run
  `uvicorn api:app --host 0.0.0.0 --port 8000` instead.
- It needs what `extract_features.py` needs: Claude Code logged in (see above),
  and the `mineru` command. MinerU is the tool that turns a PDF into text and
  figure images.
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
- **The server keeps jobs in memory only.** After a restart, old job ids get
  `404`.
- **Commas separate the feature names,** so a name can't contain a comma.
  Spaces around each name are dropped.
- **The server answers `400`,** with the reason in `detail`, when the file isn't
  a PDF or no feature names are left.
- **Only pages opened from a localhost address can read the answers,** meaning
  `http://localhost:<port>` or `http://127.0.0.1:<port>`. That covers the Vite
  dev server on any computer. A browser hides a server's answers from pages at
  other addresses unless the server allows them (the browser rule called CORS),
  and this server allows only those.
