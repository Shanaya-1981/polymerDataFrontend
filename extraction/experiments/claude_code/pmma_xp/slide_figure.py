"""One figure for the phase 1 slides: the extracted values (triangles) over the reference's
Xp, Mn and Đ panels, from the MinerU-route runs. Calibrations as in plot_xp.py and plot_mw.py.

    uv run --with matplotlib --with numpy python slide_figure.py      # writes slide_overlays.png
"""

import csv
import json
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.image as mpimg
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import to_rgb
from matplotlib.lines import Line2D

from score_runs import condition_of

HERE = Path(__file__).parent
XP_RUN = HERE / "extract-page-run-cf1a75e3.json"  # the Extract page's run (job cf1a75e3), copied from output/extractions/
MW_RUN = HERE / "mw_mineru.csv"
SERIES = [
    ((50.0, 0.3), "50°C, AIBN 3.0 wt-‰", "tab:blue"),
    ((50.0, 0.391), "50°C, AIBN 3.9 wt-‰", "tab:orange"),
    ((50.0, 0.5), "50°C, AIBN 5.0 wt-‰", "tab:green"),
    ((70.0, 0.3), "70°C, AIBN 3.0 wt-‰", "tab:red"),
    ((70.0, 0.5), "70°C, AIBN 5.0 wt-‰", "tab:purple"),
    ((90.0, 0.3), "90°C, AIBN 3.0 wt-‰", "tab:brown"),
    ((90.0, 0.5), "90°C, AIBN 5.0 wt-‰", "tab:pink"),
]
# Frames' left edges on reference.png; all share the time axis (10^3 s at 120 px past the
# left edge, 172 px per decade) and the frame height (y 221-614).
LEFT = {"xp": 80, "mn": 551, "d": 1018}
CROP = {"xp": (0, 490), "mn": (505, 960), "d": (975, 1428)}
TITLE = {"xp": "Conversion, $X_p$", "mn": "$M_n$ (g/mol)", "d": "Đ = $M_w/M_n$"}


def x_px(seconds, panel):
    return LEFT[panel] + 120 + 172 * (np.log10(seconds) - 3)


def y_px(value, panel):
    value = np.asarray(value, dtype=float)
    if panel == "xp":
        return 610.5 - 382 * value
    if panel == "mn":
        return 479 - 257 * (np.log10(value) - 5)
    return 584 - 101.9 * (value - 2.0)


t_max = 10 ** (3 + (475 - 200) / 172)  # the right edge of the time axis, about 39,700 s

# Xp: every point. Mn and Đ: each sample's mean over its GPC readings, as the reference plots them.
xp = defaultdict(list)
for name, points in json.loads(XP_RUN.read_text(encoding="utf-8"))["samples"].items():
    for p in points:
        xp[condition_of(name)].append((p["Time (min)"] * 60, p["Cov Exp"]))
readings = defaultdict(list)
with open(MW_RUN, newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        readings[(condition_of(r["sample"]), float(r["Time (min)"]))].append((float(r["Mn×10−5"]) * 1e5, float(r["PDI"])))
mw = defaultdict(list)
for (condition, minutes), values in readings.items():
    mn, d = np.mean(values, axis=0)
    mw[condition].append((minutes * 60, mn, d))

reference = mpimg.imread(HERE / "reference.png")[..., :3]
fig, axes = plt.subplots(1, 3, figsize=(15, 5.3), dpi=170)
for ax, panel in zip(axes, ("xp", "mn", "d")):
    x0, x1 = CROP[panel]
    ax.imshow(reference[205:665, x0:x1])
    ax.axis("off")
    ax.set_title(TITLE[panel], fontsize=19)
    for condition, _, color in SERIES:
        if panel == "xp":
            pts = [(t, v) for t, v in xp[condition]]
        else:
            pts = [(t, mn if panel == "mn" else d) for t, mn, d in mw[condition]]
        pts = [p for p in pts if p[0] <= t_max]
        t = np.array([p[0] for p in pts]); v = np.array([p[1] for p in pts])
        edge = tuple(0.72 * c for c in to_rgb(color))
        ax.scatter(x_px(t, panel) - x0, y_px(v, panel) - 205, s=46, marker="^", facecolors="none", edgecolors=edge, linewidths=1.3)

handles = [Line2D([], [], marker="o", ls="", color=c, alpha=0.6, markersize=11, label=l) for _, l, c in SERIES]
handles.append(Line2D([], [], marker="^", ls="", markerfacecolor="none", markeredgecolor="0.25", markersize=12, label="extracted"))
fig.legend(handles=handles, loc="lower center", ncol=4, fontsize=15, frameon=False, handletextpad=0.3, columnspacing=1.6)
fig.tight_layout(rect=(0, 0.14, 1, 1))
fig.savefig(HERE / "slide_overlays.png", bbox_inches="tight", facecolor="white")
print("slide_overlays.png written")
