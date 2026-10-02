"""Score molecular-weight extractions of balke1973.pdf against its Tables XII-XVIII.

    python3 score_mw.py mw_mineru.csv mw_pdf.csv

The answer key is MinerU's transcription of Tables XII-XVIII ("Infinite-Resolution Molecular
Weight Averages", output/parsed/fcac8200/content.md): one table per condition, one row per GPC
reading, several readings per sample. P(∞) is Mw/Mn. A run's point counts as one row when its
time matches and its Mn matches to the table's 3 significant figures; then each feature is
checked on its own. "×10−5" columns are scored at whichever scale the run used, reported.
"""

import csv
import re
import sys
from pathlib import Path

from score_runs import answer_key as conversion_key
from score_runs import condition_of

PARSED = Path(__file__).resolve().parents[3] / "output" / "parsed" / "fcac8200" / "content.md"
TABLES = {"XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII"}
FEATURES = {"Mn×10−5": "mn", "Mw×10−5": "mw", "Mz×10−5": "mz", "Mz+1×10−5": "mz1", "PDI": "p"}


def number(cell: str) -> float:
    # MinerU dropped one decimal point here too: 26D's Mz+1 reads "3 30E + 06" for 3.30E + 06.
    cell = re.sub(r"^(\d) (\d+)E", r"\1.\2E", cell.strip())
    return float(cell.replace(" ", "").replace("E+", "E"))


def answer_key() -> dict[tuple[float, float], list[dict]]:
    # A sample's time as the conversion tables resolve it: 16H's unit-less "46.5" is 46.5 hr there.
    resolved = {r["sample"]: r["time"] for rows in conversion_key().values() for r in rows}
    key, rows, table = {}, [], None
    for line in PARSED.read_text(encoding="utf-8").splitlines():
        caption = re.match(r"\s*TABLE\s+([IVXL]+)\b", line)
        if caption:
            table = caption.group(1) if caption.group(1) in TABLES else None
            continue
        if table is None:
            continue
        if "<table>" in line:
            cells_per_row = [[re.sub(r"<[^>]+>", "", c).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", r)]
                             for r in re.findall(r"<tr>(.*?)</tr>", line)]
        elif line.startswith("|") and not line.startswith("| ---"):
            cells_per_row = [[c.strip() for c in line.strip().strip("|").split("|")]]
        else:
            cells_per_row = [[line]]
        for cells in cells_per_row:
            condition = re.search(r"T\s*=\s*([\d.]+)\s*°\s*C\s*;\s*AIBN\s*=\s*([\d.]+)\s*wt", " ".join(cells))
            if condition:
                key[(float(condition.group(1)), float(condition.group(2)))] = rows
                rows, table = [], None
                break
            if len(cells) < 10 or not re.fullmatch(r"\d+[A-Z]", cells[0]):
                continue
            # MinerU dropped one decimal point: Table XVII's 23E reads "7 0" (Table X has it at 7.0 min).
            t = re.fullmatch(r"(\d*\.?\d*)\s*(hr)?", re.sub(r"^(\d+) (\d)$", r"\1.\2", cells[1]))
            time = float(t.group(1)) * (60 if t.group(2) else 1)
            if cells[0] in resolved and abs(resolved[cells[0]] - time * 60) < 0.1:
                time = resolved[cells[0]]
            rows.append({"sample": cells[0], "time": time,
                         "printed": cells[1], "gpc": cells[3], "mn": number(cells[5]), "mw": number(cells[6]),
                         "mz": number(cells[7]), "mz1": number(cells[8]), "p": float(cells[9])})
    return key


def close(a: float | None, b: float, rel: float = 0.006) -> bool:
    return a is not None and abs(a - b) <= rel * abs(b) + 1e-12


def score(path: Path, key, quiet: bool = False) -> dict:
    with open(path, newline="", encoding="utf-8") as f:
        points = [r for r in csv.DictReader(f)]
    def val(r, k):
        return float(r[k]) if r.get(k) not in (None, "") else None
    # Which scale the run used for the "×10−5" columns: compare with the key's Mn values.
    mns = [val(r, "Mn×10−5") for r in points if val(r, "Mn×10−5")]
    scale = 1e5 if mns and sorted(mns)[len(mns) // 2] < 100 else 1.0
    total = sum(map(len, key.values()))
    used = {c: [False] * len(rows) for c, rows in key.items()}
    matched, unmatched, unknown = 0, [], []
    right = {k: 0 for k in FEATURES}
    wrong = {k: [] for k in FEATURES}
    for r in points:
        c = condition_of(r["sample"])
        if c not in key:
            unknown.append((r["sample"], r["Time (min)"]))
            continue
        t, mn = val(r, "Time (min)"), val(r, "Mn×10−5")
        rows = key[c]
        hit = next((i for i, row in enumerate(rows) if not used[c][i] and t is not None and abs(row["time"] - t) < 0.051
                    and mn is not None and close(mn * scale, row["mn"])), None)
        if hit is None:
            unmatched.append((r["sample"], t, mn))
            continue
        used[c][hit] = True
        matched += 1
        row = rows[hit]
        for feature, field in FEATURES.items():
            v = val(r, feature)
            v = v * scale if (v is not None and field != "p") else v
            if close(v, row[field]):
                right[feature] += 1
            else:
                wrong[feature].append((row["sample"], row["gpc"], f"paper {row[field]:g}", f"extracted {r[feature] or 'blank'}"))
    missed = [(c, row["sample"], row["gpc"], row["printed"]) for c, flags in used.items() for row, u in zip(key[c], flags) if not u]
    result = {"matched": matched, "values_right": sum(right.values()), "wrong": wrong, "unmatched": unmatched, "missed": missed}
    if quiet:
        return result
    print(f"\n{path.name}: {len(points)} points; ×10−5 columns given as {'Mn/10^5 (e.g. 4.52)' if scale == 1e5 else 'full values (e.g. 452000)'}")
    print(f"  matched to a table row (same time and Mn): {matched} of {total} rows; not in the tables: {len(unmatched)}; unknown sample: {len(unknown)}; rows missed: {len(missed)}")
    for feature in FEATURES:
        print(f"  {feature:10s} right in {right[feature]:3d} of {matched} matched rows" + (f"; wrong e.g. {wrong[feature][:3]}" if wrong[feature] else ""))
    for label, items in (("not in the tables", unmatched), ("unknown sample", unknown), ("rows missed", missed)):
        if items:
            print(f"  {label}: {items[:8]}{' ...' if len(items) > 8 else ''}")
    return result


if __name__ == "__main__":
    key = answer_key()
    print("Answer key:", {f"{c[0]:g}°C {c[1]:g} wt-%": len(rows) for c, rows in key.items()},
          "=", sum(map(len, key.values())), "GPC readings")
    for p in sys.argv[1:]:
        score(Path(p), key)
