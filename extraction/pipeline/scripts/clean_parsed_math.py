"""Backfill the markdown math fixes into already-parsed content.md files.

See pipeline/parsing/md_cleanup.py for what is fixed and why it matters.
`parse_paper` applies this at write time now; this script brings parses made
before that change up to date without re-running MinerU.

Every file is checked with `digits_unchanged` before being written: these
rewrites are presentational, so if a digit run moved or disappeared the
rewrite is wrong and the file is skipped and reported rather than saved.

Run from the project root:
    .venv/bin/python -m pipeline.scripts.clean_parsed_math --dry-run
    .venv/bin/python -m pipeline.scripts.clean_parsed_math
"""

from __future__ import annotations

import argparse
from pathlib import Path

from pipeline.parsing.md_cleanup import clean_markdown, digits_unchanged

DEFAULT_ROOTS = [Path("output/parsed"), Path("experiments")]


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m pipeline.scripts.clean_parsed_math")
    ap.add_argument("roots", nargs="*", type=Path, default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--no-degree-zero",
        action="store_true",
        help="Disable reading a superscript zero before C/F/K as a degree ring. "
             "That is the only rule here that infers meaning rather than respelling; "
             "turn it off for a corpus where the assumption may not hold.",
    )
    args = ap.parse_args()

    totals = {"files": 0, "changed": 0, "literal_dollars": 0, "degree_spans": 0,
              "text_mode_commands": 0}
    unsafe: list[Path] = []
    inferred: list[tuple[str, str, str]] = []

    for root in args.roots or DEFAULT_ROOTS:
        if not root.exists():
            continue
        for path in sorted(root.rglob("content.md")):
            totals["files"] += 1
            before = path.read_text(encoding="utf-8")
            after, stats = clean_markdown(before, recover_degree_as_zero=not args.no_degree_zero)
            if after == before:
                continue

            if not digits_unchanged(before, after):
                unsafe.append(path)
                continue

            totals["changed"] += 1
            totals["literal_dollars"] += stats["literal_dollars"]
            totals["degree_spans"] += stats["degree_spans"]
            totals["text_mode_commands"] += stats["text_mode_commands"]
            inferred += [(str(path), a, b) for a, b in stats["inferred_degrees"]]
            if not args.dry_run:
                path.write_text(after, encoding="utf-8")

    verb = "would change" if args.dry_run else "changed"
    print(f"{totals['files']} files scanned, {totals['changed']} {verb}")
    print(f"  literal dollars escaped: {totals['literal_dollars']}")
    print(f"  degree spans -> plain text: {totals['degree_spans']}")
    print(f"  text-mode commands fixed: {totals['text_mode_commands']}")

    # Printed in full, never summarised to a count: this is the one rule
    # that decides what the page meant, so every instance should be
    # reviewable by eye on a new corpus.
    print(f"\n  {len(inferred)} rewrite(s) inferred a degree ring from a superscript zero"
          + (" -- review these:" if inferred else ""))
    for path, before_tex, after_text in inferred:
        print(f"    {path}")
        print(f"      ${before_tex[:88]}$")
        print(f"      -> {after_text}")
    if unsafe:
        print(f"\n!! {len(unsafe)} file(s) SKIPPED -- rewrite would have altered a digit:")
        for p in unsafe:
            print(f"   {p}")
    else:
        print("  digit-preservation check: passed on every file")


if __name__ == "__main__":
    main()
