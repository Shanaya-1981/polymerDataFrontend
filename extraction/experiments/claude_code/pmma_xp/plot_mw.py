"""Redraw the Mn and Đ panels of reference.png from a molecular-weight extraction of balke1973.pdf.

    uv run --with matplotlib --with numpy python plot_mw.py --run mw_mineru.csv --name "MinerU text + figures"
    uv run --with matplotlib --with numpy python plot_mw.py --run mw_pdf.csv --name "PDF sent directly"

Writes mw_comparison_<run>.png: for Mn (top row) and Đ = Mw/Mn (bottom row), the reference
panel, the extracted values on the same axes and colors, and the extracted values over the
reference. The paper gives several GPC readings per sample; the reference plots one dot per
sample at their mean, so this plots each sample's mean (samples told apart by condition and time).
"""

import argparse
import csv
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.image as mpimg
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import to_rgb

from score_runs import condition_of

HERE = Path(__file__).parent

# As in plot_xp.py (importing it would run it): the reference's conditions, labels and colors,
# and its time axis on the Xp panel, 10^3 s at x 200 with 172 px per decade.
SERIES = [
    ((50.0, 0.3), "50°C, AIBN 3.0 wt-‰", "tab:blue"),
    ((50.0, 0.391), "50°C, AIBN 3.9 wt-‰", "tab:orange"),
    ((50.0, 0.5), "50°C, AIBN 5.0 wt-‰", "tab:green"),
    ((70.0, 0.3), "70°C, AIBN 3.0 wt-‰", "tab:red"),
    ((70.0, 0.5), "70°C, AIBN 5.0 wt-‰", "tab:purple"),
    ((90.0, 0.3), "90°C, AIBN 3.0 wt-‰", "tab:brown"),
    ((90.0, 0.5), "90°C, AIBN 5.0 wt-‰", "tab:pink"),
]
X_1E3, PX_PER_DECADE = 200, 172

# Measured on reference.png. All three panels share the time axis and the frame height
# (y 221-614); only the frame's left edge moves. Mn is log: 10^5 at y 479, 257 px per
# decade (its minor ticks at 2-5 x 10^4 and 10^5 confirm it). Đ is linear: 2.0 at y 584,
# 101.9 px per unit (ticks every 0.5 from 2.0 to 5.5).
FRAMES = {"mn": dict(left=551, right=946), "d": dict(left=1018, right=1413)}
TOP, BOTTOM, XP_LEFT = 221, 614, 80
CROPS = {"mn": (505, 960), "d": (975, 1428)}


def x_px(seconds, panel):
    return X_1E3 + (FRAMES[panel]["left"] - XP_LEFT) + PX_PER_DECADE * (np.log10(seconds) - 3)


def y_px(value, panel):
    if panel == "mn":
        return 479 - 257 * (np.log10(value) - 5)
    return 584 - 101.9 * (np.asarray(value) - 2.0)


def x_value(px, panel):
    return 10 ** (3 + (px - X_1E3 - (FRAMES[panel]["left"] - XP_LEFT)) / PX_PER_DECADE)


def y_value(px, panel):
    return 10 ** (5 + (479 - px) / 257) if panel == "mn" else 2.0 + (584 - px) / 101.9


ap = argparse.ArgumentParser()
ap.add_argument("--run", type=Path, required=True, help="CSV written by extract_features.py")
ap.add_argument("--name", required=True, help="how the titles name the run")
args = ap.parse_args()
out = HERE / f"mw_comparison_{args.run.stem}.png"

# Each sample's mean over its GPC readings: Mn in g/mol, and Đ.
readings = defaultdict(list)
with open(args.run, newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        condition = condition_of(r["sample"])
        if r["Mn×10−5"] and r["PDI"]:
            readings[(condition, float(r["Time (min)"]))].append((float(r["Mn×10−5"]) * 1e5, float(r["PDI"])))
means = {k: tuple(np.mean(v, axis=0)) for k, v in readings.items()}

reference = mpimg.imread(HERE / "reference.png")[..., :3]
fig, axes = plt.subplots(2, 3, figsize=(16, 10.5), dpi=150)
xlim = (x_value(FRAMES["mn"]["left"], "mn"), x_value(FRAMES["mn"]["right"], "mn"))
shown = beyond = 0
for row, (panel, ylabel) in enumerate((("mn", "$M_n$"), ("d", "Đ"))):
    ax_ref, ax_ours, ax_over = axes[row]
    x0, x1 = CROPS[panel]
    crop = reference[190:665, x0:x1]
    for ax in (ax_ref, ax_over):
        ax.imshow(crop)
        ax.axis("off")
    for condition, label, color in SERIES:
        pts = sorted((t * 60, v[0] if panel == "mn" else v[1]) for (c, t), v in means.items() if c == condition)
        t = np.array([p[0] for p in pts]); y = np.array([p[1] for p in pts])
        inside = (t >= xlim[0]) & (t <= xlim[1])
        if row == 0:
            shown += inside.sum(); beyond += (~inside).sum()
        ax_ours.scatter(t[inside], y[inside], s=60, marker="^", color=color, alpha=0.8, linewidths=0, label=label)
        edge = tuple(0.72 * c for c in to_rgb(color))
        ax_over.scatter(x_px(t[inside], panel) - x0, y_px(y[inside], panel) - 190, s=60, marker="^",
                        facecolors="none", edgecolors=edge, linewidths=1.2)
    ax_ours.set_xscale("log")
    ax_ours.set_xlim(*xlim)
    ax_ours.set_ylim(y_value(BOTTOM, panel), y_value(TOP, panel))
    if panel == "mn":
        ax_ours.set_yscale("log")
    else:
        ax_ours.set_yticks(np.arange(2.0, 5.51, 0.5))
    ax_ours.set_ylabel(ylabel, fontsize=16)
    ax_ours.set_xlabel("Time (sec)", fontsize=13)
    ax_ours.tick_params(labelsize=11)
    ax_ref.set_title(f"Reference figure, {'Mn' if panel == 'mn' else 'Đ'}", fontsize=12)
    ax_ours.set_title(f"Extracted, {args.name} (sample means)", fontsize=12)
    ax_over.set_title("Extracted (triangles) over the reference", fontsize=12)

handles, labels = axes[0][1].get_legend_handles_labels()
fig.legend(handles, labels, loc="upper center", ncol=7, fontsize=10, frameon=False, markerscale=1.2)
fig.tight_layout(rect=(0, 0, 1, 0.95))
fig.savefig(out, bbox_inches="tight")
print(f"{out.name}: {len(means)} samples; {shown} inside the reference's time range, {beyond} beyond it")
