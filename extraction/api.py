"""HTTP API for extract_features.py, so the frontend can get data out of a paper.

    .venv/bin/python api.py        # http://127.0.0.1:8000, try it at http://127.0.0.1:8000/docs

POST /extract with a form holding `pdf` (the paper) and `features` (feature
names separated by commas) starts a job and answers {"job": "<id>"} at once.
GET /extract/<id> then answers {"status": "running"} until the job ends with
{"status": "done", "samples": {...}} or {"status": "failed", "error": "..."}.

A PDF parsed before takes about 1.5 minutes, a new one about 5, since MinerU
parses it first. Jobs run one at a time, in the order they came in, so
"running" includes waiting for earlier jobs. They are kept in memory only:
after a restart, old ids answer 404.
"""

from __future__ import annotations

import os
import tempfile
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

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

jobs: dict[str, dict] = {}
worker = ThreadPoolExecutor(max_workers=1)  # one at a time, so two jobs never parse the same new PDF at once


def run(job: str, pdf: bytes, features: list[str]) -> None:
    try:
        with tempfile.TemporaryDirectory() as tmp:
            # No "<id>-" prefix in the name, so the parse step names the paper by
            # its contents and a PDF uploaded again reuses its earlier parse.
            path = Path(tmp) / "paper.pdf"
            path.write_bytes(pdf)
            jobs[job] = {"status": "done", "samples": extract_features(path, features)}
    except Exception as e:
        traceback.print_exc()
        jobs[job] = {"status": "failed", "error": str(e)}


@app.post("/extract", status_code=202)
def start(pdf: UploadFile = File(...), features: str = Form(...)) -> dict:
    names = [name.strip() for name in features.split(",") if name.strip()]
    data = pdf.file.read()
    if not data.startswith(b"%PDF-"):
        raise HTTPException(400, "The uploaded file isn't a PDF.")
    if not names:
        raise HTTPException(400, "Give at least one feature name.")
    job = uuid.uuid4().hex
    jobs[job] = {"status": "running"}
    worker.submit(run, job, data, names)
    return {"job": job}


@app.get("/extract/{job}")
def status(job: str) -> dict:
    if job not in jobs:
        raise HTTPException(404, "No such job. The server forgets its jobs when it restarts.")
    return jobs[job]


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
