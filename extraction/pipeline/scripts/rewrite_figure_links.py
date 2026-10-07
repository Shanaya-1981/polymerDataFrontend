"""Backfill renderable figure links into already-parsed content.md files.

MinerU's inline figure marker points at an internal locator
(`doc:9c87b64/tier:standard/page:4/block:3`) that resolves to nothing --
not in a markdown viewer, not for the LLM. `parse_paper` now rewrites those
to real relative paths at write time, but parses made before that change
still carry the old form.

Everything needed for the rewrite is already on disk in each paper's
manifest.json, so this is a pure text fix -- no MinerU re-run, no re-parse
cost. Idempotent: running it twice changes nothing the second time.

Run from the project root:
    .venv/bin/python -m pipeline.scripts.rewrite_figure_links
    .venv/bin/python -m pipeline.scripts.rewrite_figure_links --dry-run
"""

from __future__ import annotations

import argparse
from pathlib import Path

from pipeline.parsing.figure_links import rewrite_to_local_paths
from pipeline.parsing.manifest_schema import ParseManifest

DEFAULT_ROOTS = [Path("output/parsed"), Path("experiments")]


def rewrite_tree(root: Path, dry_run: bool) -> tuple[int, int]:
    """Returns (files scanned, files changed)."""
    scanned = changed = 0
    for manifest_path in sorted(root.rglob("manifest.json")):
        paper_dir = manifest_path.parent
        manifest = ParseManifest.model_validate_json(manifest_path.read_text())
        content_path = paper_dir / manifest.content_md_path
        if not content_path.exists():
            print(f"  ! {content_path} missing, skipping")
            continue

        scanned += 1
        before = content_path.read_text(encoding="utf-8")
        after = rewrite_to_local_paths(before, manifest.figures)
        if after == before:
            continue

        changed += 1
        rel = content_path.relative_to(root)
        print(f"  {'would rewrite' if dry_run else 'rewrote'} {rel} ({len(manifest.figures)} figures)")
        if not dry_run:
            content_path.write_text(after, encoding="utf-8")
    return scanned, changed


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m pipeline.scripts.rewrite_figure_links")
    ap.add_argument("roots", nargs="*", type=Path, default=None,
                    help=f"Directories to walk (default: {' '.join(str(r) for r in DEFAULT_ROOTS)})")
    ap.add_argument("--dry-run", action="store_true", help="Report what would change without writing")
    args = ap.parse_args()

    total_scanned = total_changed = 0
    for root in args.roots or DEFAULT_ROOTS:
        if not root.exists():
            print(f"{root}/ does not exist, skipping")
            continue
        print(f"{root}/")
        scanned, changed = rewrite_tree(root, args.dry_run)
        total_scanned += scanned
        total_changed += changed

    verb = "would change" if args.dry_run else "changed"
    print(f"\n{total_scanned} content.md files scanned, {total_changed} {verb}")


if __name__ == "__main__":
    main()
