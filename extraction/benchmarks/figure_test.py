"""Test the reading of one figure: MinerU's table for it, and the model reading it alone.

    .venv/bin/python benchmarks/figure_test.py papers/bdf71b01-linden1988.pdf --figure "Fig. 4" \\
        --x-range 0.0029 0.0035 --y-range -7 -3 --job 52791ed7780e465b9d5bb8b37cde96cb

Run from extraction/; the extraction server needn't be running. The paper
must have been parsed (by the Extract page, or benchmark.py). For a figure
that plots log10 conductivity against temperature it:

1. puts the figure on its own axes: finds its plot frame, whose edges are at
   --x-range (left, right) and --y-range (bottom, top), and straightens the
   scan onto them;
2. traces each curve drawn in the figure from its dark pixels, starting from
   the UCSB points (or the pipeline's, for a sample the UCSB set lacks), to
   measure everything else against the curve itself, at any temperature;
3. takes the table MinerU's advanced tier wrote for the figure (just above
   its caption in content.md) and the pipeline's points (--job);
4. sends the model only the figure image and its caption, with the
   pipeline's own instructions and reply format but none of the paper's text
   or tables: one Claude call, on your Claude Code login. --reply reuses a
   saved answer instead, so scoring again costs no call;
5. scores MinerU's table, the model's points and the pipeline's against the
   UCSB dataset as benchmark.py does (temperatures within 2 °C, log10 σ
   within 0.3), and against the traced curves;
6. writes fig<N>_comparison.png, curves_traced.png, report.md, metrics.json and
   ai_reply.json to benchmarks/<paper>_<figure>_<timestamp>/ (gitignored).

It only measures: nothing in the pipeline changes.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import sys
import textwrap
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np

HERE = Path(__file__).resolve().parent  # extraction/benchmarks/
sys.path.insert(0, str(HERE.parent))

from benchmarks import benchmark as bm  # noqa: E402

KELVIN = bm.KELVIN
DARK = 150  # grey level below which a straightened pixel counts as ink
# MinerU writes the "Inf" (∞:1, no salt) curve label as "In:1".
_INFINITE = re.compile(r"∞|\binf(?:inite|inity)?\b|^\s*in\s*:\s*1\s*$", re.IGNORECASE)
# Okabe-Ito hues, safe for colour-blind readers, in a fixed order: one per sample.
COLORS = ["#0072B2", "#E69F00", "#009E73", "#D55E00", "#CC79A7", "#56B4E9"]


# ---------------------------------------------------------------------------
# Axes: temperature to the figure's x, and the frame
# ---------------------------------------------------------------------------


def to_x(t_c: float, axis: str) -> float:
    """A temperature (°C) on the figure's x axis."""
    return {"1/T": lambda t: 1 / (t + KELVIN), "1000/T": lambda t: 1000 / (t + KELVIN)}.get(axis, lambda t: t)(t_c)


def to_celsius(x: float, axis: str) -> float:
    """A position on the figure's x axis as a temperature (°C)."""
    return {"1/T": lambda v: 1 / v - KELVIN, "1000/T": lambda v: 1000 / v - KELVIN}.get(axis, lambda v: v)(x)


def _centre(profile: np.ndarray) -> float | None:
    """Where the ink is in a 1-D grey profile: its darkness-weighted centre."""
    weight = np.clip(235 - profile, 0, None)
    return float((weight * np.arange(len(profile))).sum() / weight.sum()) if weight.sum() else None


def _robust_line(a: list[float], b: list[float]) -> tuple[float, float]:
    """b = c0 + c1 * a, refitted without points more than 1.5 px off."""
    a_, b_ = np.asarray(a), np.asarray(b)
    keep = np.ones(len(a_), bool)
    for _ in range(3):
        c1, c0 = np.polyfit(a_[keep], b_[keep], 1)
        keep = np.abs(b_ - (c0 + c1 * a_)) <= max(1.5, 2 * np.std(b_[keep] - (c0 + c1 * a_[keep])))
    return float(c0), float(c1)


def find_frame(gray: np.ndarray) -> dict[str, tuple[float, float]]:
    """The plot frame's four corners, in image pixels (x, y). Each edge is
    fitted as a straight line, so a scan that is slightly turned or sheared
    still gets its true corners."""
    h, w = gray.shape

    def spread(ink: np.ndarray) -> np.ndarray:
        # Ink in each row, counting a column if any of the 5 rows around has it:
        # a slightly tilted line spreads over a few rows.
        return np.array([ink[max(0, y - 2) : y + 3].any(axis=0).sum() for y in range(ink.shape[0])])

    rows = np.where(spread(gray < 200) > 0.45 * w)[0]
    if len(rows) < 2 or rows.max() - rows.min() < 0.3 * h:
        raise ValueError("no plot frame found: the figure needs a box drawn round its plot")
    top0 = rows[rows <= rows.min() + 10].mean()
    bottom0 = rows[rows >= rows.max() - 10].mean()
    band = gray[int(top0) + 6 : int(bottom0) - 5]
    cols = np.where(spread((band < 220).T) > 0.3 * band.shape[0])[0]
    if len(cols) < 2 or cols.max() - cols.min() < 0.3 * w:
        raise ValueError("no plot frame found: the figure's box has no left and right edges")
    left0 = cols[cols <= cols.min() + 12].mean()
    right0 = cols[cols >= cols.max() - 12].mean()

    def horizontal(y0: float) -> tuple[float, float]:
        xs, ys = [], []
        for x in np.linspace(left0 + 40, right0 - 40, 14).astype(int):
            lo = int(y0) - 8
            found = _centre(gray[lo : int(y0) + 9, x - 10 : x + 11].mean(axis=1))
            if found is not None:
                xs.append(x)
                ys.append(lo + found)
        return _robust_line(xs, ys)  # y = c0 + c1 x

    def vertical(x0: float) -> tuple[float, float]:
        ys, xs = [], []
        for y in np.linspace(top0 + 40, bottom0 - 40, 14).astype(int):
            lo = int(x0) - 12
            found = _centre(gray[y - 10 : y + 11, lo : int(x0) + 13].mean(axis=0))
            if found is not None:
                ys.append(y)
                xs.append(lo + found)
        return _robust_line(ys, xs)  # x = c0 + c1 y

    def corner(hline: tuple[float, float], vline: tuple[float, float]) -> tuple[float, float]:
        (a, b), (c, d) = hline, vline
        x = (c + d * a) / (1 - d * b)
        return x, a + b * x

    top, bottom, left, right = horizontal(top0), horizontal(bottom0), vertical(left0), vertical(right0)
    return {
        "top_left": corner(top, left),
        "top_right": corner(top, right),
        "bottom_left": corner(bottom, left),
        "bottom_right": corner(bottom, right),
    }


def homography(src: list[tuple[float, float]], dst: list[tuple[float, float]]) -> np.ndarray:
    """The 3x3 projective map taking four points `src` to `dst`."""
    rows = []
    for (x, y), (u, v) in zip(src, dst):
        rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
        rows.append([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
    m = np.linalg.svd(np.asarray(rows, float))[2][-1].reshape(3, 3)
    return m / m[2, 2]


@dataclass
class Plot:
    """The figure straightened onto its own axes: pixel (0, 0) of `image` is
    the frame's top-left corner, and data and pixels map linearly."""

    image: np.ndarray  # grey, 0-255
    x_range: tuple[float, float]  # left, right
    y_range: tuple[float, float]  # bottom, top

    def to_px(self, x: float, y: float) -> tuple[float, float]:
        h, w = self.image.shape
        (x0, x1), (y0, y1) = self.x_range, self.y_range
        return (x - x0) / (x1 - x0) * w - 0.5, (y1 - y) / (y1 - y0) * h - 0.5

    def to_data(self, px: float, py: float) -> tuple[float, float]:
        h, w = self.image.shape
        (x0, x1), (y0, y1) = self.x_range, self.y_range
        return x0 + (px + 0.5) / w * (x1 - x0), y1 - (py + 0.5) / h * (y1 - y0)


def straighten(gray: np.ndarray, corners: dict, x_range, y_range) -> Plot:
    """Resample the frame's inside onto a rectangle the frame's size."""
    tl, tr, bl, br = (corners[k] for k in ("top_left", "top_right", "bottom_left", "bottom_right"))
    w = round(math.dist(tl, tr))
    h = round(math.dist(tl, bl))
    unit_to_px = homography([(0, 0), (1, 0), (0, 1), (1, 1)], [tl, tr, bl, br])
    u, v = np.meshgrid((np.arange(w) + 0.5) / w, (np.arange(h) + 0.5) / h)
    p = unit_to_px @ np.stack([u.ravel(), v.ravel(), np.ones(u.size)])
    sx, sy = p[0] / p[2], p[1] / p[2]
    # Bilinear sampling.
    x0 = np.clip(np.floor(sx).astype(int), 0, gray.shape[1] - 2)
    y0 = np.clip(np.floor(sy).astype(int), 0, gray.shape[0] - 2)
    fx, fy = np.clip(sx - x0, 0, 1), np.clip(sy - y0, 0, 1)
    out = (
        gray[y0, x0] * (1 - fx) * (1 - fy)
        + gray[y0, x0 + 1] * fx * (1 - fy)
        + gray[y0 + 1, x0] * (1 - fx) * fy
        + gray[y0 + 1, x0 + 1] * fx * fy
    )
    return Plot(out.reshape(h, w), tuple(x_range), tuple(y_range))


# ---------------------------------------------------------------------------
# The curves drawn in the figure
# ---------------------------------------------------------------------------


@dataclass
class Curve:
    """One curve traced from the figure, in data units (figure x, log10 σ)."""

    x_min: float
    x_max: float
    coeffs: np.ndarray  # polynomial in the straightened image's pixels
    residual_px: float
    plot: Plot

    def __call__(self, x: float) -> float | None:
        if not (self.x_min <= x <= self.x_max):
            return None
        px, _ = self.plot.to_px(x, 0)
        return self.plot.to_data(px, float(np.polyval(self.coeffs, px)))[1]


def _ink_runs(column: np.ndarray) -> list[tuple[int, int]]:
    runs, start = [], None
    for i, ink in enumerate(list(column) + [False]):
        if ink and start is None:
            start = i
        elif not ink and start is not None:
            runs.append((start, i - 1))
            start = None
    return runs


def _line_hit(ink: np.ndarray, x: int, y_pred: float, window: float) -> float | None:
    """Where a thin drawn line crosses column x within `window` px of y_pred.
    Tall runs (a marker's side, a letter's stroke) and long flat ones (the
    frame) don't count."""
    h = ink.shape[0]
    lo, hi = max(0, int(round(y_pred - window))), min(h, int(round(y_pred + window)) + 1)
    best = None
    for a, b in _ink_runs(ink[lo:hi, x]):
        if b - a + 1 > 7:
            continue
        centre = lo + (a + b) / 2
        # The frame: ink along most of 81 px. A nearly flat curve beside a marker has well under that.
        if ink[int(round(centre)), max(0, x - 40) : x + 41].sum() > 72:
            continue
        if best is None or abs(centre - y_pred) < abs(best - y_pred):
            best = centre
    return best


def trace_curve(plot: Plot, seeds: list[tuple[float, float]], max_gap: int = 8, reach: int = 160) -> Curve | None:
    """The drawn curve passing near `seeds` (points in data units): found
    along the seeds' span, then followed outward until the line stops."""
    ink = plot.image < DARK
    h, w = ink.shape
    pts = np.array([plot.to_px(x, y) for x, y in seeds])
    if len(pts) < 3:
        return None
    guess = np.polyfit(pts[:, 0], pts[:, 1], 2)
    hits: dict[int, float] = {}
    for x in range(max(0, int(math.ceil(pts[:, 0].min()))), min(w, int(pts[:, 0].max()) + 1)):
        found = _line_hit(ink, x, float(np.polyval(guess, x)), 12)
        if found is not None:
            hits[x] = found
    if len(hits) < 20:
        return None
    fit = _robust_poly(hits, 3)
    hits = {x: y for x, y in hits.items() if abs(y - np.polyval(fit, x)) <= 3}
    start, end = min(hits), max(hits)
    for step, edge in ((1, end), (-1, start)):
        recent = deque(sorted(hits.items(), key=lambda item: -step * item[0])[:25][::-1], maxlen=25)
        x, missed = edge, 0
        while missed <= max_gap and abs(x - edge) < reach and 0 <= x + step < w:
            x += step
            xs, ys = zip(*recent)
            slope, intercept = np.polyfit(xs, ys, 1)
            found = _line_hit(ink, x, slope * x + intercept, 3)
            if found is None:
                missed += 1
            else:
                hits[x] = found
                recent.append((x, found))
                missed = 0
    fit = _robust_poly(hits, 4)
    kept = [x for x, y in hits.items() if abs(y - np.polyval(fit, x)) <= 3]
    residual = float(np.std([hits[x] - np.polyval(fit, x) for x in kept]))
    return Curve(plot.to_data(min(kept), 0)[0], plot.to_data(max(kept), 0)[0], fit, residual, plot)


def _robust_poly(points: dict[int, float], degree: int) -> np.ndarray:
    xs, ys = np.array(list(points)), np.array(list(points.values()))
    keep = np.ones(len(xs), bool)
    for _ in range(4):
        coeffs = np.polyfit(xs[keep], ys[keep], degree)
        residual = ys - np.polyval(coeffs, xs)
        keep = np.abs(residual) <= max(2.0, 2.5 * np.std(residual[keep]))
    return coeffs


# ---------------------------------------------------------------------------
# The sources: MinerU's table, the model, the pipeline
# ---------------------------------------------------------------------------


def find_figure(parse_dir: Path, label: str) -> dict:
    """The manifest's figure whose caption starts with `label` ("Fig. 4")."""
    number = re.search(r"\d+", label)
    if not number:
        raise SystemExit(f"--figure {label!r}: give it as the caption starts, e.g. \"Fig. 4\"")
    pattern = re.compile(rf"^\s*fig(?:ure)?\.?\s*{number.group()}\b", re.IGNORECASE)
    manifest = json.loads((parse_dir / "manifest.json").read_text(encoding="utf-8"))
    for figure in manifest.get("figures", []):
        if pattern.match(figure.get("caption") or ""):
            return {"image": parse_dir / figure["image_path"], "page": figure.get("page"), "caption": figure["caption"]}
    raise SystemExit(f"No figure with a caption starting {label!r} in {parse_dir / 'manifest.json'}")


def mineru_samples(table: list[list[str]], axis: str) -> list[bm.ExtractedSample]:
    """MinerU's table for the figure (x in the first column, a column of
    log10 σ per curve) as samples of (°C, S/cm) points."""
    if len(table) < 2:
        return []
    header, rows = table[0], table[1:]
    samples = []
    for j, label in enumerate(header[1:], 1):
        points = []
        for row in rows:
            x, y = (_cell_number(row[i]) if i < len(row) else None for i in (0, j))
            if x is not None and y is not None and (axis == "T" or x > 0):
                points.append((to_celsius(x, axis), 10**y))
        samples.append(
            bm.ExtractedSample(
                name=label,
                points=sorted(points),
                anion=bm.anion_from_name(label),
                li_ratio=bm.li_ratio_from_name(label),
                undoped=bool(_INFINITE.search(label) or bm._UNDOPED.search(label)),
            )
        )
    return samples


def _cell_number(cell: str) -> float | None:
    return bm.number(cell.replace("~", "").replace("≈", "").replace("−", "-").strip())


def reply_schema(features: list[str]) -> dict:
    """The pipeline's reply format (extract_features.extract_features)."""
    value = {"type": ["string", "number", "null"]}
    point = {"type": "object", "properties": {f: value for f in features}, "additionalProperties": False}
    sample = {
        "type": "object",
        "properties": {"sample": {"type": "string"}, "points": {"type": "array", "items": point}},
        "required": ["sample", "points"],
        "additionalProperties": False,
    }
    return {
        "type": "object",
        "properties": {"samples": {"type": "array", "items": sample}},
        "required": ["samples"],
        "additionalProperties": False,
    }


def ask_about_figure(image: Path, caption: str, features: list[str]) -> dict:
    """One model call with only the figure and its caption: the pipeline's
    own instructions, minus the paper's text and tables."""
    import extract_features as ef  # the pipeline's prompt pieces; also puts util/ on the path
    from util.claudeAPIMock import ask_llm

    system = (
        "You extract data from a scientific paper. You get one of its figures, labelled with its caption, "
        "and a list of features. " + ef._TASK
    )
    prompt = ef.feature_list(features)
    began = time.monotonic()
    reply = ask_llm(prompt, system=system, json_schema=reply_schema(features), images=[(image, caption)])
    seconds = time.monotonic() - began
    samples: dict[str, list[dict]] = {}
    for reported in json.loads(reply)["samples"]:
        samples.setdefault(reported["sample"], []).extend(
            {f: p.get(f) for f in features} for p in reported["points"]
        )
    return {
        "samples": samples,
        "seconds": round(seconds, 1),
        "model": bm.model_used(None),
        "system": system,
        "prompt": prompt,
        "image": str(image),
        "caption": caption,
        "asked_at": datetime.now().astimezone().isoformat(timespec="seconds"),
    }


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


@dataclass
class Source:
    name: str  # "MinerU's table", ...
    samples: list[bm.ExtractedSample]
    keys: dict[str, Any]  # sample name -> curve key: UCSB sample number, "undoped", or its own name
    scored: dict  # benchmark.score() against UCSB
    unmatched: list[str]


def keyed_source(name: str, samples: list[bm.ExtractedSample], golden, pairs=None) -> Source:
    matches, extra, missed = bm.match_samples(samples, golden, pairs)
    keys: dict[str, Any] = {m.extracted.name: m.golden.number for m in matches}
    for e in extra:
        keys[e.name] = "undoped" if e.undoped else e.name
    return Source(name, samples, keys, bm.score(matches), [e.name for e in extra if not e.undoped])


def against_curves(source: Source, curves: dict[Any, Curve], axis: str) -> dict:
    """Each point's distance from the curve it belongs to, in decades; a point
    past either end of that curve is counted as beyond it, not scored."""
    per_sample, errors, beyond, no_curve = {}, [], 0, 0
    for s in source.samples:
        curve = curves.get(source.keys.get(s.name))
        rows = []
        for t, sigma in s.points:
            x, y = to_x(t, axis), math.log10(sigma)
            on = curve(x) if curve else None
            rows.append({"t": round(t, 2), "x": x, "log_sigma": round(y, 3), "curve": None if on is None else round(on, 3)})
            if curve is None:
                no_curve += 1
            elif on is None:
                beyond += 1
            else:
                rows[-1]["error"] = round(y - on, 3)
                errors.append(y - on)
        per_sample[s.name] = rows
    return {
        "points_on_curves": len(errors),
        "beyond_curve_ends": beyond,
        "without_a_curve": no_curve,
        "within_tolerance": sum(abs(e) <= bm.LOG_SIGMA_TOLERANCE for e in errors),
        "mean_abs_error": float(np.mean(np.abs(errors))) if errors else None,
        "max_abs_error": float(np.max(np.abs(errors))) if errors else None,
        "mean_bias": float(np.mean(errors)) if errors else None,
        "per_sample": per_sample,
    }


def diagnose(mineru: Source, curves: dict[Any, Curve], axis: str, along: dict) -> dict:
    """How MinerU's table departs from the drawn curves, per column: at the
    hot and cold ends, in slope, in the steps between rows (a curve that
    bends steepens from row to row), rows past the curve's ends, and which
    curve its coldest value actually lies on."""
    found = {}
    for s in mineru.samples:
        key, rows = mineru.keys.get(s.name), along["per_sample"][s.name]
        on = [r for r in rows if "error" in r]
        if not on or curves.get(key) is None:
            continue
        x = np.array([r["x"] for r in on])
        y = np.array([r["log_sigma"] for r in on])
        c = np.array([r["curve"] for r in on])
        hot, cold = sorted(on, key=lambda r: -r["t"])[0], sorted(on, key=lambda r: r["t"])[0]
        there = {k: v for k, curve in curves.items() if (v := curve(cold["x"])) is not None}
        found[s.name] = {
            "curve": key,
            "cold_end_lies_on": min(there, key=lambda k: abs(there[k] - cold["log_sigma"])),
            "hot_end": {"t": hot["t"], "error": hot["error"]},
            "cold_end": {"t": cold["t"], "error": cold["error"]},
            "slope_ratio": float(np.polyfit(x, y, 1)[0] / np.polyfit(x, c, 1)[0]) if len(on) > 2 else None,
            "steps": [round(float(v), 3) for v in np.diff(y)],
            "curve_steps": [round(float(v), 3) for v in np.diff(c)],
            "beyond": [r["t"] for r in rows if "error" not in r and r["curve"] is None],
        }
    return found


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


def _key_label(key: Any, sources: list[Source], golden) -> str:
    if key == "undoped":
        return "no salt (∞:1)"
    for source in sources:
        for name, k in source.keys.items():
            if k == key and (m := re.search(r"\d+(?:\.\d+)?\s*:\s*\d+(?:\.\d+)?", name)):
                return m.group().replace(" ", "")
    g = next((g for g in golden if g.number == key), None)
    return g.label() if g else str(key)


def plot_comparison(path: Path, plot: Plot, axis: str, golden, sources: dict[str, Source], curves, colors) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.lines import Line2D

    (x0, x1), (y0, y1) = plot.x_range, plot.y_range
    fig = plt.figure(figsize=(18, 12.5))
    grid = fig.add_gridspec(2, 2, height_ratios=[1.45, 1], hspace=0.32, wspace=0.12)
    a, b, c = fig.add_subplot(grid[0, 0]), fig.add_subplot(grid[0, 1]), fig.add_subplot(grid[1, :])

    def xy(t: float, sigma: float) -> tuple[float, float]:
        return to_x(t, axis), math.log10(sigma)

    def draw(ax, source: Source | None, style: dict, connectors: bool = False) -> None:
        if source is None:
            return
        for s in source.samples:
            if not s.points:
                continue
            color = colors.get(source.keys.get(s.name), "0.4")
            xs, ys = zip(*(xy(t, sigma) for t, sigma in s.points))
            ax.plot(xs, ys, color=color, **style)
            curve = curves.get(source.keys.get(s.name))
            if connectors and curve:
                for x, y in zip(xs, ys):
                    if (on := curve(x)) is not None:
                        ax.plot([x, x], [y, on], color=color, lw=1.6, alpha=0.9, solid_capstyle="butt")

    def figure_axes(ax, title: str) -> None:
        ax.imshow(plot.image, cmap="gray", vmin=0, vmax=255, extent=[x0, x1, y0, y1], aspect="auto", alpha=0.55)
        ax.set_xlim(x0, x1)
        ax.set_ylim(y0, y1)
        ax.set_title(title, fontsize=11.5, loc="left")
        ax.set_ylabel("log$_{10}$ σ (S cm$^{-1}$)")
        _x_labels(ax, axis)

    golden_style = {"ls": "none", "marker": "D", "mfc": "white", "ms": 6.5, "mew": 1.4, "zorder": 4}
    ucsb = sources.get("ucsb")
    figure_axes(a, "MinerU's table for this figure (×, dashed), against the curves drawn in it")
    draw(a, sources.get("mineru"), {"ls": "--", "lw": 1.2, "marker": "x", "ms": 7, "mew": 2, "zorder": 5}, connectors=True)
    draw(a, ucsb, golden_style)
    draw(a, sources.get("pipeline"), {"ls": "none", "marker": "o", "ms": 3.2, "zorder": 6})
    a.legend(
        handles=[
            Line2D([], [], color="k", ls="--", marker="x", mew=2, label="MinerU's table (vertical bar: gap to the curve)"),
            Line2D([], [], color="k", ls="none", marker="D", mfc="white", label="UCSB dataset"),
            Line2D([], [], color="k", ls="none", marker="o", ms=3.2, label="Pipeline (read from Fig. 5's table)"),
        ],
        loc="lower left",
        fontsize=8.5,
        framealpha=0.92,
    )
    figure_axes(b, "The model reading this figure alone (▲)")
    draw(b, sources.get("ai"), {"ls": "-", "lw": 1.1, "marker": "^", "ms": 6, "zorder": 5}, connectors=True)
    draw(b, ucsb, golden_style)
    b.legend(
        handles=[
            Line2D([], [], color="k", ls="-", marker="^", label="Model, figure and caption only (bar: gap to the curve)"),
            Line2D([], [], color="k", ls="none", marker="D", mfc="white", label="UCSB dataset"),
        ],
        loc="lower left",
        fontsize=8.5,
        framealpha=0.92,
    )

    c.axhspan(-bm.LOG_SIGMA_TOLERANCE, bm.LOG_SIGMA_TOLERANCE, color="0.92", zorder=0)
    c.axhline(0, color="0.55", lw=0.8)
    for key_name, style in (
        ("mineru", {"ls": "--", "marker": "x", "ms": 6, "mew": 1.8, "lw": 1.1}),
        ("ai", {"ls": "-", "marker": "^", "ms": 5.5, "lw": 1.1}),
    ):
        source = sources.get(key_name)
        if source is None:
            continue
        for s in source.samples:
            curve = curves.get(source.keys.get(s.name))
            if curve is None:
                continue
            pairs = [(x, y - on) for x, y in (xy(t, sg) for t, sg in s.points) if (on := curve(x)) is not None]
            if pairs:
                c.plot(*zip(*pairs), color=colors.get(source.keys.get(s.name), "0.4"), **style)
    c.set_xlim(x0, x1)
    c.set_ylabel("Distance from the drawn curve\n(decades of σ)")
    c.set_title(
        f"How far each reading is from the curve it belongs to (grey band: ±{bm.LOG_SIGMA_TOLERANCE}, the benchmark's match tolerance)",
        fontsize=11.5,
        loc="left",
    )
    c.grid(alpha=0.25)
    _x_labels(c, axis)
    labels = {key: _key_label(key, list(sources.values()), golden) for key in colors}
    c.legend(
        handles=[Line2D([], [], color=color, lw=3, label=labels[key]) for key, color in colors.items()]
        + [
            Line2D([], [], color="k", ls="--", marker="x", label="MinerU's table"),
            Line2D([], [], color="k", ls="-", marker="^", label="Model, figure alone"),
        ],
        loc="lower left",
        fontsize=8.5,
        ncol=4,
        framealpha=0.92,
    )
    fig.savefig(path, dpi=130, bbox_inches="tight")
    plt.close(fig)


def _x_labels(ax, axis: str) -> None:
    label = {"1/T": "1/T (K$^{-1}$)", "1000/T": "1000/T (K$^{-1}$)"}.get(axis, "T (°C)")
    ax.set_xlabel(label)
    if axis in ("1/T", "1000/T"):
        top = ax.secondary_xaxis("top", functions=(lambda x: to_celsius(np.asarray(x, float), axis), lambda t: to_x(np.asarray(t, float), axis)))
        top.set_xlabel("T (°C)", fontsize=9)


def plot_traces(path: Path, plot: Plot, curves: dict, colors: dict, labels: dict) -> None:
    """The traced curves drawn over the figure, to check the tracing by eye."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    (x0, x1), (y0, y1) = plot.x_range, plot.y_range
    fig, ax = plt.subplots(figsize=(11, 7.5))
    ax.imshow(plot.image, cmap="gray", vmin=0, vmax=255, extent=[x0, x1, y0, y1], aspect="auto")
    for key, curve in curves.items():
        xs = np.linspace(curve.x_min, curve.x_max, 300)
        ax.plot(xs, [curve(x) for x in xs], color=colors[key], lw=1.4, alpha=0.85, label=f"{labels[key]} (fit residual {curve.residual_px:.1f} px)")
        ax.plot([curve.x_min, curve.x_max], [curve(curve.x_min), curve(curve.x_max)], "|", color=colors[key], ms=16, mew=2)
    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    ax.set_title("Curves traced from the straightened figure (ticks: where each drawn line ends)", fontsize=11, loc="left")
    ax.legend(fontsize=8, loc="lower left")
    fig.savefig(path, dpi=110, bbox_inches="tight")
    plt.close(fig)


def _span(values: list[float]) -> str:
    return f"{min(values):.2f}–{max(values):.2f}" if values else "—"


def _rates_row(name: str, scored: dict, along: dict) -> str:
    o = scored["overall"]
    return (
        f"| {name} | {o['extracted_points_compared']} / {o['golden_points_compared']} | {o['matches']} | "
        f"{bm._pct(o['precision'])} | {bm._pct(o['recall'])} | {bm._pct(o['f1'])} | "
        f"{bm._dex(o['mean_abs_log_sigma_error'])} | {bm._dex(o['mean_log_sigma_bias'], signed=True)} | "
        f"{along['within_tolerance']} / {along['points_on_curves']} | {bm._dex(along['mean_abs_error'])} | "
        f"{along['beyond_curve_ends']} |"
    )


def write_report(out: Path, m: dict) -> None:
    fig, call = m["figure"], m["ai_call"]
    names = {"mineru": "MinerU's table for the figure", "ai": "Model, figure and caption only", "pipeline": "Pipeline (whole paper)"}
    md = [
        f"# {fig['label']} of {m['paper']['file']}: MinerU's table, and the model reading it alone",
        "",
        f"- **Paper:** {m['paper']['reference']}  ",
        f"  DOI: {m['paper']['doi']}",
        f"- **Figure:** page {fig['page']}, `{bm._shown(fig['image'])}` — \"{bm._cell(fig['caption'])}\"",
        f"- **Model:** {call['model']}",
        f"- **Model call:** {call['when']}, {bm._seconds(call['seconds'])}"
        + (" (asked by an earlier run; this report re-scored its saved answer, with no new call)" if call["reused"] else ""),
        "",
        f"![The figure with MinerU's, the model's and the UCSB values on its own axes]({m['files']['comparison']})",
        "",
        "The figure is straightened onto its own axes (its frame's corners are at "
        f"x {fig['x_range'][0]:g} to {fig['x_range'][1]:g}, log₁₀ σ {fig['y_range'][0]:g} to {fig['y_range'][1]:g}), "
        "so every point sits where it would be drawn. Each curve drawn in the figure was traced from its pixels "
        f"([{m['files']['traces']}]({m['files']['traces']})), which gives a reference at any temperature, not only "
        "at the UCSB dataset's.",
        "",
        "## Scores",
        "",
        f"Against the UCSB dataset as benchmark.py scores (temperatures within ±{bm.T_TOLERANCE_C:g} °C, "
        f"log₁₀ σ within ±{bm.LOG_SIGMA_TOLERANCE}), and against the curves drawn in the figure (within "
        f"±{bm.LOG_SIGMA_TOLERANCE} of the curve at the same x; points past a curve's ends aren't scored).",
        "",
        "| Source | Compared (read / UCSB) | Matches | Precision | Recall | F1 | Mean abs error | Bias "
        "| On the curve | Mean distance from curve | Past the curve's ends |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    md += [_rates_row(names[k], m["sources"][k]["ucsb"], m["sources"][k]["curves"]) for k in names if k in m["sources"]]
    md += ["", "Per sample, against the UCSB dataset:", ""]
    md += [
        "| Source | Sample | UCSB sample | Compared | Matches | F1 | Mean abs error | Bias |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for k in names:
        for s in m["sources"].get(k, {}).get("ucsb", {}).get("per_sample", []):
            md.append(
                f"| {names[k]} | {bm._cell(s['extracted'])} | {bm._cell(s['golden'])} | "
                f"{s['extracted_points_compared']} / {s['golden_points_compared']} | {s['matches']} | {bm._pct(s['f1'])} | "
                f"{bm._dex(s['mean_abs_log_sigma_error'])} | {bm._dex(s['mean_log_sigma_bias'], signed=True)} |"
            )
    md += ["", "## What MinerU's table gets wrong", ""]
    md += [
        "| Column | Its curve | Hot end | Cold end | Nearest curve at its cold end | Slope vs the curve "
        "| Steps between rows: MinerU / curve | Rows past the curve's ends |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for name, d in m["mineru_diagnosis"].items():
        slope = "—" if d["slope_ratio"] is None else f"{d['slope_ratio']:.0%}"
        md.append(
            f"| {bm._cell(name)} | {d['curve_label']} | {d['hot_end']['error']:+.2f} at {d['hot_end']['t']:.0f} °C | "
            f"{d['cold_end']['error']:+.2f} at {d['cold_end']['t']:.0f} °C | {d['cold_end_label']} | {slope} | "
            f"{_span(d['steps'])} / {_span(d['curve_steps'])} | "
            f"{', '.join(f'{t:.0f} °C' for t in d['beyond']) or 'none'} |"
        )
    md += [
        "",
        "Errors are MinerU's value minus the drawn curve, in decades. Steps are the change in log₁₀ σ from one "
        "row to the next: a curve that bends steepens from row to row, a straight line doesn't.",
    ]
    for title, key in (("Why", "why"), ("The model on its own", "ai_summary"), ("Notes", "notes")):
        if m.get(key):
            md += ["", f"## {title}", ""] + [f"- {line}" for line in m[key]]
    md.append("")
    (out / "report.md").write_text("\n".join(md), encoding="utf-8")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--figure", required=True, help='how its caption starts, e.g. "Fig. 4"')
    ap.add_argument("--x-range", type=float, nargs=2, required=True, metavar=("LEFT", "RIGHT"), help="x at the frame's left and right edges")
    ap.add_argument("--y-range", type=float, nargs=2, required=True, metavar=("BOTTOM", "TOP"), help="log10 σ at the frame's bottom and top")
    ap.add_argument("--x-axis", choices=["auto", "1000/T", "1/T", "T"], default="auto")
    ap.add_argument("--job", help="the pipeline's extraction of this paper, to show and score its points too")
    ap.add_argument("--reply", type=Path, help="an ai_reply.json from an earlier run: score it instead of asking again")
    ap.add_argument("--features", default=bm.DEFAULT_FEATURES)
    ap.add_argument("--doi")
    ap.add_argument("--pair", action="append", default=[], metavar="NAME=N", help="match the model's sample NAME to UCSB sample N")
    ap.add_argument("--why", action="append", default=[], help="a sentence for the report's Why section")
    ap.add_argument("--note", action="append", default=[])
    args = ap.parse_args(argv)

    from PIL import Image

    pdf = args.pdf.resolve()
    paper = bm.paper_info(pdf, args.doi)
    golden = bm.golden_samples(paper["doi"])
    features = [f.strip() for f in args.features.split(",") if f.strip()]
    timing = bm.job_timings(bm.read_logs(), args.job) if args.job else {}
    parse_dir = bm.parse_dir_for(pdf, timing.get("parse_dir"))
    if not (parse_dir / "manifest.json").exists() and paper.get("paper_id"):
        parse_dir = bm.PARSED / paper["paper_id"]
    figure = find_figure(parse_dir, args.figure)
    table = bm.table_above((parse_dir / "content.md").read_text(encoding="utf-8"), figure["caption"])
    axis = args.x_axis if args.x_axis != "auto" else bm.axis_for(figure["caption"], table[0][0] if table else "")

    gray = np.asarray(Image.open(figure["image"]).convert("L"), float)
    corners = find_frame(gray)
    plot = straighten(gray, corners, args.x_range, args.y_range)

    pairs = {name: int(n) for name, _, n in (p.rpartition("=") for p in args.pair)}
    sources: dict[str, Source] = {
        "mineru": keyed_source("mineru", mineru_samples(table, axis), golden),
        "ucsb": Source(
            "ucsb",
            [bm.ExtractedSample(g.label(), g.points) for g in golden],
            {g.label(): g.number for g in golden},
            {},
            [],
        ),
    }
    if args.job:
        saved = json.loads((bm.RESULTS / f"{args.job}.json").read_text(encoding="utf-8"))
        sources["pipeline"] = keyed_source("pipeline", bm.extracted_samples(saved.get("samples") or {}, features), golden)
    if args.reply:
        reply = json.loads(args.reply.read_text(encoding="utf-8"))
        reused = True
    else:
        print(f"Asking the model about {figure['image'].name} alone (one Claude call)...", flush=True)
        reply = ask_about_figure(figure["image"], figure["caption"], features)
        reused = False
    sources["ai"] = keyed_source("ai", bm.extracted_samples(reply["samples"], features), golden, pairs)

    # Trace each curve from the UCSB points, or the pipeline's for a sample the set lacks.
    seeds: dict[Any, list[tuple[float, float]]] = {
        g.number: [(to_x(t, axis), math.log10(s)) for t, s in g.points] for g in golden
    }
    for s in sources["pipeline"].samples if "pipeline" in sources else []:
        key = sources["pipeline"].keys[s.name]
        if key not in seeds and s.points:
            seeds[key] = [(to_x(t, axis), math.log10(sg)) for t, sg in s.points]
    curves = {key: c for key, pts in seeds.items() if (c := trace_curve(plot, pts)) is not None}
    colors = {key: COLORS[i % len(COLORS)] for i, key in enumerate(sorted(curves, key=lambda k: (isinstance(k, str), str(k))))}
    labels = {key: _key_label(key, list(sources.values()), golden) for key in curves}

    along = {k: against_curves(s, curves, axis) for k, s in sources.items()}
    diagnosis = diagnose(sources["mineru"], curves, axis, along["mineru"])
    for d in diagnosis.values():
        d["curve_label"] = labels.get(d["curve"], str(d["curve"]))
        d["cold_end_label"] = (
            "its own curve" if d["cold_end_lies_on"] == d["curve"] else labels.get(d["cold_end_lies_on"], str(d["cold_end_lies_on"]))
        )

    short = re.sub(r"^[0-9a-f]{8}-", "", pdf.stem)
    fig_tag = "fig" + re.search(r"\d+", args.figure).group()
    out = bm.OUT_ROOT / f"{short}_{fig_tag}_{datetime.now():%Y%m%d-%H%M%S}"
    out.mkdir(parents=True)
    (out / "ai_reply.json").write_text(json.dumps(reply, ensure_ascii=False, indent=1), encoding="utf-8")
    plot_comparison(out / f"{fig_tag}_comparison.png", plot, axis, golden, sources, curves, colors)
    plot_traces(out / "curves_traced.png", plot, curves, colors, labels)

    ai_scored = sources["ai"].scored["overall"]
    metrics = {
        "paper": paper,
        "figure": {
            "label": args.figure,
            "image": str(figure["image"]),
            "page": figure["page"],
            "caption": figure["caption"],
            "x_axis": axis,
            "x_range": args.x_range,
            "y_range": args.y_range,
            "frame_corners_px": {k: [round(v, 1) for v in xy] for k, xy in corners.items()},
            "mineru_table": table,
        },
        "ai_call": {
            "model": reply.get("model"),
            "seconds": reply.get("seconds"),
            "when": reply.get("asked_at"),
            "reused": reused,
            "system": reply.get("system"),
            "prompt": reply.get("prompt"),
        },
        "curves": {
            labels[k]: {
                "key": k,
                "x_min": c.x_min,
                "x_max": c.x_max,
                "t_max_c": round(to_celsius(c.x_min, axis), 1) if axis != "T" else c.x_max,
                "t_min_c": round(to_celsius(c.x_max, axis), 1) if axis != "T" else c.x_min,
                "fit_residual_px": round(c.residual_px, 2),
            }
            for k, c in curves.items()
        },
        "sources": {
            k: {"ucsb": s.scored, "curves": along[k], "unmatched": s.unmatched, "keys": {n: str(v) for n, v in s.keys.items()}}
            for k, s in sources.items()
            if k != "ucsb"
        },
        "ucsb_against_curves": {key: value for key, value in along["ucsb"].items() if key != "per_sample"},
        "mineru_diagnosis": diagnosis,
        "why": args.why,
        "ai_summary": [],
        "notes": args.note,
        "settings": {"temperature_tolerance_c": bm.T_TOLERANCE_C, "log_sigma_tolerance": bm.LOG_SIGMA_TOLERANCE},
        "files": {
            "comparison": f"{fig_tag}_comparison.png",
            "traces": "curves_traced.png",
            "reply": "ai_reply.json",
        },
    }
    ai_curves = along["ai"]
    metrics["ai_summary"] = [
        f"It reported {len(sources['ai'].samples)} sample(s) and {sum(len(s.points) for s in sources['ai'].samples)} point(s); "
        f"{ai_scored['matches']} of the {ai_scored['golden_points_compared']} UCSB points it could be compared with agree "
        f"within {bm.LOG_SIGMA_TOLERANCE} (F1 {bm._pct(ai_scored['f1'])}, mean error {bm._dex(ai_scored['mean_abs_log_sigma_error'])} "
        f"decades, bias {bm._dex(ai_scored['mean_log_sigma_bias'], signed=True)}).",
        f"Against the curves drawn in the figure: {ai_curves['within_tolerance']} of {ai_curves['points_on_curves']} points "
        f"within {bm.LOG_SIGMA_TOLERANCE}, {bm._dex(ai_curves['mean_abs_error'])} decades off on average, "
        f"{ai_curves['beyond_curve_ends']} past a curve's ends.",
    ]
    (out / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    write_report(out, metrics)
    for k in ("mineru", "ai", "pipeline"):
        if k in sources:
            o, cv = sources[k].scored["overall"], along[k]
            print(
                f"{k:9s} vs UCSB: F1 {bm._pct(o['f1'])}, mean |Δ| {bm._dex(o['mean_abs_log_sigma_error'])}; "
                f"vs curves: {cv['within_tolerance']}/{cv['points_on_curves']} within, mean |Δ| {bm._dex(cv['mean_abs_error'])}, "
                f"{cv['beyond_curve_ends']} beyond the ends"
            )
    print(f"Report: {out / 'report.md'}")


if __name__ == "__main__":
    main()
