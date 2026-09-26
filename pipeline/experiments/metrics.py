"""Content-level metrics for comparing two parses of the same paper.

Counting characters and figures is easy but only weakly related to what this
project needs. The pipeline's job is to recover *numbers* -- conductivities,
temperatures, molecular weights, salt concentrations -- so the metrics that
actually decide the tier question are the numeric ones: how many numbers end
up inside tables (i.e. digitized as data rather than left locked in an image
crop), and which numbers one tier recovers that the other misses entirely.
The rest are supporting context.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field

from rapidfuzz import fuzz

from pipeline.parsing.parse_paper import count_markdown_tables

# Any row of a GFM table: starts and ends with a pipe on its own line.
_TABLE_ROW_RE = re.compile(r"^\s*\|.*\|\s*$", re.MULTILINE)
_TABLE_SEPARATOR_RE = re.compile(r"^\s*\|[\s:|-]+\|\s*$", re.MULTILINE)

# MinerU emits a table one of two ways, and counting only the first badly
# misrepresents the thing this experiment exists to measure. Tables whose
# cells merge across rows/columns come out as raw HTML with rowspan/colspan
# preserved; simple grids come out as GFM pipe tables. `advanced` is the
# tier that reaches for HTML (it recovers the complex tables `standard`
# flattens), so a GFM-only count is biased against exactly the tier under
# test -- measured on one sampled paper, `standard` flattened a 13-row
# table into a single GFM row of concatenated digits ("20406080" for the
# four values 20/40/60/80) while `advanced` emitted all 13 rows as HTML
# that a GFM-only regex scored as zero tables.
_HTML_TABLE_RE = re.compile(r"<table>.*?</table>", re.DOTALL | re.IGNORECASE)
_HTML_ROW_RE = re.compile(r"<tr[\s>]", re.IGNORECASE)
_HTML_TAG_RE = re.compile(r"<[^>]+>")

# Integers, decimals and scientific notation. Deliberately does not try to
# reassemble "1.2 x 10^-4" into one value -- it counts the tokens present,
# and both tiers are measured the same way, so the comparison stays fair
# even though the absolute count is not a count of physical quantities.
_NUMBER_RE = re.compile(r"[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?")

# A table cell holding six or more consecutive digits is the fingerprint of
# a flattened table: MinerU failed to split a merged/multi-row cell and
# concatenated the values instead, so "20", "40", "60", "80" arrive as the
# single token "20406080". This is the most damaging failure mode for this
# project -- the numbers are technically present, so a char-count or a
# number-count still looks healthy, but no LLM can recover four
# measurements from one run-together integer. Some genuine six-digit values
# exist (molecular weights), so this is a comparative signal rather than an
# exact defect count; both tiers are measured identically.
#
# The lookarounds exclude decimals: a legitimate small value like 0.000015
# contains the 6-digit run "000015" and a naive \d{6,} flags it. That is
# not hypothetical -- it produced 18 false positives on one paper here,
# wrongly making `advanced` look like it flattened tables when the values
# were correct conductivities that `standard` had not recovered at all.
# Concatenation artefacts are always bare integers.
_LONG_DIGIT_RUN_RE = re.compile(r"(?<![\d.])\d{6,}(?![\d.])")
_HTML_CELL_SPLIT_RE = re.compile(r"</t[dh]>", re.IGNORECASE)

# `advanced` does something `standard` never does: it reads data points off
# a plot and emits them as a table, marking the estimates with "~". That is
# genuinely new data -- but it is *estimated* data, and a spot-check here
# found a 246-row digitised Arrhenius plot whose axis was misread by a
# factor of ten (1000/T of 27.3-100, i.e. T = 10-37 K, and log sigma up to
# +3.4 S/cm -- better than copper) sitting alongside correctly digitised
# tables in the same document. Counting those rows as "recovered data"
# without separating them would overstate the tier's advantage and hide a
# real downstream risk: an LLM cannot tell an impossible conductivity from
# a plausible one. Tracked separately so the headline stays honest.
_CHART_HEADER_RE = re.compile(r"series|\bcurve\b", re.IGNORECASE)

_DISPLAY_FORMULA_RE = re.compile(r"\$\$.+?\$\$", re.DOTALL)
_IMAGE_MD_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")

# Numbers this short are page numbers, reference indices, small integers in
# prose ("Figure 2", "3 samples") -- noise that swamps the signal in a
# set-difference. Real measured values in this corpus are decimals or
# scientific notation.
_MEANINGFUL_NUMBER_RE = re.compile(r"[-+]?\d+\.\d+(?:[eE][-+]?\d+)?|[-+]?\d+[eE][-+]?\d+")


@dataclass
class ContentMetrics:
    chars: int
    tables: int
    table_rows: int
    table_numbers: int
    chart_rows: int
    concat_cells: int
    display_formulas: int
    numbers_total: int
    meaningful_numbers: Counter = field(repr=False, default_factory=Counter)


def content_metrics(md: str) -> ContentMetrics:
    n_gfm_tables = count_markdown_tables(md)
    all_pipe_rows = _TABLE_ROW_RE.findall(md)
    separators = set(_TABLE_SEPARATOR_RE.findall(md))
    # data rows = all pipe rows - separator rows - one header row per table
    n_gfm_rows = max(len(all_pipe_rows) - len(separators) - n_gfm_tables, 0)
    gfm_text = "\n".join(r for r in all_pipe_rows if r not in separators)

    html_tables = _HTML_TABLE_RE.findall(md)
    # Approximation: charge one header row per HTML table. MinerU writes
    # header cells as <td>, not <th>, so headers cannot be identified
    # exactly -- but both tiers are measured the same way, so the
    # comparison stays fair.
    n_html_rows = max(sum(len(_HTML_ROW_RE.findall(t)) for t in html_tables) - len(html_tables), 0)
    html_text = " ".join(_HTML_TAG_RE.sub(" ", t) for t in html_tables)

    # Tags are stripped before any number counting: `rowspan="2"` and
    # `colspan="4"` would otherwise be counted as table data.
    detagged = _HTML_TAG_RE.sub(" ", md)

    # Group consecutive pipe rows back into tables so each can be classified
    # as printed-table vs digitised-chart.
    gfm_blocks: list[list[str]] = []
    current: list[str] = []
    for line in md.splitlines():
        if line.strip().startswith("|"):
            current.append(line)
        elif current:
            gfm_blocks.append(current)
            current = []
    if current:
        gfm_blocks.append(current)

    chart_rows = 0
    for b in gfm_blocks:
        body = b[2:]  # skip header + separator
        if not body:
            continue
        if _CHART_HEADER_RE.search(b[0]) or sum("~" in r for r in body) > len(body) / 2:
            chart_rows += len(body)

    cells = [c for row in gfm_text.splitlines() for c in row.split("|")]
    cells += [_HTML_TAG_RE.sub(" ", c) for t in html_tables for c in _HTML_CELL_SPLIT_RE.split(t)]

    return ContentMetrics(
        chars=len(md),
        tables=n_gfm_tables + len(html_tables),
        table_rows=n_gfm_rows + n_html_rows,
        table_numbers=len(_NUMBER_RE.findall(gfm_text)) + len(_NUMBER_RE.findall(html_text)),
        chart_rows=chart_rows,
        concat_cells=sum(1 for c in cells if _LONG_DIGIT_RUN_RE.search(c)),
        display_formulas=len(_DISPLAY_FORMULA_RE.findall(md)),
        numbers_total=len(_NUMBER_RE.findall(detagged)),
        meaningful_numbers=Counter(_MEANINGFUL_NUMBER_RE.findall(detagged)),
    )


def normalise_for_similarity(md: str) -> str:
    """Strip everything that differs between tiers for uninteresting reasons.

    Two sources of noise, both of which would otherwise show up as "the
    tiers disagree about the text" when they do not:

    - Image links embed the parse's own doc short_id and tier
      (`![Image block](doc:586e542/tier:advanced/page:2/block:10)`), so
      every figure would register as a difference even with identical prose.
    - The tiers pick different *markup* for tables (`advanced` reaches for
      HTML on merged-cell tables, `standard` emits GFM pipes). Stripping
      tags compares the table's text content, which is the real question,
      instead of scoring `<td>` against `|`.
    """
    return re.sub(r"\s+", " ", _HTML_TAG_RE.sub(" ", _IMAGE_MD_RE.sub("", md))).strip().lower()


def text_similarity(md_a: str, md_b: str) -> float:
    """0-100. How much of the body text the two tiers actually agree on."""
    return round(fuzz.ratio(normalise_for_similarity(md_a), normalise_for_similarity(md_b)), 1)


def exclusive_numbers(a: ContentMetrics, b: ContentMetrics) -> tuple[list[str], list[str]]:
    """(numbers only in a, numbers only in b), as multiset differences.

    This is the metric that answers the question the project actually cares
    about: did one tier recover measured values the other lost?
    """
    only_a = sorted((a.meaningful_numbers - b.meaningful_numbers).elements())
    only_b = sorted((b.meaningful_numbers - a.meaningful_numbers).elements())
    return only_a, only_b
