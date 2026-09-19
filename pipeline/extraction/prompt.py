"""Builds the system prompt + user content for one paper's extraction call."""

from __future__ import annotations

from pathlib import Path

from pipeline.extraction.llm_client.base import ExtractionRequest, ImageInput
from pipeline.extraction.schema import _FLOAT_COLUMNS
from pipeline.parsing.manifest_schema import ParseManifest
from pipeline.schema_columns import REPORTED_COLUMNS

SYSTEM_PROMPT_TEMPLATE = """\
You are extracting structured experimental data from a polymer-electrolyte \
research paper for a materials-science dataset. You are given the paper's \
full text (converted from PDF to markdown, including tables) and every \
figure/chart image found in the paper.

## Task

Identify every distinct FORMULATION reported in the paper. A formulation is \
one specific combination of polymer + salt (anion) + salt concentration \
(and, for copolymers, comonomer ratio). Papers commonly report several \
formulations -- e.g. the same polymer at multiple salt loadings, or several \
different anions. Return one record per formulation.

For each formulation, fill in as many of the following fields as the paper \
actually reports. Field names below match the target schema exactly.

{field_guide}

## Rules

- If a value is not stated anywhere in the paper (text, tables, or \
figures), leave the field null. Do not guess or estimate.
- If a value is ONLY available by reading it off a compressed, overlapping, \
or otherwise ambiguous plot (e.g. multiple curves crossing on a log-log \
Arrhenius plot), leave the numeric field null and explain why in the \
corresponding notes field (e.g. "Notes", "VFT Notes (above temp)"), the \
same way a human curator would. Do not fabricate a value you can't read \
confidently.
- When a value comes from a figure, mention which figure in the relevant \
notes field (e.g. "read from Fig. 3 DSC curve") so it can be spot-checked \
later.
- `SMILES descriptor 1`/`SMILES descriptor 2` are for the polymer/comonomer \
repeat unit structure; do not fill in `Anion Smiles` -- that is looked up \
separately from a fixed table once `Anion` is identified.
- Numeric fields are plain numbers (no units, no "~", no ranges -- if the \
paper gives a range, use the midpoint and note the range in the relevant \
notes field).
"""


def _field_guide() -> str:
    lines = []
    for column in REPORTED_COLUMNS:
        if column == "Anion Smiles":
            continue  # filled by lookup table downstream, not by the LLM
        kind = "number" if column in _FLOAT_COLUMNS else "text"
        lines.append(f"- `{column}` ({kind})")
    return "\n".join(lines)


def build_system_prompt() -> str:
    return SYSTEM_PROMPT_TEMPLATE.format(field_guide=_field_guide())


def build_extraction_request(manifest: ParseManifest, paper_dir: Path) -> ExtractionRequest:
    content_md = (paper_dir / manifest.content_md_path).read_text(encoding="utf-8")
    images = [
        ImageInput(
            path=paper_dir / fig.image_path,
            media_type="image/png",
            label=f"Figure (page {fig.page}, block {fig.block}):",
        )
        for fig in manifest.figures
    ]
    return ExtractionRequest(
        paper_id=manifest.paper_id,
        system_prompt=build_system_prompt(),
        text_content=content_md,
        images=images,
    )
