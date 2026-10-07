"""Benchmark the extraction pipeline on one paper against the UCSB dataset.

    .venv/bin/python benchmarks/benchmark.py papers/bdf71b01-linden1988.pdf

Run from extraction/, with the extraction server running (.venv/bin/python
api.py) and benchmarks/requirements.txt installed. For the paper you name it:

1. submits the PDF the way the Extract page does -- POST /extract with
   features "Temperature (°C), Conductivity (S/cm)" -- and checks on the job
   every 5 s, printing each step it sees;
2. reads the job's exact step timings from logs/extraction.log, including
   whether MinerU's parse was reused;
3. finds the paper's samples in the UCSB dataset (_Cleaned_Final_Data_6_2_2020.csv,
   through data/paper_mapping.csv), matches the extracted samples to them by
   polymer, salt and concentration -- read from the sample names, the only
   place they appear -- and scores the points both have;
4. plots both on the paper's usual axes next to the paper's own conductivity
   figure from MinerU's parse;
5. writes report.md, metrics.json, comparison.png and extraction.json to
   benchmarks/<paper>_<timestamp>/ (gitignored).

It only measures: nothing in the pipeline changes. Useful options:
--job <id> scores a job that already ran instead of submitting again (once
it's done, from output/extractions/, so the server needn't be running);
--pair "<extracted name>=<UCSB sample number>" fixes a match the name
heuristics get wrong; --figure <image> picks the paper's figure by hand.

Scoring, per matched sample, only at temperatures both have: an extracted
and a UCSB point pair up when their temperatures are within 2 °C (nearest
first, one to one), and match when their log10 conductivities are within
0.3. Precision is matches over the extracted points that have a UCSB
temperature within 2 °C; recall is matches over the UCSB points that have an
extracted temperature within 2 °C.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
import shutil
import sys
import textwrap
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent  # extraction/benchmarks/
EXTRACTION = HERE.parent  # extraction/
sys.path.insert(0, str(EXTRACTION))

from pipeline.evaluation.normalize import _ANION_ALIASES, as_number, canonical_anion  # noqa: E402
from pipeline.paper_id import paper_id_from_path  # noqa: E402

GOLDEN_CSV = EXTRACTION / "data" / "_Cleaned_Final_Data_6_2_2020.csv"
MAPPING_CSV = EXTRACTION / "data" / "paper_mapping.csv"
LOG_FILE = EXTRACTION / "logs" / "extraction.log"
RESULTS = EXTRACTION / "output" / "extractions"
PARSED = EXTRACTION / "output" / "parsed"
OUT_ROOT = HERE

DEFAULT_API = "http://127.0.0.1:8000"
DEFAULT_FEATURES = "Temperature (°C), Conductivity (S/cm)"
T_TOLERANCE_C = 2.0
LOG_SIGMA_TOLERANCE = 0.3
# Two concentrations are the same sample when within 15% of each other: the
# paper's "64:1" is the UCSB set's Li:functional group 0.0158 (1:63.2).
RATIO_TOLERANCE = 0.15
KELVIN = 273.15


# ---------------------------------------------------------------------------
# Samples
# ---------------------------------------------------------------------------


@dataclass
class GoldenSample:
    number: int  # 1-based, in the CSV's order for this paper
    polymer: str
    anion: str | None
    li_ratio: float | None  # "Li:functional group"
    salt_wt: float | None
    points: list[tuple[float, float]]  # (°C, S/cm), by temperature

    def label(self) -> str:
        parts = [f"UCSB #{self.number}"]
        if self.li_ratio:
            parts.append(f"Li:FG {self.li_ratio:.4g} (1:{1 / self.li_ratio:.3g})")
        elif self.salt_wt is not None:
            parts.append(f"{self.salt_wt:g} wt% salt")
        return " ".join(parts)


@dataclass
class ExtractedSample:
    name: str
    points: list[tuple[float, float]]  # (°C, S/cm), by temperature
    unusable: int = 0  # points without a temperature or a positive conductivity
    anion: str | None = None
    li_ratio: float | None = None
    salt_wt: float | None = None
    undoped: bool = False


_RATIO = re.compile(r"(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)")
_PER_LI = re.compile(r"\b(?:e?o)\s*/\s*li\+?\s*[=:]?\s*(\d+(?:\.\d+)?)", re.IGNORECASE)  # "EO/Li = 16"
_LI_PER = re.compile(r"\bli\+?\s*/\s*e?o\s*[=:]?\s*(\d*\.?\d+)", re.IGNORECASE)  # "Li/O = 0.0625"
_WT = re.compile(r"(\d+(?:\.\d+)?)\s*wt\.?\s*%", re.IGNORECASE)
_UNDOPED = re.compile(r"\b(undoped|salt[- ]free|no salt|without salt|neat|pure (?:polymer|peo))\b", re.IGNORECASE)


def li_ratio_from_name(name: str) -> float | None:
    """Lithium per functional group, as a sample name gives it: "64:1",
    "O:Li = 8:1", "EO/Li = 16", "Li/O = 0.0625". A ratio is read as the
    minority over the majority, so 64:1 and 1:64 both mean 1/64."""
    if m := _LI_PER.search(name):
        return float(m.group(1)) or None
    if m := _PER_LI.search(name):
        value = float(m.group(1))
        return 1 / value if value else None
    if m := _RATIO.search(name):
        a, b = float(m.group(1)), float(m.group(2))
        if a and b:
            return min(a, b) / max(a, b)
    return None


def anion_from_name(name: str) -> str | None:
    """The UCSB set's spelling of the salt's anion named in `name`, if any."""
    found = canonical_anion(name)
    return found if found in _ANION_ALIASES else None


def number(value: Any) -> float | None:
    """A float from a number or numeric text ("25", "1.2e-5", "25 °C")."""
    found = as_number(value)
    if found is None and isinstance(value, str):
        m = re.match(r"\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)", value)
        found = float(m.group(1)) if m else None
    return found if found is not None and math.isfinite(found) else None


def feature_keys(features: list[str]) -> tuple[str, str]:
    """Which requested feature is the temperature and which the conductivity."""
    temperature = next((f for f in features if "temp" in f.lower()), None)
    conductivity = next((f for f in features if "conductiv" in f.lower()), None)
    if not temperature or not conductivity:
        raise ValueError(f"features need a temperature and a conductivity: {features}")
    return temperature, conductivity


def extracted_samples(samples: dict[str, list[dict]], features: list[str]) -> list[ExtractedSample]:
    t_key, s_key = feature_keys(features)
    result = []
    for name, raw_points in samples.items():
        points, unusable = [], 0
        for point in raw_points:
            t, sigma = number(point.get(t_key)), number(point.get(s_key))
            if t is None or sigma is None or sigma <= 0:
                unusable += 1
            else:
                points.append((t, sigma))
        wt = _WT.search(name)
        result.append(
            ExtractedSample(
                name=name,
                points=sorted(points),
                unusable=unusable,
                anion=anion_from_name(name),
                li_ratio=li_ratio_from_name(name),
                salt_wt=float(wt.group(1)) if wt else None,
                undoped=bool(_UNDOPED.search(name)),
            )
        )
    return result


def golden_samples(doi: str, csv_path: Path = GOLDEN_CSV) -> list[GoldenSample]:
    """The UCSB set's rows for one paper, each with its conductivity points."""
    with open(csv_path, newline="", encoding="utf-8", errors="replace") as f:
        rows = [row for row in csv.DictReader(f) if row["DOI"].strip() == doi]
    samples = []
    for i, row in enumerate(rows, 1):
        points = []
        for column, value in row.items():
            if m := re.fullmatch(r"Conductivity at (-?\d+)C", column or ""):
                sigma = number(value)
                if sigma is not None and sigma > 0:
                    points.append((float(m.group(1)), sigma))
        samples.append(
            GoldenSample(
                number=i,
                polymer=row.get("Polymer", "").strip(),
                anion=anion_from_name(row.get("Anion", "")) or (row.get("Anion") or "").strip() or None,
                li_ratio=number(row.get("Li:functional group")),
                salt_wt=number(row.get("salt wt%")),
                points=sorted(points),
            )
        )
    return samples


@dataclass
class SampleMatch:
    extracted: ExtractedSample
    golden: GoldenSample
    reason: str


def _concentration_gap(e: ExtractedSample, g: GoldenSample) -> tuple[float, str] | None:
    """How far apart the two concentrations are (0 = same), with the reason;
    None when they can't be the same sample."""
    if e.li_ratio and g.li_ratio:
        gap = abs(math.log(e.li_ratio / g.li_ratio))
        if gap <= math.log(1 + RATIO_TOLERANCE):
            return gap, f"Li:FG {e.li_ratio:.4g} vs {g.li_ratio:.4g} ({abs(e.li_ratio / g.li_ratio - 1):.1%} apart)"
        return None
    if e.salt_wt is not None and g.salt_wt:
        gap = abs(math.log(e.salt_wt / g.salt_wt)) if e.salt_wt else math.inf
        if gap <= math.log(1 + RATIO_TOLERANCE):
            return gap, f"{e.salt_wt:g} vs {g.salt_wt:g} wt% salt"
        return None
    return None


def match_samples(
    extracted: list[ExtractedSample],
    golden: list[GoldenSample],
    pairs: dict[str, int] | None = None,
) -> tuple[list[SampleMatch], list[ExtractedSample], list[GoldenSample]]:
    """Match extracted samples to UCSB ones, one to one: same salt, and a
    concentration within RATIO_TOLERANCE, closest first. `pairs` (extracted
    name -> UCSB sample number) decides any it names. The polymer only
    decides when the paper's UCSB rows have more than one, since the name a
    paper uses ("amorphous PEO") rarely matches the set's ("poly(ethyleneoxide-
    co-methyleneoxide)"). An undoped sample has no UCSB row: the set holds
    electrolytes only."""
    matches: list[SampleMatch] = []
    by_number = {g.number: g for g in golden}
    left_e, left_g = list(extracted), list(golden)

    for name, n in (pairs or {}).items():
        e = next((s for s in left_e if s.name == name), None)
        g = by_number.get(n)
        if e is None or g is None or g not in left_g:
            raise ValueError(f"--pair {name!r}={n}: no such unmatched extracted sample or UCSB sample")
        matches.append(SampleMatch(e, g, "paired by hand (--pair)"))
        left_e.remove(e)
        left_g.remove(g)

    several_polymers = len({g.polymer.lower() for g in golden}) > 1
    candidates = []
    for e in left_e:
        if e.undoped:
            continue
        for g in left_g:
            if e.anion and g.anion and e.anion != g.anion:
                continue
            if several_polymers and not _polymer_mentioned(g.polymer, e.name):
                continue
            if gap := _concentration_gap(e, g):
                salt = f"{e.anion} salt, " if e.anion else ""
                candidates.append((gap[0], e.name, g.number, e, g, salt + gap[1]))
    for _, _, _, e, g, reason in sorted(candidates, key=lambda c: c[:3]):
        if e in left_e and g in left_g:
            matches.append(SampleMatch(e, g, reason))
            left_e.remove(e)
            left_g.remove(g)

    # A name without a concentration can still be the one sample of its salt.
    for e in [s for s in left_e if not s.undoped and s.li_ratio is None and s.salt_wt is None]:
        fits = [g for g in left_g if not (e.anion and g.anion and e.anion != g.anion)]
        if len(fits) == 1:
            matches.append(SampleMatch(e, fits[0], "the only UCSB sample left with this salt"))
            left_e.remove(e)
            left_g.remove(fits[0])

    matches.sort(key=lambda m: m.golden.number)
    return matches, left_e, left_g


def _polymer_mentioned(polymer: str, name: str) -> bool:
    words = [w for w in re.split(r"[^a-z0-9]+", polymer.lower()) if len(w) >= 3]
    squashed = re.sub(r"[^a-z0-9]", "", name.lower())
    return any(w in squashed for w in words)


# ---------------------------------------------------------------------------
# Points
# ---------------------------------------------------------------------------


def compare_points(
    extracted: list[tuple[float, float]], golden: list[tuple[float, float]]
) -> dict[str, Any]:
    """Pair points within T_TOLERANCE_C, nearest first and one to one, and
    count the pairs whose log10 conductivities are within LOG_SIGMA_TOLERANCE."""
    near = lambda t, others: any(abs(t - o) <= T_TOLERANCE_C for o, _ in others)  # noqa: E731
    comparable_e = [p for p in extracted if near(p[0], golden)]
    comparable_g = [p for p in golden if near(p[0], extracted)]

    options = sorted(
        (abs(te - tg), i, j)
        for i, (te, _) in enumerate(extracted)
        for j, (tg, _) in enumerate(golden)
        if abs(te - tg) <= T_TOLERANCE_C
    )
    used_e, used_g, pairs = set(), set(), []
    for _, i, j in options:
        if i in used_e or j in used_g:
            continue
        used_e.add(i)
        used_g.add(j)
        (te, se), (tg, sg) = extracted[i], golden[j]
        error = math.log10(se) - math.log10(sg)
        pairs.append(
            {
                "t_extracted": te,
                "t_golden": tg,
                "log_sigma_extracted": round(math.log10(se), 4),
                "log_sigma_golden": round(math.log10(sg), 4),
                "error": round(error, 4),
                "match": abs(error) <= LOG_SIGMA_TOLERANCE,
            }
        )
    pairs.sort(key=lambda p: p["t_golden"])
    matches = sum(p["match"] for p in pairs)
    return {
        **rates(matches, len(comparable_e), len(comparable_g)),
        "pairs": pairs,
        **errors([p["error"] for p in pairs]),
    }


def rates(matches: int, extracted: int, golden: int) -> dict[str, Any]:
    precision = matches / extracted if extracted else None
    recall = matches / golden if golden else None
    f1 = (
        2 * precision * recall / (precision + recall)
        if precision is not None and recall is not None and precision + recall
        else (0.0 if precision is not None and recall is not None else None)
    )
    return {
        "matches": matches,
        "extracted_points_compared": extracted,
        "golden_points_compared": golden,
        "precision": precision,
        "recall": recall,
        "f1": f1,
    }


def errors(values: list[float]) -> dict[str, Any]:
    if not values:
        return {"mean_abs_log_sigma_error": None, "mean_log_sigma_bias": None}
    return {
        "mean_abs_log_sigma_error": sum(abs(v) for v in values) / len(values),
        "mean_log_sigma_bias": sum(values) / len(values),
    }


def score(matches: list[SampleMatch]) -> dict[str, Any]:
    per_sample = []
    for m in matches:
        result = compare_points(m.extracted.points, m.golden.points)
        per_sample.append({"extracted": m.extracted.name, "golden": m.golden.label(), "reason": m.reason, **result})
    total = rates(
        sum(s["matches"] for s in per_sample),
        sum(s["extracted_points_compared"] for s in per_sample),
        sum(s["golden_points_compared"] for s in per_sample),
    )
    all_errors = [p["error"] for s in per_sample for p in s["pairs"]]
    return {"overall": {**total, **errors(all_errors)}, "per_sample": per_sample}


# ---------------------------------------------------------------------------
# The run: submitting, polling, and what the server logged
# ---------------------------------------------------------------------------


def submit(api: str, pdf: Path, features: str) -> str:
    import requests

    with open(pdf, "rb") as f:
        response = requests.post(
            f"{api}/extract",
            files={"pdf": (pdf.name, f, "application/pdf")},
            data={"features": features},
            timeout=120,
        )
    if response.status_code != 202:
        raise SystemExit(f"POST /extract answered {response.status_code}: {response.text[:300]}")
    return response.json()["job"]


def poll(api: str, job: str, every: float, timeout: float) -> tuple[dict, list[dict]]:
    """Ask about `job` every `every` seconds until it ends. Returns the final
    answer and what each check saw: seconds since the first, status, step."""
    import requests

    seen, began = [], time.monotonic()
    while True:
        answer = requests.get(f"{api}/extract/{job}", timeout=60).json()
        elapsed = time.monotonic() - began
        progress = answer.get("progress") or {}
        seen.append(
            {
                "t": round(elapsed, 1),
                "status": answer.get("status"),
                "step": progress.get("step"),
                "name": progress.get("name"),
                "percent": progress.get("percent"),
            }
        )
        label = progress.get("name") or answer.get("status")
        percent = f" ({progress['percent']}%)" if "percent" in progress else ""
        print(f"[{elapsed:6.0f} s] {answer.get('status')}: {label}{percent}", flush=True)
        if answer.get("status") != "running":
            return answer, seen
        if elapsed > timeout:
            raise SystemExit(f"job {job} still running after {timeout:.0f} s; score it later with --job {job}")
        time.sleep(every)


def observed_steps(seen: list[dict]) -> list[dict]:
    """When polling first saw each step, and for how long until the next."""
    steps = []
    for check in seen:
        key = check["step"] or check["status"]
        if not steps or steps[-1]["step"] != key:
            steps.append({"step": key, "name": check["name"] or key, "first_seen_s": check["t"]})
    for this, after in zip(steps, steps[1:]):
        this["seen_for_s"] = round(after["first_seen_s"] - this["first_seen_s"], 1)
    return steps


_LOG_PATTERNS = {
    "queue_s": re.compile(r"Started after ([\d.]+) s in the queue"),
    "parse_reused": re.compile(r"Reusing the saved parse in (\S+)"),
    "parse_started": re.compile(r"Parsing with MinerU into (\S+)"),
    "parse_done": re.compile(r"MinerU parse done in ([\d.]+) s: (\d+) figure\(s\), (\d+) table\(s\)"),
    "llm_call": re.compile(r"LLM call: model (.+), prompt (\d+) chars, (\d+) image\(s\), (\d+) PDF\(s\)"),
    "llm_reply": re.compile(r"LLM reply after ([\d.]+) s: (\d+) chars"),
    "llm_failed": re.compile(r"LLM call failed after ([\d.]+) s: (.*)"),
    "step_done": re.compile(r"Step (\w+) done in ([\d.]+) s"),
    "done": re.compile(r"\bDone in ([\d.]+) s"),
    "failed": re.compile(r"\bFailed after ([\d.]+) s: (.*)"),
}


def job_timings(log_text: str, job: str) -> dict[str, Any]:
    """What logs/extraction.log says about one job: queue wait, MinerU (or
    a reused parse), the model call, each step's time, and the total."""
    timings: dict[str, Any] = {"steps": {}}
    for line in log_text.splitlines():
        if f"job={job} " not in line:
            continue
        for key, pattern in _LOG_PATTERNS.items():
            if not (m := pattern.search(line)):
                continue
            if key == "queue_s":
                timings["queue_s"] = float(m.group(1))
            elif key == "parse_reused":
                timings.update(parse_cached=True, parse_dir=m.group(1))
            elif key == "parse_started":
                timings.update(parse_cached=False, parse_dir=m.group(1))
            elif key == "parse_done":
                timings.update(mineru_s=float(m.group(1)), figures=int(m.group(2)), tables=int(m.group(3)))
            elif key == "llm_call":
                timings.update(
                    model_logged=m.group(1),
                    prompt_chars=int(m.group(2)),
                    images=int(m.group(3)),
                    pdfs=int(m.group(4)),
                )
            elif key == "llm_reply":
                timings.update(llm_s=float(m.group(1)), reply_chars=int(m.group(2)))
            elif key == "llm_failed":
                timings.update(llm_s=float(m.group(1)), llm_error=m.group(2))
            elif key == "step_done":
                timings["steps"][m.group(1)] = float(m.group(2))
            elif key == "done":
                timings["total_s"] = float(m.group(1))
            elif key == "failed":
                timings.update(total_s=float(m.group(1)), error=m.group(2))
    return timings


def read_logs(log_file: Path = LOG_FILE) -> str:
    """The log and its rotated files, oldest first."""
    files = sorted(log_file.parent.glob(log_file.name + ".*"), reverse=True) + [log_file]
    return "\n".join(f.read_text(encoding="utf-8", errors="replace") for f in files if f.exists())


def model_used(logged: str | None) -> str:
    """The model the extraction used, as far as anything recorded it. The API
    names none, so Claude Code's default answered, and Claude Code doesn't
    say which that was. ~/.claude/settings.json can set it, and is shown when
    it does; so can ANTHROPIC_MODEL in the server's environment, which this
    script can't see (its own may differ), so it isn't consulted."""
    if logged and "default" not in logged:
        return logged
    settings = Path.home() / ".claude" / "settings.json"
    try:
        configured = json.loads(settings.read_text(encoding="utf-8")).get("model")
    except (OSError, ValueError):
        configured = None
    if configured:
        return f"{configured} (Claude Code's default, set in ~/.claude/settings.json)"
    return (
        "Claude Code's default for your login (not recorded: the API names no model, "
        "and Claude Code doesn't say which it used)"
    )


# ---------------------------------------------------------------------------
# The paper's own figure, from MinerU's parse
# ---------------------------------------------------------------------------

# How much a figure's caption says "conductivity against temperature". The
# negatives matter as much: "Log10 conductivity versus dopant level ... at
# various temperatures" is a conductivity plot, but not against temperature.
_FIGURE_WORDS = [
    (re.compile(r"arrhenius|1000\s*/\s*T|10\^?3\s*/\s*T|10³\s*/\s*T|1\s*/\s*T\b|reciprocal|inverse temperature", re.I), 5),
    (re.compile(r"conductivit", re.I), 3),
    (re.compile(r"(?:versus|vs\.?|against|function of)\s+temperature|temperature dependence", re.I), 2),
    (re.compile(r"(?:versus|vs\.?|against|function of)\s+(?!temperature)\w", re.I), -4),
    (re.compile(r"impedance|dielectric|nyquist|spectr|DSC|thermogram|micrograph", re.I), -3),
]


def figure_candidates(parse_dir: Path) -> list[dict]:
    """MinerU's figures for the paper, best conductivity-plot candidates first."""
    manifest_path = parse_dir / "manifest.json"
    if not manifest_path.exists():
        return []
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    found = []
    for figure in manifest.get("figures", []):
        caption = figure.get("caption") or ""
        found.append(
            {
                "image": str(parse_dir / figure["image_path"]),
                "page": figure.get("page"),
                "caption": caption,
                "score": sum(weight for pattern, weight in _FIGURE_WORDS if pattern.search(caption)),
            }
        )
    return sorted(found, key=lambda f: -f["score"])


_THOUSAND_OVER_T = re.compile(r"1000\s*/\s*T|10\^?3\s*/\s*T|10³\s*/\s*T", re.I)
_PER_KELVIN = re.compile(r"1\s*/\s*K|1\s*/\s*T\b|K\^?-1|K⁻¹|reciprocal|inverse", re.I)
_CELSIUS = re.compile(r"°C|\(C\)|celsius", re.I)


def axis_for(caption: str, axis_label: str = "") -> str:
    """The paper's x axis. The label MinerU read off the figure decides when
    there is one ("Reciprocal Temperature (1/K)" is 1/T, not 1000/T); else the
    caption's wording; else 1000/T, the usual Arrhenius axis."""
    if _THOUSAND_OVER_T.search(axis_label):
        return "1000/T"
    if _PER_KELVIN.search(axis_label):
        return "1/T"
    if _CELSIUS.search(axis_label):
        return "T"
    if _THOUSAND_OVER_T.search(caption) or re.search(r"arrhenius|reciprocal|inverse|1\s*/\s*T\b", caption, re.I):
        return "1000/T"
    if re.search(r"(?:versus|vs\.?|against)\s+temperature|°C", caption, re.I):
        return "T"
    return "1000/T"


def axis_label_near(content_md: str, caption: str) -> str:
    """The x axis label MinerU's advanced tier read off a figure: the first
    header cell of the table it writes just above the figure's caption. Empty
    when the figure has no such table."""
    head = caption[:40]
    at = content_md.find(head) if head else -1
    if at < 0:
        return ""
    header, in_table = "", False
    # Walk up from the caption: blank lines, then the table's rows, the
    # "| --- |" line, and its header row, which is the table's topmost line.
    for line in reversed(content_md[:at].splitlines()[-60:]):
        stripped = line.strip()
        if stripped.startswith("|"):
            in_table, header = True, stripped
        elif in_table:
            break
        elif stripped:
            return ""  # text between the caption and any table: not this figure's
    return header.strip("|").split("|")[0].strip() if header else ""


def parse_dir_for(pdf: Path, logged: str | None) -> Path:
    """Where MinerU's parse of this upload is: the log says, or the PDF's
    content hash names it (the API saves uploads as paper.pdf, so the id
    comes from the content, not the file name)."""
    if logged:
        return EXTRACTION / logged
    return PARSED / hashlib.sha256(pdf.read_bytes()).hexdigest()[:8]


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


def plot_comparison(
    path: Path,
    figure: dict | None,
    matches: list[SampleMatch],
    extra: list[ExtractedSample],
    missed: list[GoldenSample],
    x_axis: str,
    title: str,
) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    def x_of(t: float) -> float:
        if x_axis == "1000/T":
            return 1000 / (t + KELVIN)
        if x_axis == "1/T":
            return 1 / (t + KELVIN)
        return t

    fig, (left, right) = plt.subplots(1, 2, figsize=(16, 7), gridspec_kw={"width_ratios": [1, 1.15]})
    left.axis("off")
    if figure:
        left.imshow(plt.imread(figure["image"]))
        caption = textwrap.fill(figure["caption"] or "(no caption found)", 90)
        left.set_title("The paper's figure (from MinerU's parse)", fontsize=11)
        left.text(0, -0.04, caption, transform=left.transAxes, fontsize=7.5, va="top", wrap=True)
    else:
        left.text(0.5, 0.5, "No conductivity figure found in MinerU's parse", ha="center", va="center")

    colors = plt.get_cmap("tab10")
    for i, m in enumerate(matches):
        color = colors(i % 10)
        gx = [x_of(t) for t, _ in m.golden.points]
        gy = [math.log10(s) for _, s in m.golden.points]
        right.plot(gx, gy, "--s", color=color, mfc="none", ms=6, lw=1, label=m.golden.label())
        ex = [x_of(t) for t, _ in m.extracted.points]
        ey = [math.log10(s) for _, s in m.extracted.points]
        right.plot(ex, ey, "-o", color=color, ms=4.5, lw=1.2, label=f"Pipeline: {m.extracted.name}")
    for e in extra:
        right.plot(
            [x_of(t) for t, _ in e.points],
            [math.log10(s) for _, s in e.points],
            ":^",
            color="0.45",
            ms=4.5,
            label=f"Pipeline, no UCSB sample: {e.name}",
        )
    for g in missed:
        right.plot(
            [x_of(t) for t, _ in g.points],
            [math.log10(s) for _, s in g.points],
            "--s",
            color="0.6",
            mfc="none",
            label=f"{g.label()}, not extracted",
        )
    if x_axis in ("1000/T", "1/T"):
        scale = 1000 if x_axis == "1000/T" else 1
        right.set_xlabel("1000/T (K$^{-1}$)" if scale == 1000 else "1/T (K$^{-1}$)")
        top = right.secondary_xaxis(
            "top", functions=(lambda x: scale / x - KELVIN, lambda t: scale / (t + KELVIN))
        )
        top.set_xlabel("T (°C)")
    else:
        right.set_xlabel("T (°C)")
    right.set_ylabel("log$_{10}$ σ (S cm$^{-1}$)")
    right.grid(alpha=0.25)
    right.legend(fontsize=7, loc="best")
    right.set_title("Pipeline (filled, solid) vs UCSB dataset (hollow, dashed)", fontsize=11)
    fig.suptitle(title, fontsize=13)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def _pct(value: float | None) -> str:
    return "—" if value is None else f"{value:.0%}"


def _dex(value: float | None, signed: bool = False) -> str:
    if value is None:
        return "—"
    return f"{value:+.2f}" if signed else f"{value:.2f}"


def _seconds(value: float | None) -> str:
    if value is None:
        return "—"
    return f"{value:.0f} s" if value < 120 else f"{value / 60:.1f} min ({value:.0f} s)"


def verdict(metrics: dict) -> str:
    samples, overall = metrics["samples"], metrics["points"]["overall"]
    lines = []
    found, expected, matched = samples["found"], samples["expected"], samples["matched"]
    lines.append(
        f"The pipeline reported {found} sample(s); the UCSB dataset has {expected} for this paper, and "
        f"{matched} of them were matched."
    )
    if samples["unmatched_golden"]:
        lines.append(f"Missed: {', '.join(samples['unmatched_golden'])}.")
    if samples["unmatched_extracted"]:
        lines.append(
            f"Not in the UCSB dataset: {', '.join(samples['unmatched_extracted'])} "
            "(the dataset holds only salt-containing electrolytes, so an undoped polymer is expected here)."
        )
    if overall["f1"] is not None:
        quality = (
            "closely agrees with"
            if overall["f1"] >= 0.9
            else "mostly agrees with"
            if overall["f1"] >= 0.7
            else "often disagrees with"
        )
        bias = overall["mean_log_sigma_bias"]
        direction = "above" if bias > 0 else "below"
        lines.append(
            f"On the {overall['golden_points_compared']} UCSB points it could be compared with, it {quality} the "
            f"dataset: {overall['matches']} agree within {LOG_SIGMA_TOLERANCE} decades (F1 {overall['f1']:.2f}), "
            f"off by {overall['mean_abs_log_sigma_error']:.2f} decades on average and {abs(bias):.2f} {direction} "
            "it overall."
        )
    else:
        lines.append("No points could be compared: no matched sample shares a temperature with the dataset.")
    lines.append(
        "Remember the UCSB values were read off fitted curves, not the paper's raw points: gaps of about 0.1 "
        "decades are within that reading, so a disagreement says which source to check against the paper's "
        "figure, not which is wrong. The comparison image puts both next to that figure."
    )
    return " ".join(lines)


def write_report(out: Path, metrics: dict) -> None:
    paper, run, timing, parse = metrics["paper"], metrics["run"], metrics["timing"], metrics["parse"]
    samples, points = metrics["samples"], metrics["points"]
    overall = points["overall"]
    md = [
        f"# Extraction benchmark: {paper['file']}",
        "",
        f"- **Paper:** {paper['reference']}  ",
        f"  DOI: {paper['doi']}",
        f"- **Job:** `{run['job']}` ({run['status']}), features `{run['features']}`",
    ]
    if run.get("error"):
        md.append(f"- **Error:** {_cell(run['error'])}")
    md += [
        f"- **Model:** {run['model']}",
        f"- **Run at:** {run['started_at']}",
        "",
        "## Time",
        "",
        "| | Time |",
        "| --- | --- |",
        (
            f"| Total, submit to finish (polled every {run['poll_every_s']:g} s) | {_seconds(run['wall_s'])} |"
            if run["wall_s"] is not None
            else "| Total, submit to finish | not timed: scored later with `--job` |"
        ),
        f"| Total, as the server logged it | {_seconds(timing.get('total_s'))} |",
        f"| Waiting in the queue | {_seconds(timing.get('queue_s'))} |",
        f"| MinerU parse | {'reused a saved parse' if parse['cached'] else _seconds(timing.get('mineru_s'))} |",
        f"| LLM call | {_seconds(timing.get('llm_s'))} |",
    ]
    md += [f"| Step `{step}` | {_seconds(s)} |" for step, s in timing.get("steps", {}).items()]
    md += [
        "",
        f"MinerU parse **{'was reused (cached)' if parse['cached'] else 'ran fresh'}**: "
        f"`{parse['dir']}`"
        + (f", {parse['figures']} figure(s), {parse['tables']} table(s)" if parse.get("figures") is not None else "")
        + ".",
        "",
    ]
    if run["observed_steps"]:
        md += [
            "What polling saw (first seen, then how long it stayed):",
            "",
            "| Step | First seen | Seen for |",
            "| --- | --- | --- |",
        ]
        md += [
            f"| {s['name']} | {s['first_seen_s']:.0f} s | {_seconds(s.get('seen_for_s'))} |"
            for s in run["observed_steps"]
        ]
    else:
        md.append("Not polled: scored from the server's saved result with `--job`.")
    md += [
        "",
        "## Samples",
        "",
        f"Found **{samples['found']}** (extracted) vs **{samples['expected']}** expected (UCSB), "
        f"**{samples['matched']}** matched.",
        "",
        "| Extracted sample | UCSB sample | Matched on |",
        "| --- | --- | --- |",
    ]
    md += [f"| {_cell(s['extracted'])} | {_cell(s['golden'])} | {_cell(s['reason'])} |" for s in points["per_sample"]]
    md += [f"| {_cell(name)} | — | no UCSB sample |" for name in samples["unmatched_extracted"]]
    md += [f"| — | {_cell(name)} | not extracted |" for name in samples["unmatched_golden"]]
    md += [
        "",
        "## Points",
        "",
        f"Compared only at temperatures both have (within ±{T_TOLERANCE_C:g} °C); a point matches when "
        f"log₁₀ σ is within ±{LOG_SIGMA_TOLERANCE}. Error is extracted minus UCSB, in decades.",
        "",
        "| Sample | Compared (extracted / UCSB) | Matches | Precision | Recall | F1 | Mean abs error | Bias |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for s in points["per_sample"]:
        md.append(
            f"| {_cell(s['extracted'])} | {s['extracted_points_compared']} / {s['golden_points_compared']} | "
            f"{s['matches']} | {_pct(s['precision'])} | {_pct(s['recall'])} | {_pct(s['f1'])} | "
            f"{_dex(s['mean_abs_log_sigma_error'])} | {_dex(s['mean_log_sigma_bias'], signed=True)} |"
        )
    md.append(
        f"| **Overall** | {overall['extracted_points_compared']} / {overall['golden_points_compared']} | "
        f"{overall['matches']} | **{_pct(overall['precision'])}** | **{_pct(overall['recall'])}** | "
        f"**{_pct(overall['f1'])}** | **{_dex(overall['mean_abs_log_sigma_error'])}** | "
        f"{_dex(overall['mean_log_sigma_bias'], signed=True)} |"
    )
    figure = metrics["figure"]
    md += [
        "",
        "## Against the paper",
        "",
        f"![Pipeline and UCSB points next to the paper's figure]({metrics['files']['comparison']})",
        "",
        (
            f"The paper's figure: page {figure['page']}, `{_shown(figure['image'])}` — \"{_cell(figure['caption'])}\". "
            f"Plotted on {figure['x_axis']}"
            + (f", the axis MinerU read off it (\"{_cell(figure['axis_label'])}\")." if figure.get("axis_label") else ".")
            if figure.get("image")
            else "No conductivity figure was found in MinerU's parse."
        ),
        "",
        "## Verdict",
        "",
        verdict(metrics),
        "",
    ]
    if metrics.get("notes"):
        md += ["### Notes", ""] + [f"- {note}" for note in metrics["notes"]] + [""]
    (out / "report.md").write_text("\n".join(md), encoding="utf-8")


def _cell(text: Any) -> str:
    return str(text).replace("|", "\\|").replace("\n", " ")


def _shown(path: str) -> str:
    """A path as the report shows it: relative to extraction/ when inside it."""
    return str(Path(path).relative_to(EXTRACTION)) if Path(path).is_relative_to(EXTRACTION) else path


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def earlier_run(job: str) -> dict | None:
    """The run record from this job's latest earlier benchmark, if any: when
    re-scoring with --job, the timing measured while it ran still applies."""
    found = []
    for path in OUT_ROOT.glob("*/metrics.json"):
        try:
            run = json.loads(path.read_text(encoding="utf-8")).get("run", {})
        except (OSError, ValueError):
            continue
        if run.get("job") == job and run.get("wall_s") is not None:
            found.append((run.get("started_at", ""), run))
    return max(found, key=lambda f: f[0])[1] if found else None


def paper_info(pdf: Path, doi: str | None) -> dict:
    if doi:
        return {"file": pdf.name, "doi": doi, "reference": "(DOI given on the command line)"}
    with open(MAPPING_CSV, newline="", encoding="utf-8") as f:
        mapping = {row["paper_id"]: row for row in csv.DictReader(f)}
    paper_id = paper_id_from_path(pdf)
    if paper_id not in mapping:
        raise SystemExit(f"{pdf.name} isn't in {MAPPING_CSV.name}; pass its DOI with --doi")
    row = mapping[paper_id]
    return {"file": pdf.name, "paper_id": paper_id, "doi": row["golden_doi"], "reference": row["golden_reference"]}


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("pdf", type=Path, help="the paper, e.g. papers/bdf71b01-linden1988.pdf")
    ap.add_argument("--features", default=DEFAULT_FEATURES)
    ap.add_argument("--api", default=DEFAULT_API)
    ap.add_argument("--poll", type=float, default=5.0, help="seconds between status checks (default 5)")
    ap.add_argument("--timeout", type=float, default=3600, help="give up waiting after this many seconds")
    ap.add_argument("--job", help="score this finished job instead of submitting the PDF again")
    ap.add_argument("--doi", help="the paper's DOI in the UCSB dataset, if paper_mapping.csv lacks it")
    ap.add_argument("--figure", help="image to show as the paper's figure, instead of the best caption match")
    ap.add_argument("--x-axis", choices=["auto", "1000/T", "1/T", "T"], default="auto")
    ap.add_argument("--note", action="append", default=[], help="a reviewer's note to add under the verdict")
    ap.add_argument(
        "--pair", action="append", default=[], metavar="NAME=N", help="match extracted sample NAME to UCSB sample N"
    )
    args = ap.parse_args(argv)

    pdf = args.pdf.resolve()
    paper = paper_info(pdf, args.doi)
    golden = golden_samples(paper["doi"])
    if not golden:
        raise SystemExit(f"No rows in {GOLDEN_CSV.name} with DOI {paper['doi']}")
    pairs = {}
    for item in args.pair:
        name, _, n = item.rpartition("=")
        pairs[name] = int(n)

    started_at = datetime.now().astimezone()
    began = time.monotonic()
    if args.job:
        job = args.job
        print(f"Scoring job {job}")
    else:
        job = submit(args.api, pdf, args.features)
        print(f"Submitted {pdf.name} as job {job}; checking every {args.poll:g} s", flush=True)
    saved = RESULTS / f"{job}.json"  # where the server keeps a finished job
    if args.job and saved.exists():
        answer, seen = json.loads(saved.read_text(encoding="utf-8")), []  # finished: no server needed
    else:
        answer, seen = poll(args.api, job, args.poll, args.timeout)
    wall_s = None if args.job else time.monotonic() - began

    timing = job_timings(read_logs(), job)
    features = answer.get("features") or [f.strip() for f in args.features.split(",") if f.strip()]
    extracted = extracted_samples(answer.get("samples") or {}, features) if answer.get("status") == "done" else []
    matches, extra, missed = match_samples(extracted, golden, pairs)

    parse_dir = parse_dir_for(pdf, timing.get("parse_dir"))
    candidates = figure_candidates(parse_dir)
    if args.figure:
        chosen = {"image": str(Path(args.figure).resolve()), "page": None, "caption": "(chosen with --figure)", "score": None}
    else:
        chosen = candidates[0] if candidates and candidates[0]["score"] > 0 else None
    content = parse_dir / "content.md"
    axis_label = axis_label_near(content.read_text(encoding="utf-8"), chosen["caption"]) if chosen and content.exists() else ""
    x_axis = args.x_axis if args.x_axis != "auto" else axis_for(chosen["caption"] if chosen else "", axis_label)

    out = OUT_ROOT / f"{pdf.stem}_{datetime.now():%Y%m%d-%H%M%S}"
    out.mkdir(parents=True, exist_ok=False)
    if saved.exists():
        shutil.copyfile(saved, out / "extraction.json")
    else:
        (out / "extraction.json").write_text(json.dumps(answer, ensure_ascii=False, indent=1), encoding="utf-8")

    scored = score(matches)
    before = earlier_run(job) if args.job else None
    if before:
        started_at = datetime.fromisoformat(before["started_at"])
        wall_s, args.poll = before["wall_s"], before["poll_every_s"]
        seen_steps = before["observed_steps"]
        print(f"Keeping the timing measured when it ran, at {before['started_at']}")
    else:
        seen_steps = observed_steps(seen)
    metrics = {
        "paper": paper,
        "run": {
            "job": job,
            "status": answer.get("status"),
            "error": answer.get("error"),
            "features": ", ".join(features),
            "model": model_used(timing.get("model_logged")),
            "started_at": started_at.isoformat(timespec="seconds"),
            "wall_s": round(wall_s, 1) if wall_s is not None else None,
            "poll_every_s": args.poll,
            "observed_steps": seen_steps,
            "rescored": bool(args.job),
        },
        "timing": timing,
        "parse": {
            "cached": timing.get("parse_cached"),
            "dir": str(parse_dir.relative_to(EXTRACTION)) if parse_dir.is_relative_to(EXTRACTION) else str(parse_dir),
            "figures": timing.get("figures"),
            "tables": timing.get("tables"),
        },
        "samples": {
            "found": len(extracted),
            "expected": len(golden),
            "matched": len(matches),
            "unmatched_extracted": [e.name for e in extra],
            "unmatched_golden": [g.label() for g in missed],
            "extracted": [
                {
                    "name": e.name,
                    "points": len(e.points),
                    "unusable_points": e.unusable,
                    "anion": e.anion,
                    "li_ratio": e.li_ratio,
                    "salt_wt": e.salt_wt,
                    "undoped": e.undoped,
                }
                for e in extracted
            ],
            "golden": [
                {
                    "number": g.number,
                    "polymer": g.polymer,
                    "anion": g.anion,
                    "li_ratio": g.li_ratio,
                    "salt_wt": g.salt_wt,
                    "points": len(g.points),
                }
                for g in golden
            ],
        },
        "points": scored,
        "figure": {
            **(chosen or {"image": None, "page": None, "caption": None}),
            "x_axis": x_axis,
            "axis_label": axis_label,
            "candidates": candidates,
        },
        "settings": {
            "temperature_tolerance_c": T_TOLERANCE_C,
            "log_sigma_tolerance": LOG_SIGMA_TOLERANCE,
            "concentration_tolerance": RATIO_TOLERANCE,
        },
        "files": {"comparison": "comparison.png", "extraction": "extraction.json"},
        "notes": args.note,
    }
    plot_comparison(
        out / "comparison.png",
        chosen,
        matches,
        extra,
        missed,
        x_axis,
        f"{pdf.stem}: pipeline vs UCSB dataset, next to the paper's figure",
    )
    (out / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=1), encoding="utf-8")
    write_report(out, metrics)
    overall = scored["overall"]
    print(
        f"\nSamples: {len(extracted)} found, {len(golden)} expected, {len(matches)} matched. "
        f"Points: precision {_pct(overall['precision'])}, recall {_pct(overall['recall'])}, "
        f"F1 {_pct(overall['f1'])}, mean |Δ log σ| {_dex(overall['mean_abs_log_sigma_error'])}."
    )
    print(f"Report: {out / 'report.md'}")


if __name__ == "__main__":
    main()
