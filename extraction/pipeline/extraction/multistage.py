"""Multi-call extraction: list the formulations first, then fill in values.

Round 1 asked for everything in one call and hit three problems on small
local models (experiments/local_llm/SUMMARY.md): formulations merged (a
concentration series written as one entry with the range in its notes),
~65% of output spent writing empty fields as null, and papers with ~24+
formulations overrunning the output limit. This module splits the job:

1. **Listing call.** Only the formulations -- polymer, anion, concentration
   -- one entry per concentration. Code numbers them F1, F2, ...
2. **Value calls**, in one of two layouts (the comparison this module was
   written for):
   - `per_group`: one call per field group (thermal, conductivity, ...),
     each covering every formulation, values tagged with the formulation ID
     (or "ALL" for a value every formulation shares);
   - `per_formulation`: one call per formulation, asking for all of its
     values.

Every call returns only values the paper states, as name-value pairs, and
conductivity as measured points (temperature, value) that code maps onto
the answer sheet's 22 fixed-temperature columns. There are no empty slots
to fill: a missing value is a pair that isn't written.

Every call sends the same system prompt and puts the paper first, then (for
value calls) the formulation list, then the question. So consecutive calls
share a long identical start, which llama-server's prompt cache reuses
instead of re-reading. The listing and value calls share the system prompt
and paper; all value calls of a paper also share the list.

The model never has to remember anything between calls: the formulation
list travels in each prompt, and the output grammar only accepts IDs from
that list, so a value can't be attached to an ID that doesn't exist.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, create_model

from pipeline.extraction.llm_client.base import ExtractionRequest, LLMClient
from pipeline.extraction.prompt import (
    _CONDUCTIVITY_NOTE,
    _DIGITISED_TABLES,
    _FIELD_NOTES,
    _FIGURES_NOT_ATTACHED,
    _INTRO_TEXT_ONLY,
)
from pipeline.extraction.schema import _FLOAT_COLUMNS, FormulationRecord, PaperExtractionResult
from pipeline.parsing.figure_links import rewrite_to_caption_anchors
from pipeline.parsing.manifest_schema import ParseManifest
from pipeline.schema_columns import REPORTED_COLUMNS

# --- which columns are asked for, and in which call ------------------------

# What identifies a formulation: asked for in the listing call.
IDENTITY_COLUMNS = ["Polymer", "Anion", "Comonomer percentage", "Li:functional group", "Li:monomer", "salt wt%"]

# Calculated by the dataset's curators rather than stated in papers, so not
# asked for at all (still scored, in the diagnostic `curator_computed` group,
# where they will simply be missing). `Anion Smiles` comes from a lookup table.
NOT_ASKED = {
    "SMILES descriptor 1",
    "SMILES descriptor 2",
    "Average functional group per monomer",
    "Arrhenius Ea (eV) low T me",
    "Arrhenius prefactor low T me (S/cm)",
    "X-ray structural data (aggregate? Distance?)",
    "Anion Smiles",
}

CONDUCTIVITY_COLUMNS = [c for c in REPORTED_COLUMNS if c.startswith("Conductivity at ")]

# Value groups for the per_group layout. "conductivity" is special: it is
# asked as measured points, not as the 22 columns.
VALUE_GROUPS: dict[str, list[str]] = {
    "thermal": ["Tg", "Tg polymer without salt", "Tm", "Tm start", "Tm end", "% crystallinity", "crystalline?"],
    "conductivity": CONDUCTIVITY_COLUMNS,
    "transport_mechanical": [
        "Transference number", "T for transference", "Transference notes",
        "Li diffusion coefficient cm^2/s", "temperature for D_Li",
        "storage modulus", "T for storage mod", "youngs modulus (Mpa)", "viscosity (mPa s)",
    ],
    "fits": [
        "VFT prefactor (S/cm*T^(1/2))", "VFT activation energy (K)", "VFT T0 (degC)", "VFT Notes (above temp)",
        "VFT prefactor with set T0", "VFT activation energy with fixed T0 (K)", "Fixed T0 (degC)",
        "Arrhenius Ea (eV) low T", "Arrhenius Ea (eV) high T", "Arrhenius Ea (eV)", "Arrhenius prefactor (S/cm)",
        "Arrhenius notes",
    ],
    "material_processing": [
        "Polymer system Notes", "Polymer family", "chain architecture", "PDI", "Polymer Mn (kDa)",
        "Polymer Mw (kDa)", "Solvent used", "drying temp", "drying time (h)", "drying vacuum", "Notes",
        "DOI", "Reference",
    ],
}
GROUP_TITLES = {
    "thermal": "thermal properties",
    "conductivity": "ionic conductivity measurements",
    "transport_mechanical": "transport and mechanical properties",
    "fits": "fitted conductivity equations (VFT and Arrhenius)",
    "material_processing": "polymer details and sample preparation",
}
NON_CONDUCTIVITY_VALUE_COLUMNS = [c for g, cols in VALUE_GROUPS.items() if g != "conductivity" for c in cols]

_all = IDENTITY_COLUMNS + sorted(NOT_ASKED) + [c for cols in VALUE_GROUPS.values() for c in cols]
assert sorted(_all) == sorted(REPORTED_COLUMNS), "every target column must be asked in exactly one place"

# For value calls only. In the shared system prompt this sentence also reached
# the listing call, which then listed 1 formulation on bdf71b01 instead of 6.
_ONLY_STATED = (
    "Most fields will not be reported for any given formulation. Return only the values the paper "
    "actually states -- an empty list is a correct answer when it states none. Do not list a field "
    'just to say it is missing (no "na", "not reported" or empty values).'
)

_TEXT_MAX = {"Polymer system Notes": 600, "Transference notes": 600, "VFT Notes (above temp)": 600,
             "Arrhenius notes": 600, "Notes": 600, "Reference": 600}

# --- prompts ------------------------------------------------------------------

_FORMULATION_RULE = """\
## What a formulation is

A formulation is ONE polymer + ONE salt (anion) + ONE salt concentration \
(and, for copolymers, one comonomer ratio). If a paper tests the same \
polymer and salt at five concentrations, that is five formulations. Never \
summarise a series of concentrations as a range inside one entry."""

_RULES = """\
## Rules

- Report only values the paper states, in the text, a table, or a `~` \
table. If a value is not stated, do not report it. Never write a \
placeholder such as 0 for a value the paper does not give.
- Numbers are plain numbers in the unit shown in the field guide: convert \
mS/cm to S/cm (1.2 mS/cm = 0.0012), a temperature in K to °C, and a \
reported log10(σ) to σ.
- Conductivity: one point per temperature the paper gives a value for, \
temperature in °C rounded to the nearest degree (298 K -> 25), value in \
S/cm. Do not interpolate between measured temperatures.
- Salt concentration: convert a ratio of functional groups to lithium, such \
as EO:Li = 20:1 or [O]/[Li] = 20, into `Li:functional group` (1/20 = \
0.05). Do not calculate a molar ratio from a weight percentage -- if the \
paper gives wt%, report `salt wt%` instead.
- A `~` table value is a plot reading, not a printed value: use it only \
where it agrees with the body text, and never where it is physically \
implausible."""


def _field_line(column: str) -> str:
    kind = "number" if column in _FLOAT_COLUMNS else "text"
    note = _CONDUCTIVITY_NOTE if column.startswith("Conductivity at ") else _FIELD_NOTES.get(column)
    return f"- `{column}` ({kind}, {note})" if note else f"- `{column}` ({kind})"


def build_system_prompt() -> str:
    """Identical for every call of every paper, so it is always cached."""
    guide_columns = IDENTITY_COLUMNS + NON_CONDUCTIVITY_VALUE_COLUMNS
    return "\n\n".join([
        _INTRO_TEXT_ONLY,
        _FIGURES_NOT_ATTACHED,
        _DIGITISED_TABLES.format(tables_check="values stated in the body text"),
        _FORMULATION_RULE,
        "## Fields and units\n\n" + "\n".join(_field_line(c) for c in guide_columns)
        + "\n- conductivity (number, S/cm, reported as measured points: temperature in °C and value)",
        _RULES,
    ]) + "\n"


def paper_text(manifest: ParseManifest, paper_dir: Path) -> str:
    content_md = (paper_dir / manifest.content_md_path).read_text(encoding="utf-8")
    return rewrite_to_caption_anchors(content_md, manifest.figures)


def listing_question() -> str:
    return (
        "## Your task: list the formulations\n\n"
        "List every formulation in this paper, one entry per formulation. For each, give `Polymer`, "
        "`Anion`, the salt concentration exactly as the paper writes it (`concentration as written`), "
        "the numeric concentration fields the paper states (`Li:functional group`, `Li:monomer`, "
        "`salt wt%`), and `Comonomer percentage` for a copolymer. Also give a `quote`: up to 200 characters "
        "copied exactly from the paper -- the words or table cell that show this formulation and its "
        "concentration. Do not report any other properties yet."
    )


def formulation_list_block(listed: list[dict[str, Any]]) -> str:
    lines = ["## Formulations in this paper", ""]
    for f in listed:
        desc = f"{f.get('Polymer') or '?'} + {f.get('Anion') or '?'}, {f.get('concentration as written') or 'concentration not stated'}"
        if f.get("Comonomer percentage") is not None:
            desc += f" (comonomer {f['Comonomer percentage']:g}%)"
        lines.append(f"{f['id']}: {desc}")
    return "\n".join(lines)


def group_question(group: str) -> str:
    if group == "conductivity":
        return (
            f"## Your task: {GROUP_TITLES[group]}\n\n"
            "For the formulations above, report every conductivity value the paper gives, one point per "
            "formulation and temperature: `id`, `temperature_C`, `conductivity_S_cm`.\n\n" + _ONLY_STATED
        )
    fields = "\n".join(_field_line(c) for c in VALUE_GROUPS[group])
    return (
        f"## Your task: {GROUP_TITLES[group]}\n\n"
        f"For the formulations above, report these fields wherever the paper states them:\n\n{fields}\n\n"
        "Return each value as `id`, `field`, `value`. If one value applies to every formulation, give it "
        "once with id `ALL` instead of repeating it.\n\n" + _ONLY_STATED
    )


def formulation_question(target: dict[str, Any]) -> str:
    fields = "\n".join(_field_line(c) for c in NON_CONDUCTIVITY_VALUE_COLUMNS)
    return (
        f"## Your task: formulation {target['id']} only\n\n"
        f"Report every property the paper states for {target['id']} -- nothing for the other formulations. "
        f"Fields:\n\n{fields}\n\n"
        "Return each value as `field`, `value`, and every conductivity value for this formulation as a point: "
        "`temperature_C`, `conductivity_S_cm`.\n\n" + _ONLY_STATED
    )


# --- output models (built per paper, because the allowed IDs vary) -----------

def _alias_field(column: str) -> tuple[type, Any]:
    if column in _FLOAT_COLUMNS:
        return (float | None, Field(default=None, alias=column))
    return (str | None, Field(default=None, alias=column, max_length=300))


def listing_model() -> type[BaseModel]:
    fields = {c.replace(" ", "_").replace(":", "_").replace("%", "pct"): _alias_field(c) for c in IDENTITY_COLUMNS}
    fields["concentration_as_written"] = (str | None, Field(default=None, alias="concentration as written", max_length=120))
    fields["quote"] = (str | None, Field(default=None, alias="quote", max_length=200))
    listed = create_model("ListedFormulation", __config__=ConfigDict(populate_by_name=True, extra="forbid"), **fields)
    return create_model(
        "FormulationList",
        __config__=ConfigDict(extra="forbid"),
        formulations=(list[listed], Field(max_length=60)),
    )


# A value is a number or bounded text. The bound goes into the output
# grammar, so no value can run away (a 4B model once wrote a SMILES string
# for 10,000+ tokens -- see schema.py).
_Value = float | Annotated[str, StringConstraints(max_length=600)]


def group_values_model(ids: list[str], columns: list[str]) -> type[BaseModel]:
    entry = create_model(
        "GroupValue",
        __config__=ConfigDict(extra="forbid"),
        id=(Literal[tuple(ids + ["ALL"])], ...),
        field=(Literal[tuple(columns)], ...),
        value=(_Value, ...),
    )
    return create_model("GroupValues", __config__=ConfigDict(extra="forbid"), values=(list[entry], Field(max_length=800)))


def conductivity_points_model(ids: list[str]) -> type[BaseModel]:
    point = create_model(
        "ConductivityPoint",
        __config__=ConfigDict(extra="forbid"),
        id=(Literal[tuple(ids)], ...),
        temperature_C=(float, ...),
        conductivity_S_cm=(float, ...),
    )
    return create_model("ConductivityPoints", __config__=ConfigDict(extra="forbid"), points=(list[point], Field(max_length=1500)))


def single_formulation_model() -> type[BaseModel]:
    entry = create_model(
        "FormulationValue",
        __config__=ConfigDict(extra="forbid"),
        field=(Literal[tuple(NON_CONDUCTIVITY_VALUE_COLUMNS)], ...),
        value=(_Value, ...),
    )
    point = create_model(
        "FormulationPoint",
        __config__=ConfigDict(extra="forbid"),
        temperature_C=(float, ...),
        conductivity_S_cm=(float, ...),
    )
    return create_model(
        "FormulationValues",
        __config__=ConfigDict(extra="forbid"),
        values=(list[entry], Field(max_length=200)),
        conductivity=(list[point], Field(max_length=200)),
    )


# --- running one paper --------------------------------------------------------


@dataclass
class CallRecord:
    stage: str  # listing | group:<name> | formulation:<id>
    ok: bool
    wall_seconds: float
    prompt_tokens: int | None
    read_tokens: int | None  # tokens actually processed (not served from cache)
    cached_tokens: int | None
    output_tokens: int | None
    stop_reason: str | None
    errors: list[str] = field(default_factory=list)
    raw_text: str = ""


def _call(client: LLMClient, paper_id: str, system: str, user: str, model: type[BaseModel], stage: str):
    started = time.monotonic()
    response = client.extract_structured(
        ExtractionRequest(paper_id=paper_id, system_prompt=system, text_content=user), model
    )
    usage = response.usage or {}
    timings = usage.get("timings") or {}
    record = CallRecord(
        stage=stage,
        ok=response.parsed is not None,
        wall_seconds=round(usage.get("wall_seconds") or (time.monotonic() - started), 2),
        prompt_tokens=usage.get("prompt_tokens"),
        read_tokens=timings.get("prompt_n"),
        cached_tokens=timings.get("cache_n"),
        output_tokens=usage.get("completion_tokens"),
        stop_reason=response.stop_reason,
        errors=response.validation_errors,
        raw_text=response.raw_text,
    )
    return response, record


_LATEX_CMD = re.compile(r"\\[a-zA-Z]+")
_SUB_SUPER = str.maketrans("₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹", "01234567890123456789")
# An HTML tag: "<" then a letter, so "T < 60 °C" is left alone.
_HTML_TAG = re.compile(r"</?[a-zA-Z][^<>]*>")


def _norm(text: str) -> str:
    """Letters and digits only, so a quote matches the markdown it was copied
    from despite LaTeX (`\\mathrm{LiClO_4}`), subscript digits, MinerU's
    letter-spaced numbers ("1 2 0"), punctuation, and the tags of the tables
    MinerU writes as HTML. Without removing those, a quoted table row
    "LiTFSI 20 45" never matched `LiTFSI</td><td>20</td><td>45` (its tag
    letters survived as "litfsitdtd20tdtd45") and was dropped as invented."""
    text = _HTML_TAG.sub(" ", text)
    text = _LATEX_CMD.sub("", text.translate(_SUB_SUPER))
    return re.sub(r"[^0-9a-z]", "", text.lower())


def quote_in_paper(quote: str | None, paper_norm: str) -> bool:
    from rapidfuzz import fuzz

    def found(text: str) -> bool:
        q = _norm(text)
        if len(q) < 8:  # too short to be evidence of anything
            return False
        return q in paper_norm or fuzz.partial_ratio(q, paper_norm, score_cutoff=92) > 0

    quote = (quote or "").strip()
    if found(quote):
        return True
    # A table whose first column spans several rows (<td rowspan="4">LiTFSI</td>)
    # prints that label once, but a row quoted on its own carries it: "LiTFSI
    # 40 42 1748 58 1724" for the second row. Accept it when the label and the
    # rest of the row are both in the paper; the row's own cells still have to
    # match, so an invented row still fails.
    label, _, rest = quote.partition(" ")
    return len(_norm(label)) >= 2 and _norm(label) in paper_norm and found(rest)


def run_listing(client: LLMClient, manifest: ParseManifest, paper_dir: Path):
    """Returns (verified formulations, call record, stats).

    Each listed formulation must quote the paper, and only those whose quote
    is really in the paper are kept. Without this, Qwen3.5-4B listed 80
    "formulations" for f3d2d4b6 -- the first few real, then a counting
    sequence (Li:functional group 0.05, 0.10, ... 7.0) until the list cap.
    An invented entry has no real sentence to quote.
    """
    system, paper = build_system_prompt(), paper_text(manifest, paper_dir)
    response, record = _call(client, manifest.paper_id, system, f"{paper}\n\n{listing_question()}", listing_model(), "listing")
    stats = {"returned": 0, "kept": 0, "quote_not_found": 0, "duplicates": 0}
    listed: list[dict[str, Any]] = []
    if response.parsed is not None:
        paper_norm, seen = _norm(paper), set()
        for f in response.parsed.formulations:
            stats["returned"] += 1
            entry = f.model_dump(by_alias=True)
            key = tuple(str(entry.get(c)) for c in ("Polymer", "Anion", "concentration as written", "Comonomer percentage"))
            if key in seen:
                stats["duplicates"] += 1
                continue
            seen.add(key)
            if not quote_in_paper(entry.get("quote"), paper_norm):
                stats["quote_not_found"] += 1
                continue
            entry["id"] = f"F{len(listed) + 1}"  # numbered by code: unique and gap-free
            listed.append(entry)
        stats["kept"] = len(listed)
    return listed, record, stats


def _coerce(column: str, value: Any) -> tuple[Any, str | None]:
    """Fit a model value to its column's type; (value, None) or (None, reason)."""
    from pipeline.evaluation.normalize import as_number_with_unit

    if column in _FLOAT_COLUMNS:
        n = as_number_with_unit(value)
        return (n, None) if n is not None else (None, f"not a number for {column}: {value!r}")
    text = f"{value:g}" if isinstance(value, float) else str(value)
    return text[: _TEXT_MAX.get(column, 300)], None


@dataclass
class Assembly:
    rows: dict[str, dict[str, Any]]
    dropped: list[str] = field(default_factory=list)
    duplicates: int = 0
    off_grid_points: int = 0
    placeholders: int = 0  # "na", "not reported", "" ... written instead of leaving a field out
    implausible_points: int = 0  # conductivity outside SIGMA_RANGE


_WT = re.compile(r"(\d+(?:\.\d+)?)\s*(?:wt|weight)\s*\.?\s*%", re.I)
_RATIO = re.compile(r"(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)")
_EQUALS = re.compile(r"=\s*(\d+(?:\.\d+)?)")


def parse_concentration(text: str | None) -> tuple[dict[str, float], str | None]:
    """Numeric concentration fields from how the paper writes it, in code.

    With quotes required, the listing call stopped filling the numeric
    concentration fields and gave only the words ("O/Li = 20"), which left
    formulations unmatchable. Converting here is also the rule for derived
    values: the model reports what the paper says; code does the arithmetic.

    Handles "N wt%" -> salt wt%, and oxygen-to-lithium ratios ("O/Li = 20",
    "EO:Li = 20:1", "24:1") -> Li:functional group = 1/N. A ratio above 1 is
    read as oxygens per lithium even when written "Li:O = 24:1" (bdf71b01
    uses that inverted notation): Li:functional group above 1 means more
    lithium than binding groups, which only polymer-in-salt electrolytes
    reach. Returns (fields, note) -- note records any such inversion. mol% is
    left alone: papers define it differently (per repeat unit, per total).
    """
    if not text:
        return {}, None
    if m := _WT.search(text):
        return {"salt wt%": float(m[1])}, None
    ratio = None
    if m := _RATIO.search(text):
        a, b = float(m[1]), float(m[2])
        ratio = a / b if b else None
    elif ("O" in text or "Li" in text) and (m := _EQUALS.search(text)):
        ratio = float(m[1])
    if not ratio:
        return {}, None
    if ratio >= 1:
        note = f"read {text!r} as {ratio:g} oxygens per lithium" if text.lower().lstrip().startswith("li") else None
        return {"Li:functional group": round(1 / ratio, 6)}, note
    return {"Li:functional group": round(ratio, 6)}, None


def new_assembly(listed: list[dict[str, Any]]) -> Assembly:
    rows, notes = {}, []
    for f in listed:
        row = {c: f.get(c) for c in IDENTITY_COLUMNS if f.get(c) is not None}
        if not any(k in row for k in ("Li:functional group", "Li:monomer", "salt wt%")):
            parsed, note = parse_concentration(f.get("concentration as written"))
            row.update(parsed)
            if note:
                notes.append(f"{f['id']}: {note}")
        rows[f["id"]] = row
    asm = Assembly(rows=rows)
    asm.dropped.extend(f"concentration: {n}" for n in notes)
    return asm


# Words a small model writes in place of leaving a field out. On bdf71b01 the
# per-formulation layout wrote 793 of these ('', 'na', 'not reported', ...)
# in six calls -- most of its output. They carry no data, so they are dropped
# and counted (the count measures wasted output, not a scoring penalty).
_PLACEHOLDERS = {
    "", "na", "n/a", "n.a.", "nan", "null", "none reported", "not reported", "not stated", "not given",
    "not available", "not provided", "not mentioned", "not specified", "not applicable", "unknown",
    "no data", "-", "--", "—", "?",
}
# ...except where the word is a real answer in the golden vocabulary.
_LEGIT_WORDS = {"crystalline?": {"na"}, "Tm": {"none"}, "Solvent used": {"none"}, "drying vacuum": {"none"}}


def _is_placeholder(column: str, value: Any) -> bool:
    if not isinstance(value, str):
        return False
    word = value.strip().lower().rstrip(".")
    return word in _PLACEHOLDERS and word not in _LEGIT_WORDS.get(column, set())


def add_value(asm: Assembly, fid: str, column: str, value: Any) -> None:
    targets = list(asm.rows) if fid == "ALL" else [fid]
    if _is_placeholder(column, value):
        asm.placeholders += 1
        return
    coerced, reason = _coerce(column, value)
    if reason:
        asm.dropped.append(f"{fid}/{reason}")
        return
    for t in targets:
        if column in asm.rows[t]:
            asm.duplicates += 1
            continue
        asm.rows[t][column] = coerced


# Polymer electrolytes span about 1e-12 to 1e-2 S/cm; the golden set's range
# is 7e-11 to 3e-3. A value outside this generous window is not a
# conductivity -- on bdf71b01 the model copied a frequency sweep's
# "log f" column (1.0, 1.5, ... 4.0) in as S/cm -- so it is dropped and
# counted rather than scored.
SIGMA_RANGE = (1e-13, 1.0)


def add_point(asm: Assembly, fid: str, temperature_c: float, sigma: float) -> None:
    if not (SIGMA_RANGE[0] <= sigma <= SIGMA_RANGE[1]):
        asm.implausible_points += 1
        return
    column = f"Conductivity at {round(temperature_c)}C"
    if column not in CONDUCTIVITY_COLUMNS:
        asm.off_grid_points += 1  # a real measurement, but at a temperature the answer sheet has no column for
        return
    if column in asm.rows[fid]:
        asm.duplicates += 1
        return
    asm.rows[fid][column] = sigma


def to_result(paper_id: str, asm: Assembly) -> PaperExtractionResult:
    return PaperExtractionResult(
        paper_id=paper_id,
        formulations=[FormulationRecord.model_validate(row) for row in asm.rows.values()],
    )


def run_per_group(client: LLMClient, manifest: ParseManifest, paper_dir: Path, listed: list[dict[str, Any]]):
    system, paper = build_system_prompt(), paper_text(manifest, paper_dir)
    prefix = f"{paper}\n\n{formulation_list_block(listed)}"
    ids = [f["id"] for f in listed]
    asm, records = new_assembly(listed), []
    for group in VALUE_GROUPS:
        if group == "conductivity":
            response, record = _call(client, manifest.paper_id, system, f"{prefix}\n\n{group_question(group)}",
                                     conductivity_points_model(ids), f"group:{group}")
            if response.parsed is not None:
                for p in response.parsed.points:
                    add_point(asm, p.id, p.temperature_C, p.conductivity_S_cm)
        else:
            response, record = _call(client, manifest.paper_id, system, f"{prefix}\n\n{group_question(group)}",
                                     group_values_model(ids, VALUE_GROUPS[group]), f"group:{group}")
            if response.parsed is not None:
                for v in response.parsed.values:
                    add_value(asm, v.id, v.field, v.value)
        records.append(record)
    return asm, records


def run_per_formulation(client: LLMClient, manifest: ParseManifest, paper_dir: Path, listed: list[dict[str, Any]]):
    system, paper = build_system_prompt(), paper_text(manifest, paper_dir)
    prefix = f"{paper}\n\n{formulation_list_block(listed)}"
    asm, records = new_assembly(listed), []
    model = single_formulation_model()
    for target in listed:
        response, record = _call(client, manifest.paper_id, system, f"{prefix}\n\n{formulation_question(target)}",
                                 model, f"formulation:{target['id']}")
        if response.parsed is not None:
            for v in response.parsed.values:
                add_value(asm, target["id"], v.field, v.value)
            for p in response.parsed.conductivity:
                add_point(asm, target["id"], p.temperature_C, p.conductivity_S_cm)
        records.append(record)
    return asm, records


def save_calls(path: Path, records: list[CallRecord]) -> None:
    path.write_text("\n".join(json.dumps(r.__dict__) for r in records) + "\n", encoding="utf-8")


def replay(listed: list[dict[str, Any]], calls: list[dict[str, Any]]) -> Assembly:
    """Rebuild a layout's result from its saved raw outputs (calls.jsonl), so
    an assembly or scoring fix never needs the model to run again."""
    asm = new_assembly(listed)
    for c in calls:
        if not c.get("ok") or not c.get("raw_text"):
            continue
        data = json.loads(c["raw_text"])
        stage = c["stage"]
        if stage == "group:conductivity":
            for p in data.get("points", []):
                add_point(asm, p["id"], p["temperature_C"], p["conductivity_S_cm"])
        elif stage.startswith("group:"):
            for v in data.get("values", []):
                add_value(asm, v["id"], v["field"], v["value"])
        elif stage.startswith("formulation:"):
            fid = stage.split(":", 1)[1]
            for v in data.get("values", []):
                add_value(asm, fid, v["field"], v["value"])
            for p in data.get("conductivity", []):
                add_point(asm, fid, p["temperature_C"], p["conductivity_S_cm"])
    return asm
