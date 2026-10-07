"""Score extractions of balke1973.pdf against the paper's Tables IV-XI (time and conversion).

    python3 score_runs.py RUN.json [RUN.json ...]

The answer key is MinerU's transcription of Tables IV-XI (output/parsed/fcac8200/content.md),
spot-checked against the scan. Each table is one experimental condition, named in its footnote.
A time printed with "hr" is in hours. Two tables end with a long time printed with no unit
(138.2 in VI, 46.5 in VII); a last row whose time is below the row before it is taken as hours.
"""

import json
import re
import sys
from pathlib import Path

PARSED = Path(__file__).resolve().parents[3] / "output" / "parsed" / "fcac8200" / "content.md"
CONVERSION_TABLES = {"IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"}


def answer_key() -> dict[tuple[float, float], list[dict]]:
    """(temperature °C, AIBN wt-%) -> the table's rows: sample no., time in minutes, conversion."""
    key, rows, table, columns = {}, [], None, None
    for line in PARSED.read_text(encoding="utf-8").splitlines():
        caption = re.match(r"\s*TABLE\s+([IVXL]+)\b", line)
        if caption:
            table = caption.group(1) if caption.group(1) in CONVERSION_TABLES else None
            continue
        if table is None:
            continue
        condition = re.search(r"Reaction temperature = ([\d.]+)°C[;:] AIBN [Cc]oncn\. = ([\d.]+) wt", line)
        if condition:
            if rows and rows[-1]["time"] < rows[-2]["time"] and not rows[-1]["hours"]:
                rows[-1] = {**rows[-1], "time": rows[-1]["printed"] * 60, "hours": True, "unit_missing": True}
            key[(float(condition.group(1)), float(condition.group(2)))] = rows
            rows, table, columns = [], None, None
            continue
        if not line.startswith("|") or line.startswith("| ---"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if cells[0].startswith("Sample"):
            columns = {"time": next(i for i, c in enumerate(cells) if c.startswith("Time")),
                       "x": next(i for i, c in enumerate(cells) if "Exp" in c)}
            continue
        time = re.fullmatch(r"(\d*\.?\d*)\s*(hr)?", cells[columns["time"]])
        printed = float(time.group(1))
        rows.append({"sample": cells[0], "printed": printed, "hours": bool(time.group(2)),
                     "time": printed * 60 if time.group(2) else printed, "x": float(cells[columns["x"]])})
    return key


def condition_of(name: str) -> tuple[float, float] | None:
    """The (temperature, AIBN wt-%) a sample name describes, e.g. "PMMA bulk, 50°C, 0.3 wt-% AIBN"."""
    temp = re.search(r"(\d+(?:\.\d+)?)\s*°\s*C", name)
    if not temp:
        return None
    if re.search(r"thermal|no AIBN|without AIBN|0 wt|0\.0 wt|uninitiated", name, re.I):
        return float(temp.group(1)), 0.0
    aibn = re.search(r"(\d*\.?\d+)\s*(?:wt|%)", name)
    return (float(temp.group(1)), float(aibn.group(1))) if aibn else None


def score(run_path: Path, key) -> dict:
    samples = json.loads(run_path.read_text(encoding="utf-8"))["samples"]
    used = {c: [False] * len(rows) for c, rows in key.items()}
    out = {"exact": 0, "wrong_time": [], "wrong_x": [], "not_in_table": [], "unknown_sample": [], "points": 0}
    for name, points in samples.items():
        condition = condition_of(name)
        for p in points:
            out["points"] += 1
            t, x = p.get("Time (min)"), p.get("Cov Exp")
            if condition not in key:
                out["unknown_sample"].append((name, t, x))
                continue
            rows = key[condition]
            free = [i for i, r in enumerate(rows) if not used[condition][i]]
            same_x = [i for i in free if x is not None and abs(rows[i]["x"] - x) < 5e-5]
            same_t = [i for i in free if t is not None and abs(rows[i]["time"] - t) < 0.051]
            both = [i for i in same_x if i in same_t]
            if both:
                used[condition][both[0]] = True
                out["exact"] += 1
            elif same_x:
                used[condition][same_x[0]] = True
                r = rows[same_x[0]]
                out["wrong_time"].append((name, r["sample"], f"paper {r['printed']}{' hr' if r['hours'] else ''}", f"extracted {t} min", x))
            elif same_t:
                out["wrong_x"].append((name, t, f"extracted {x}", f"paper has {[rows[i]['x'] for i in same_t]}"))
            else:
                out["not_in_table"].append((name, t, x))
    out["missed"] = [(c, r["sample"], r["printed"], r["x"]) for c, flags in used.items() for r, u in zip(key[c], flags) if not u]
    return out


if __name__ == "__main__":
    key = answer_key()
    total = sum(map(len, key.values()))
    print(f"Answer key: {total} rows in {len(key)} tables; unit missing in print: "
          f"{[(c, r['sample'], r['printed']) for c, rows in key.items() for r in rows if r.get('unit_missing')]}")
    for path in map(Path, sys.argv[1:]):
        s = score(path, key)
        print(f"\n{path.name}: {s['points']} points returned")
        print(f"  exactly a table row (right condition, time and conversion): {s['exact']} of {total} rows")
        for kind in ("wrong_time", "wrong_x", "not_in_table", "unknown_sample", "missed"):
            print(f"  {kind.replace('_', ' ')}: {len(s[kind])}")
            for item in s[kind][:12]:
                print(f"      {item}")
            if len(s[kind]) > 12:
                print(f"      ... {len(s[kind]) - 12} more")
