"""Builds the system prompt + user content for one paper's extraction call."""

from __future__ import annotations

from pathlib import Path

from pipeline.extraction.llm_client.base import ExtractionRequest, ImageInput
from pipeline.extraction.schema import _FLOAT_COLUMNS
from pipeline.parsing.figure_links import (
    prompt_anchor,
    rewrite_to_caption_anchors,
    rewrite_to_prompt_anchors,
)
from pipeline.parsing.manifest_schema import ParseManifest
from pipeline.schema_columns import REPORTED_COLUMNS

_INTRO_WITH_FIGURES = """\
You are extracting structured experimental data from a polymer-electrolyte \
research paper for a materials-science dataset. You are given the paper's \
full text (converted from PDF to markdown, including tables) and every \
figure/chart image found in the paper."""

_INTRO_TEXT_ONLY = """\
You are extracting structured experimental data from a polymer-electrolyte \
research paper for a materials-science dataset. You are given the paper's \
full text (converted from PDF to markdown, including tables). The figure \
images themselves are not provided; each figure's caption appears in the \
text where the figure was."""

_FIGURES_ATTACHED = """\
## How the figures are linked to the text

Wherever a figure appeared in the paper, the text contains an anchor like

    [FIGURE page4-block3 | attached image #1] "Figure 1. Ionic conductivity of ..."

The attached images follow the text in that same order, and each one is \
introduced by its own identical anchor line. So `attached image #1` is the \
image for the anchor that names it, positioned in the text exactly where \
that figure appeared in the paper. Use the anchor to tell which image \
belongs to which part of the discussion.

Some figures may be attached twice, as crops produced by two different \
parsers of the same page (the anchor keys will differ, e.g. \
`standard/page3-block7` and `advanced/page3-block7`). Treat those as the \
same underlying figure, and prefer whichever crop is more legible."""

_FIGURES_NOT_ATTACHED = """\
## Figures

Wherever a figure appeared in the paper, the text contains an anchor like

    [FIGURE page4-block3 | image not provided] "Figure 1. Ionic conductivity of ..."

You cannot see the image. Do not fill in a value that could only be read \
off a figure, unless it also appears in the text or in a table."""

_DIGITISED_TABLES = """\
Tables that appear in the text with values marked `~` were not printed in \
the paper -- they were estimated by reading data points off a plot, and can \
be wrong by large factors if the plot's axis was misread. Treat them as \
approximate, sanity-check them against {tables_check}, and prefer printed values \
whenever both exist."""

_TASK = """\
## Task

Identify every distinct FORMULATION reported in the paper. A formulation is \
one specific combination of polymer + salt (anion) + salt concentration \
(and, for copolymers, comonomer ratio). Papers commonly report several \
formulations -- e.g. the same polymer at multiple salt loadings, or several \
different anions. Return one record per formulation.

For each formulation, fill in as many of the following fields as the paper \
actually reports. Field names below match the target schema exactly. Where a \
unit is given, report the value in that unit.

{field_guide}"""

# The rules say "leave the field null" on purpose. An attempt to save output
# time by asking for empty fields to be *left out* ("never written as null")
# made Qwen3.5-4B write 0.0 instead: 374 fabricated conductivity zeros on
# 6ca669ae, where the null wording gave none (archived under
# experiments/local_llm/_superseded/). Explicit nulls are slow -- 56% of the
# characters on that paper -- but they are honest. Cutting them needs a
# sparser schema (e.g. conductivity as a list of measured points), not an
# instruction a small model reinterprets.
_RULES = """\
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
repeat unit structure -- a short fragment for one repeat unit (e.g. `COC` for \
PEO), never the whole chain; do not fill in `Anion Smiles` -- that is looked up \
separately from a fixed table once `Anion` is identified.
- Numeric fields are plain numbers (no units, no "~", no ranges -- if the \
paper gives a range, use the midpoint and note the range in the relevant \
notes field).
- Convert values into the unit shown in the field guide: e.g. mS/cm to S/cm \
(1.2 mS/cm = 0.0012), a temperature in K to °C, and a reported log10(σ) to σ.
- A `Conductivity at X C` field is for a measurement at that temperature. \
Convert K to °C and round to the nearest degree first (298 K -> 25, \
333 K -> 60). Do not interpolate between measured temperatures.
- Salt concentration: convert a ratio of functional groups to lithium, such \
as EO:Li = 20:1 or [O]/[Li] = 20, into `Li:functional group` (1/20 = 0.05). \
Do not calculate a molar ratio from a weight percentage -- if the paper \
gives wt%, report `salt wt%` and leave the ratio fields null unless the \
paper also states the ratio.
- A `~` table value is a plot reading, not a printed value, so the rule \
above about ambiguous plots still applies to it: use it only where it \
agrees with {rules_agree}, and say in the notes field \
that it came from a digitised plot. If it disagrees, or is \
physically implausible, leave the field null and say so -- these \
digitisations have been observed off by a factor of ten."""

# Unit or convention for every column whose name doesn't already carry it.
# Taken from the golden set's own values, which is what the output is scored
# against: temperatures are °C (Tg reaches -82.7; `VFT T0 (degC)` bottoms
# out at -273, i.e. 0 K) and conductivities are S/cm (1e-10 to 3e-3).
# Without these, a model that faithfully copies "1.2 mS/cm" or "Tg = 233 K"
# from the paper is scored wrong. Categorical vocabularies are the golden
# set's complete value lists; free-text examples are its commonest values.
_FIELD_NOTES: dict[str, str] = {
    "Polymer family": "backbone functional group(s), comma-separated, e.g. `ether`, `carbonate, ether`, `ester`",
    "Comonomer percentage": "mol% of the main repeat unit; 100 for a homopolymer",
    "Average functional group per monomer": "coordinating functional groups per repeat unit",
    "Anion": "the salt's anion only, without the lithium, e.g. `TFSI`, `ClO4`, `CF3SO3`, `BF4`, `PF6`",
    "Li:monomer": "moles of Li per mole of polymer repeat units",
    "Li:functional group": "moles of Li per mole of coordinating functional groups (ether O, carbonate, ester, ...); e.g. PEO at EO:Li = 20:1 -> 0.05",
    "salt wt%": "weight percent of salt",
    "Tg": "°C",
    "Tg polymer without salt": "°C",
    "Tm": "°C, or `none` if the paper reports no melting",
    "Tm start": "°C",
    "Tm end": "°C",
    "% crystallinity": "percent",
    "crystalline?": "one of `yes`, `no`, `na`",
    "T for transference": "°C",
    "T for storage mod": "°C",
    "temperature for D_Li": "°C",
    "chain architecture": "one of `linear`, `branched`, `cross-linked`",
    "Solvent used": "casting solvent, e.g. `acetonitrile`, `methanol`, `THF`, or `none`",
    "drying temp": "°C",
    "drying vacuum": "one of `yes`, `high`, `none`",
}
_CONDUCTIVITY_NOTE = "S/cm"


def _field_guide() -> str:
    lines = []
    for column in REPORTED_COLUMNS:
        if column == "Anion Smiles":
            continue  # filled by lookup table downstream, not by the LLM
        kind = "number" if column in _FLOAT_COLUMNS else "text"
        note = _CONDUCTIVITY_NOTE if column.startswith("Conductivity at ") else _FIELD_NOTES.get(column)
        lines.append(f"- `{column}` ({kind}, {note})" if note else f"- `{column}` ({kind})")
    return "\n".join(lines)


def build_system_prompt(include_figures: bool = True) -> str:
    if include_figures:
        intro, figures = _INTRO_WITH_FIGURES, _FIGURES_ATTACHED
        tables_check = "the figure image and against values stated in the body text"
        rules_agree = "the figure image and the body text"
    else:
        intro, figures = _INTRO_TEXT_ONLY, _FIGURES_NOT_ATTACHED
        tables_check = "values stated in the body text"
        rules_agree = "the body text"
    return "\n\n".join(
        [
            intro,
            figures,
            _DIGITISED_TABLES.format(tables_check=tables_check),
            _TASK.format(field_guide=_field_guide()),
            _RULES.format(rules_agree=rules_agree),
        ]
    ) + "\n"


def build_extraction_request(
    manifest: ParseManifest, paper_dir: Path, include_figures: bool = True
) -> ExtractionRequest:
    content_md = (paper_dir / manifest.content_md_path).read_text(encoding="utf-8")

    if not include_figures:
        return ExtractionRequest(
            paper_id=manifest.paper_id,
            system_prompt=build_system_prompt(include_figures=False),
            text_content=rewrite_to_caption_anchors(content_md, manifest.figures),
        )

    # The crop and the place it belongs in the text are linked by one shared
    # anchor string, emitted identically inline and as the image's own label.
    # Previously the text carried MinerU's opaque locator while the image was
    # labelled "Figure (page 4, block 3)" -- a correspondence the model had to
    # guess at from two differently-formatted strings, with nothing in the
    # prompt saying the two referred to the same figure.
    images = [
        ImageInput(
            path=paper_dir / fig.image_path,
            media_type="image/png",
            # Caption included because a bare crop has no title, no axis
            # explanation beyond what is visible, and no indication of what
            # experiment produced it.
            label=f"{prompt_anchor(fig, i)} {fig.caption or '(caption not found)'}",
        )
        for i, fig in enumerate(manifest.figures, 1)
    ]
    return ExtractionRequest(
        paper_id=manifest.paper_id,
        system_prompt=build_system_prompt(include_figures=True),
        text_content=rewrite_to_prompt_anchors(content_md, manifest.figures),
        images=images,
    )
