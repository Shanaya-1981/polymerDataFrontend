"""HTTP API for extract_features.py, so the frontend can get data out of a paper.

    .venv/bin/python api.py        # http://127.0.0.1:8000, try it at http://127.0.0.1:8000/docs

POST /extract with a form holding `pdf` (the paper) and `features` (feature
names separated by commas) starts a job and answers {"job": "<id>"} at once.
GET /extract/<id> then answers {"status": "running"} until the job ends with
{"status": "done", "samples": {...}} or {"status": "failed", "error": "..."}.
Every answer also gives the PDF's file name (`file`), the feature names
(`features`), and when the job started (`started`, Unix time in seconds).

A PDF parsed before takes about 1.5 minutes, a new one about 5, since MinerU
parses it first. Jobs run one at a time, in the order they came in, so
"running" includes waiting for earlier jobs. A finished job is also saved to
output/extractions/<id>.json, so its id keeps answering after a restart. A job
still running when the server stops is lost: its id answers 404.

POST /discover with JSON {"keywords": "...", "seeds": [DOI or title, ...],
"features": [...]} (seeds and features optional) starts a search for papers
likely to report that data (discover.py) and answers {"job": "<id>"}.
GET /discover/<id> answers {"status": "running", "progress": {...}} until
{"status": "done", "papers": [...]} (best first) or {"status": "failed",
"error": "..."}. A search takes 5 minutes. Searches run one at a time, apart
from extractions, since each spends OpenAlex's daily budget.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from discover import discover
from extract_features import HERE, extract_features

os.chdir(HERE)  # the parse step's paths (settings.yaml, output/parsed/) are relative to extraction/

app = FastAPI(title="Polymer data extraction")
# Lets pages served from this computer (the Vite dev server, on any port) read the answers.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)

RESULTS = HERE / "output" / "extractions"  # <job id>.json for each finished job

jobs: dict[str, dict] = {}
worker = ThreadPoolExecutor(max_workers=1)  # one at a time, so two jobs never parse the same new PDF at once


def run(job: str, pdf: bytes, features: list[str]) -> None:
    try:
        with tempfile.TemporaryDirectory() as tmp:
            # No "<id>-" prefix in the name, so the parse step names the paper by
            # its contents and a PDF uploaded again reuses its earlier parse.
            path = Path(tmp) / "paper.pdf"
            path.write_bytes(pdf)
            jobs[job] = {**jobs[job], "status": "done", "samples": extract_features(path, features)}
    except Exception as e:
        traceback.print_exc()
        jobs[job] = {**jobs[job], "status": "failed", "error": str(e)}
    RESULTS.mkdir(parents=True, exist_ok=True)
    saving = RESULTS / f"{job}.json.tmp"  # renamed once complete, so a crash never leaves half a file
    saving.write_text(json.dumps(jobs[job], ensure_ascii=False, indent=1), encoding="utf-8")
    saving.replace(RESULTS / f"{job}.json")


@app.post("/extract", status_code=202)
def start(pdf: UploadFile = File(...), features: str = Form(...)) -> dict:
    names = [name.strip() for name in features.split(",") if name.strip()]
    data = pdf.file.read()
    if not data.startswith(b"%PDF-"):
        raise HTTPException(400, "The uploaded file isn't a PDF.")
    if not names:
        raise HTTPException(400, "Give at least one feature name.")
    job = uuid.uuid4().hex
    jobs[job] = {"status": "running", "file": pdf.filename or "paper.pdf", "features": names, "started": time.time()}
    worker.submit(run, job, data, names)
    return {"job": job}


@app.get("/extract/{job}")
def status(job: str) -> dict:
    if job in jobs:
        return jobs[job]
    saved = RESULTS / f"{job}.json"
    if re.fullmatch(r"[0-9a-f]{32}", job) and saved.exists():  # only ids this server makes, never a path
        return json.loads(saved.read_text(encoding="utf-8"))
    raise HTTPException(404, "No such job. A job still running when the server stopped is lost.")


searches: dict[str, dict] = {}
searcher = ThreadPoolExecutor(max_workers=1)


class DiscoverRequest(BaseModel):
    keywords: str
    seeds: list[str] = []
    features: list[str] = []


def run_search(job: str, request: DiscoverRequest) -> None:
    def progress(counts: dict) -> None:
        searches[job] = {"status": "running", "progress": counts}

    try:
        papers = discover(request.keywords, request.seeds, request.features, progress=progress)
        searches[job] = {"status": "done", "papers": papers}
    except Exception as e:
        traceback.print_exc()
        searches[job] = {"status": "failed", "error": str(e)}


@app.post("/discover", status_code=202)
def start_search(request: DiscoverRequest) -> dict:
    request.keywords = request.keywords.strip()
    request.seeds = [s.strip() for s in request.seeds if s.strip()]
    request.features = [f.strip() for f in request.features if f.strip()]
    if not request.keywords:
        raise HTTPException(400, "Give some keywords.")
    job = uuid.uuid4().hex
    searches[job] = {"status": "running", "progress": None}
    searcher.submit(run_search, job, request)
    return {"job": job}


@app.get("/discover/{job}")
def search_status(job: str) -> dict:
    if job not in searches:
        raise HTTPException(404, "No such search. The server forgets its searches when it restarts.")
    return searches[job]


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
