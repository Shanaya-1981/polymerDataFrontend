"""Turn comparison.csv + pairwise.csv into a readable SUMMARY.md.

Separate from the runner so the write-up can be regenerated, and its
wording or cut-offs changed, without re-parsing 20 documents.

Built around *divergence between modes*, not a single score. "advanced
found 52 numbers standard missed" shows the modes disagree and says where
to look; it is not evidence those 52 are correct, because a value only one
mode reports could equally be an OCR misread. So each section ends at a
file to open rather than a verdict to trust.

Run from the project root:
    .venv/bin/python -m pipeline.experiments.report
"""

from __future__ import annotations

import csv
import json
import statistics
from datetime import datetime, timezone
from pathlib import Path

from pipeline.experiments.run_tier_comparison import COMPARISON_CSV, MODES, PAIRWISE_CSV
from pipeline.experiments.select_sample import EXPERIMENT_ROOT, load_sample

SUMMARY_MD = EXPERIMENT_ROOT / "SUMMARY.md"

_INT_COLS = {"year", "pages", "wait_retries", "chars", "tables", "table_rows", "table_numbers",
             "chart_rows", "concat_cells", "figures", "figures_captioned", "display_formulas",
             "numbers_only_in_a", "numbers_only_in_b"}
_FLOAT_COLS = {"parse_seconds", "measured_seconds", "text_similarity"}


def _load(path: Path) -> list[dict]:
    rows = []
    for r in csv.DictReader(open(path)):
        for k, v in list(r.items()):
            if v in ("", None):
                r[k] = None
            elif k in _INT_COLS:
                r[k] = int(float(v))
            elif k in _FLOAT_COLS:
                r[k] = float(v)
        rows.append(r)
    return rows


def _md_table(headers: list[str], rows: list[list]) -> str:
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    out += ["| " + " | ".join("" if c is None else str(c) for c in r) + " |" for r in rows]
    return "\n".join(out)


def _total(rows: list[dict], mode: str, key: str) -> int | float:
    vals = [r[key] for r in rows if r["mode"] == mode and r.get(key) is not None]
    return round(sum(vals), 1) if vals else 0


def _side_by_side(rows: list[dict], label: str) -> str:
    """Metric-per-row, mode-per-column -- the actual three-way view."""
    printed = {m: _total(rows, m, "table_rows") - _total(rows, m, "chart_rows") for m in MODES}
    spec = [
        ("Parse time (s, total)", lambda m: _total(rows, m, "parse_seconds")),
        ("Characters", lambda m: _total(rows, m, "chars")),
        ("Tables", lambda m: _total(rows, m, "tables")),
        ("Table rows", lambda m: _total(rows, m, "table_rows")),
        ("&nbsp;&nbsp;of which digitised from plots", lambda m: _total(rows, m, "chart_rows")),
        ("&nbsp;&nbsp;of which printed in the paper", lambda m: printed[m]),
        ("Numbers inside tables", lambda m: _total(rows, m, "table_numbers")),
        ("Flattened cells (data destroyed)", lambda m: _total(rows, m, "concat_cells")),
        ("Figure crops", lambda m: _total(rows, m, "figures")),
        ("&nbsp;&nbsp;with a caption", lambda m: _total(rows, m, "figures_captioned")),
    ]
    body = [[name] + [fn(m) for m in MODES] for name, fn in spec]
    return f"**{label}**\n\n" + _md_table(["Metric", *MODES], body) + "\n"


def build_report() -> str:
    sample = load_sample()
    rows = [r for r in _load(COMPARISON_CSV) if r["status"] == "ok"]
    pairs = _load(PAIRWISE_CSV)
    failed = [r for r in _load(COMPARISON_CSV) if r["status"] != "ok"]
    papers = sorted({r["paper_id"] for r in rows})

    L: list[str] = []
    L.append("# MinerU parsing modes compared: standard vs advanced vs hybrid\n")
    L.append(f"*Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} by "
             f"`pipeline/experiments/report.py`. Regenerate with "
             f"`.venv/bin/python -m pipeline.experiments.report`.*\n")

    L.append("## Method\n")
    L.append(
        f"- **Modes**: `standard` and `advanced` are MinerU tiers. `hybrid` is advanced's text and "
        f"tables plus figure crops from *both* tiers.\n"
        f"- **Sample**: {len(sample['papers'])} papers pinned in `sample.json` (seed "
        f"`{sample['seed']}`), stratified {sample['strata']['old']['sampled']} old "
        f"({sample['strata']['old']['definition']}, {sample['strata']['old']['population']} in corpus) "
        f"+ {sample['strata']['modern']['sampled']} modern "
        f"({sample['strata']['modern']['definition']}, {sample['strata']['modern']['population']} in "
        f"corpus). Reused by every experiment so results stay comparable.\n"
        "- **Both tiers forced** (`mineru parse --force`); MinerU caches by file sha256, so an "
        "unforced re-parse replays cache and reports a fictional ~0s.\n"
        "- **Tier order alternates** per paper, so a warm-up advantage shows up in the data instead "
        "of silently favouring one tier.\n"
        "- **`hybrid` is composed, not re-parsed.** It is by definition the two parses above "
        "combined, so re-forcing would repeat the same work to measure a duration already known to "
        "be their sum. Its `parse_seconds` is that sum (its true cost); `measured_seconds` in the "
        "CSV shows what the cache-backed composition actually took.\n"
    )
    L.append(
        "> **Read the text columns with this in mind:** hybrid's body text *is* advanced's body "
        "text, by construction. Every character, table and number metric below is therefore "
        "identical for those two by design, not by measurement. The only place hybrid can differ "
        "is figures — which is the entire point of it.\n"
    )
    if failed:
        L.append(f"> **{len(failed)} paper(s) failed** — see the `error` column in `comparison.csv`.\n")

    L.append("## Three-way totals\n")
    L.append(_side_by_side(rows, f"All {len(papers)} papers"))
    for stratum, title in (("old", "Old papers (<1995)"), ("modern", "Modern papers (>=1995)")):
        sel = [r for r in rows if r["stratum"] == stratum]
        if sel:
            L.append(_side_by_side(sel, f"{title} — {len({r['paper_id'] for r in sel})} papers"))

    L.append("## What each mode is actually for\n")
    std_f, adv_f, hyb_f = (_total(rows, m, "figures") for m in MODES)
    std_c, adv_c = _total(rows, "standard", "concat_cells"), _total(rows, "advanced", "concat_cells")
    adv_chart = _total(rows, "advanced", "chart_rows")
    L.append(
        f"- **`standard`** keeps charts as images: {std_f} crops, the most of any mode. But it "
        f"flattens complex tables — {std_c} cells of run-together digits, where `advanced` has "
        f"{adv_c} — and that destroys the values outright.\n"
        f"- **`advanced`** recovers those tables, and additionally reads {adv_chart} rows of data "
        f"off plots. But having digitised a chart it emits no crop for it: {adv_f} crops versus "
        f"standard's {std_f}. When a digitisation is wrong there is no image left to catch it.\n"
        f"- **`hybrid`** takes advanced's text and keeps {hyb_f} crops — every image either tier "
        f"found. The digitised values and the plot they came from are both in front of the model.\n"
    )

    L.append("## Per-paper\n")
    by_paper: dict[str, dict[str, dict]] = {}
    for r in rows:
        by_paper.setdefault(r["paper_id"], {})[r["mode"]] = r
    meta = {r["paper_id"]: r for r in rows}
    per = []
    for pid in sorted(papers, key=lambda p: (meta[p]["stratum"], meta[p]["year"])):
        m = by_paper[pid]
        cell = lambda key: " / ".join(str(m[x][key]) if x in m else "-" for x in MODES)
        per.append([pid, meta[pid]["stratum"], meta[pid]["year"], meta[pid]["pages"],
                    cell("tables"), cell("table_numbers"), cell("concat_cells"), cell("figures")])
    L.append("Each cell is `standard / advanced / hybrid`.\n")
    L.append(_md_table(["paper", "stratum", "year", "pp", "tables", "numbers in tables",
                        "flattened cells", "figure crops"], per) + "\n")

    L.append("## Figure coverage — where hybrid earns its keep\n")
    L.append("Crops `advanced` discards because it digitised the chart instead, and `hybrid` keeps:\n")
    fig_rows = []
    for pid in sorted(papers, key=lambda p: -(by_paper[p]["standard"]["figures"]
                                              - by_paper[p]["advanced"]["figures"])):
        m = by_paper[pid]
        lost = m["standard"]["figures"] - m["advanced"]["figures"]
        risk = ("advanced kept no image at all" if m["advanced"]["figures"] == 0
                and m["advanced"]["chart_rows"] else "")
        fig_rows.append([pid, m["standard"]["figures"], m["advanced"]["figures"],
                         m["hybrid"]["figures"], lost, m["advanced"]["chart_rows"], risk])
    L.append(_md_table(["paper", "standard", "advanced", "hybrid", "crops advanced dropped",
                        "rows it digitised", "note"], fig_rows) + "\n")

    L.append("## How much of the table data is estimated?\n")
    adv_rows_t = _total(rows, "advanced", "table_rows")
    share = round(adv_chart / adv_rows_t * 100) if adv_rows_t else 0
    L.append(
        f"**{share}% of `advanced`'s table rows ({adv_chart} of {adv_rows_t}) are digitised plots, "
        f"not printed tables** — points read off a figure and marked `~`. `standard` produces "
        f"{_total(rows, 'standard', 'chart_rows')} such rows; it leaves charts as images.\n\n"
        "This cuts both ways, and it is the main qualification on every number above.\n\n"
        "- It is real new capability: a conductivity-vs-temperature plot is often the *only* place "
        "a paper reports those values.\n"
        "- It is also **estimated** data with no quality signal beyond the `~` marker, and it can be "
        "badly wrong. A hand-check of one paper found a 246-row digitised Arrhenius plot with a "
        "misread axis — `1000/T` spanning 27.3-100 (i.e. T = 10-37 K) and `log sigma` up to +3.4 "
        "S/cm, a conductivity better than copper — sitting alongside *correctly* digitised tables "
        "in the same document.\n\n"
        "This is the argument for `hybrid`: it is the only mode where a wrong digitisation can "
        "still be caught, because the plot is attached too.\n"
    )

    L.append("## Agreement between modes\n")
    L.append("Text similarity is 0-100 after stripping image links and markup.\n")
    pair_rows = []
    for a, b in (("standard", "advanced"), ("advanced", "hybrid"), ("standard", "hybrid")):
        sel = [p for p in pairs if p["mode_a"] == a and p["mode_b"] == b]
        if sel:
            pair_rows.append([f"{a} vs {b}",
                              round(statistics.median(p["text_similarity"] for p in sel), 1),
                              sum(p["numbers_only_in_a"] for p in sel),
                              sum(p["numbers_only_in_b"] for p in sel)])
    L.append(_md_table(["pair", "median text similarity", "values only in the first",
                        "values only in the second"], pair_rows) + "\n")

    L.append("## Spot-check these\n")
    L.append("Values found by only one tier. Open the PDF and confirm which is right — this is the "
             "check the numbers above cannot do for you.\n")
    gain = sorted(papers, key=lambda p: -(by_paper[p]["advanced"]["table_numbers"]
                                          - by_paper[p]["standard"]["table_numbers"]))
    for pid in gain[:3]:
        stem = Path(by_paper[pid]["standard"]["filename"]).stem
        diff_path = EXPERIMENT_ROOT / stem / "number_diff.json"
        if not diff_path.exists():
            continue
        d = json.loads(diff_path.read_text())
        L.append(f"**`{stem}`**\n")
        L.append(f"- only in `advanced` ({len(d['only_in_advanced'])}): "
                 f"{', '.join('`' + v + '`' for v in d['only_in_advanced'][:10]) or '_none_'}")
        L.append(f"- only in `standard` ({len(d['only_in_standard'])}): "
                 f"{', '.join('`' + v + '`' for v in d['only_in_standard'][:10]) or '_none_'}")
        L.append(f"- `diff {EXPERIMENT_ROOT}/{stem}/standard/content.md "
                 f"{EXPERIMENT_ROOT}/{stem}/advanced/content.md`\n")

    L.append("## Caveats\n")
    L.append(
        "- The sample over-weights old papers (5 of 18) against modern ones (5 of 45), by design. "
        "Read the per-stratum tables; the pooled one is not a corpus-wide average.\n"
        "- Timings are wall-clock on one machine with a warm local MinerU server, one run per "
        "paper/mode — an order-of-magnitude cost ratio, not a benchmark.\n"
        "- Counts are regex measurements of the markdown: they measure what MinerU *emitted*, not "
        "whether it was emitted correctly.\n"
        "- No ground truth is involved. Accuracy against `data/_Cleaned_Final_Data_6_2_2020.csv` is "
        "the evaluation harness's job; this only compares the modes to each other.\n"
    )
    return "\n".join(L)


def main() -> None:
    SUMMARY_MD.write_text(build_report())
    print(f"Wrote {SUMMARY_MD}")


if __name__ == "__main__":
    main()
