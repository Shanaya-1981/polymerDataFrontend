"""Derive a stable paper_id from a papers/*.pdf filename.

Filenames look like:
    0a011d54-tominaga2012.pdf
    e1406878-10.1016@j.electacta.2016.12.172.pdf

In both cases the 8-hex-char hash before the *first* hyphen is the id --
splitting on the first hyphen only (not all hyphens) matters because the
DOI-based filenames contain further hyphens after the hash.
"""

from pathlib import Path


def paper_id_from_path(pdf_path: Path | str) -> str:
    stem = Path(pdf_path).stem
    paper_id, _, _rest = stem.partition("-")
    if not paper_id or _rest == "":
        raise ValueError(f"Filename does not match the '{{hash}}-{{rest}}' convention: {pdf_path}")
    return paper_id
