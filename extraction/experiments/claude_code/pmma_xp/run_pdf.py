"""Extract the same features from balke1973.pdf with the PDF sent straight to Claude (no MinerU).

    ../../../.venv/bin/python run_pdf.py

The server's run (MinerU text + figures) used Claude Code's default model, which was
claude-opus-5-5; this one names it so the two runs differ only in what Claude reads.
Writes balke1973-pdf.json in the shape the server saves jobs in.
"""

import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parents[2])]  # extraction/, for extract_features

from extract_features import extract_features  # noqa: E402

PDF = HERE.parents[3] / "papers" / "balke1973.pdf"
FEATURES = ["Time (min)", "Cov Exp"]  # as typed on the Extract page for the server's run

started = time.time()
samples = extract_features(PDF, FEATURES, model="claude-opus-5-5", send_pdf=True)
record = {"status": "done", "file": PDF.name, "features": FEATURES, "started": started, "samples": samples}
(HERE / "balke1973-pdf.json").write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"{sum(map(len, samples.values()))} points in {len(samples)} samples, {time.time() - started:.0f} s")
