"""Redraw the X_p panel of reference.png from an extraction of balke1973.pdf.

    uv run --with matplotlib --with numpy python plot_xp.py               # the server's run, as circles
    uv run --with matplotlib --with numpy python plot_xp.py --marker x    # ... as crosses
    uv run --with matplotlib --with numpy python plot_xp.py --run balke1973-pdf.json --name "PDF sent directly"

Writes xp_comparison.png (xp_comparison_crosses.png with --marker x; another run's
file name gets its own suffix, e.g. xp_comparison_triangles_balke1973-pdf.png):
the reference panel, the extracted points on the same axes and colors, and the
extracted points drawn over the reference.
"""

import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.image as mpimg
import matplotlib.pyplot as plt
from matplotlib.colors import to_rgb
import numpy as np

from score_runs import condition_of

HERE = Path(__file__).parent
RUN = HERE / "extract-page-run-cf1a75e3.json"  # the Extract page's run (job cf1a75e3), copied from output/extractions/

# (temperature °C, AIBN wt-%) -> the reference's legend label and color (matplotlib's default
# cycle, in its order). Samples are matched by the condition their name gives, since each run
# names them its own way. The 90 °C run with no AIBN isn't in the reference, so it's left out.
SERIES = [
    ((50.0, 0.3), "50°C, AIBN 3.0 wt-‰", "tab:blue"),
    ((50.0, 0.391), "50°C, AIBN 3.9 wt-‰", "tab:orange"),
    ((50.0, 0.5), "50°C, AIBN 5.0 wt-‰", "tab:green"),
    ((70.0, 0.3), "70°C, AIBN 3.0 wt-‰", "tab:red"),
    ((70.0, 0.5), "70°C, AIBN 5.0 wt-‰", "tab:purple"),
    ((90.0, 0.3), "90°C, AIBN 3.0 wt-‰", "tab:brown"),
    ((90.0, 0.5), "90°C, AIBN 5.0 wt-‰", "tab:pink"),
]

# The reference's X_p panel, measured on reference.png: its frame in pixels, and where
# 10^3 s and X_p = 0 and 1 fall. 172 px per decade puts its first and last points at
# 5 and 460 min, the paper's shortest and longest tabulated times.
FRAME = dict(left=80, right=475, top=221, bottom=614)
X_1E3, PX_PER_DECADE = 200, 172
Y_0, Y_1 = 610.5, 228.5


def to_px(seconds, xp):
    return X_1E3 + PX_PER_DECADE * (np.log10(seconds) - 3), Y_0 + (Y_1 - Y_0) * np.asarray(xp)


def from_px_x(px):
    return 10 ** (3 + (px - X_1E3) / PX_PER_DECADE)


def from_px_y(px):
    return (px - Y_0) / (Y_1 - Y_0)


XLIM = (from_px_x(FRAME["left"]), from_px_x(FRAME["right"]))
YLIM = (from_px_y(FRAME["bottom"]), from_px_y(FRAME["top"]))

# Matplotlib marker -> how the titles name it, and the output file's suffix.
SHAPES = {"o": "rings", "x": "crosses", "+": "plus signs", "D": "diamonds", "^": "triangles", "s": "squares"}
ap = argparse.ArgumentParser()
ap.add_argument("--marker", default="o", choices=SHAPES, help="shape for the extracted points (default: o, circles)")
ap.add_argument("--run", type=Path, default=RUN, help="saved extraction to plot (default: the server's run)")
ap.add_argument("--name", default="MinerU text + figures", help="how the middle panel's title names the run")
args = ap.parse_args() if __name__ == "__main__" else ap.parse_args([])
MARKER = args.marker
LINE_MARKER = MARKER in ("x", "+")  # drawn as strokes, with no inside to fill
DEFAULT_RUN = args.run.resolve() == RUN.resolve()
OUT = HERE / ("xp_comparison"
              + ("" if MARKER == "o" else f"_{SHAPES[MARKER].replace(' ', '_')}")
              + ("" if DEFAULT_RUN else f"_{args.run.stem}") + ".png")

samples = json.loads(args.run.read_text(encoding="utf-8"))["samples"]
reference = mpimg.imread(HERE / "reference.png")[..., :3]
crop = dict(x0=0, x1=500, y0=190, y1=665)
panel = reference[crop["y0"] : crop["y1"], crop["x0"] : crop["x1"]]

fig, (ax_ref, ax_ours, ax_over) = plt.subplots(1, 3, figsize=(16, 5.6), dpi=150)

ax_ref.imshow(panel)
ax_ref.set_title("Reference figure", fontsize=12)
ax_ref.axis("off")

shown = hidden = 0
for condition, label, color in SERIES:
    points = [p for name, pts in samples.items() if condition_of(name) == condition for p in pts]
    t = np.array([p["Time (min)"] * 60 for p in points], dtype=float)
    xp = np.array([p["Cov Exp"] for p in points], dtype=float)
    inside = (t >= XLIM[0]) & (t <= XLIM[1])
    shown += inside.sum()
    hidden += (~inside).sum()
    px, py = to_px(t[inside], xp[inside])
    # The overlay draws each point in its sample's color, a shade darker so it stands out
    # from the reference's paler, see-through dot of the same color underneath.
    edge = tuple(0.72 * c for c in to_rgb(color))
    if LINE_MARKER:
        ax_ours.scatter(t[inside], xp[inside], s=34, marker=MARKER, color=color, alpha=0.9, linewidths=1.4, label=label)
        ax_over.scatter(px - crop["x0"], py - crop["y0"], s=34, marker=MARKER, color=edge, linewidths=1.2)
    else:
        # Other filled shapes cover less area than a circle of the same size, so draw them bigger.
        size, alpha = (28, 0.65) if MARKER == "o" else (42, 0.8)
        ax_ours.scatter(t[inside], xp[inside], s=size, marker=MARKER, color=color, alpha=alpha, linewidths=0, label=label)
        ax_over.scatter(px - crop["x0"], py - crop["y0"], s=44, marker=MARKER, facecolors="none", edgecolors=edge, linewidths=1.2)

ax_ours.set_xscale("log")
ax_ours.set_xlim(*XLIM)
ax_ours.set_ylim(*YLIM)
ax_ours.set_yticks(np.arange(0, 1.01, 0.2))
ax_ours.set_xlabel("Time (sec)", fontsize=13)
ax_ours.set_ylabel("$X_p$", fontsize=16)
ax_ours.tick_params(labelsize=11)
ax_ours.set_title(f"Extracted, {args.name} ({SHAPES[MARKER]}, same axes)", fontsize=12)

ax_over.imshow(panel)
# The one reference dot no extracted point explains: Table VII's sample 16H (70 °C, 0.3 wt-%),
# printed "46.5" with no unit. The extraction reads it as 46.5 hr, off this axis to the right.
odd_x, odd_y = 16200, 0.958
px, py = to_px(odd_x, odd_y)
ax_over.scatter(px - crop["x0"], py - crop["y0"], s=420, facecolors="none", edgecolors="black", linewidths=1.2, linestyle="--")
ax_over.set_title(f"Extracted points ({SHAPES[MARKER]}) over the reference", fontsize=12)
ax_over.axis("off")

handles, labels = ax_ours.get_legend_handles_labels()
fig.legend(handles, labels, loc="upper center", ncol=7, fontsize=10, frameon=False, markerscale=1.4)
fig.tight_layout(rect=(0, 0, 1, 0.92))
# Placed after the layout, so it doesn't shrink the panels.
box = ax_over.get_position()
fig.text(
    (box.x0 + box.x1) / 2, box.y0 - 0.01,
    "Dashed circle: the one reference dot with no extracted point under it. It is Table VII's sample 16H,\n"
    "which the paper prints as \"46.5\" with no unit; the extraction reads 46.5 hr, off this axis to the right.",
    ha="center", va="top", fontsize=9,
)
fig.savefig(OUT, bbox_inches="tight")
print(f"{OUT.name}: {shown} points inside the reference's time range, {hidden} beyond it; x {XLIM[0]:.0f}-{XLIM[1]:.0f} s, y {YLIM[0]:.3f}-{YLIM[1]:.3f}")
