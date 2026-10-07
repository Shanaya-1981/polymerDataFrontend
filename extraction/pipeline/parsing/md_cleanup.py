"""Normalise MinerU's markdown so temperatures survive rendering and reading.

Two defects found by rendering every math span in the corpus through KaTeX
(12201 spans, 83 files) rather than by eyeballing:

1. **Escaped literal dollars break math detection for the rest of the page.**
   Journal page furniture carries prices -- `CCC: \\$27.50`. MinerU escapes
   that correctly for markdown, but it leaves an odd number of `$` on the
   line, and a math scanner that does not honour the backslash pairs that
   `$` with the *next* `$` in the document. Measured: 59 such lines across
   54 of 83 files, and 100% of the unbalanced-`$` lines in the corpus are
   this one cause. On one paper it swallowed 475 characters spanning 13
   lines -- including the sentence "glass transition temperature, where the
   relaxation disappears" -- into a single bogus math span. The temperature
   was parsed correctly and still could not be read.
   Fix: emit the HTML entity `&#36;`, which renders as `$` and contains no
   `$` character for any scanner to mis-pair.

2. **The same temperature is written 351 different ways, and a few are
   invalid LaTeX.** `$70^{\\circ}\\mathrm{C}$`, `$70~^{\\circ}\\mathsf{C}$`,
   `$T=70^{\\circ}\\mathrm{C}$`, `$({}^{\\circ}C)$` ... and
   `$^\\mathrm{~55~}^{\\circ}\\mathbf{C}$`, which is a superscript
   immediately followed by another superscript -- invalid, and the cause of
   11 of the 15 degree spans that fail to render.
   Fix: where a math span is *only* a temperature, replace it with plain
   text (`70 °C`). That fixes the invalid ones, collapses the variants, and
   makes the value directly readable by the LLM instead of arriving wrapped
   in markup it has to see through.

`normalise_degree_math` is deliberately conservative: it rewrites a span
only when the whole span reduces to a temperature, and it copies the digit
characters through verbatim rather than reformatting them, so no rewrite
can change a value. `digits_unchanged` asserts exactly that and is used by
the backfill script as a guard.
"""

from __future__ import annotations

import re

# --- 1. escaped literal dollars ----------------------------------------
_ESCAPED_DOLLAR_RE = re.compile(r"\\\$")


def escape_literal_dollars(md: str) -> tuple[str, int]:
    """`\\$27.50` -> `&#36;27.50`. Returns (markdown, replacements)."""
    return _ESCAPED_DOLLAR_RE.subn("&#36;", md)


# --- 2. degree / temperature spans -------------------------------------
# Inline math only, and matched per line. A document-wide
# `\$\$(.+?)\$\$` with DOTALL pairs the first `$$` it meets with the next
# `$$` *anywhere later in the file*, which on one paper swallowed a whole
# region of ordinary inline spans into a single bogus "display" match --
# four correct `°C` temperatures on one line silently went unconverted
# because of it. Matching line by line removes the possibility: MinerU
# never emits an inline span across a newline, so a line is the natural
# unit and the pairing cannot run away.
_INLINE_MATH_RE = re.compile(r"(?<!\$)\$([^$\n]+?)\$(?!\$)")

# Formatting-only commands: they change how a value looks, never what it is,
# so they can be dropped before deciding whether a span is a temperature.
_FORMATTING_RE = re.compile(
    r"\\(?:mathrm|mathbf|mathsf|mathit|mathtt|mathfrak|mathbb|textrm|textbf|textsf|text"
    r"|bf|sf|tt|it|rm|scriptsize|scriptstyle|normalfont|small|large|displaystyle"
    r"|dot|ddot|bar|tilde|widetilde|hat|check|breve|vec|mbox|nobreak)\b"
)
_SPACING_RE = re.compile(r"\\[,;:!>]|\\quad|\\qquad|\\ |~")
_APPROX_RE = re.compile(r"\\(?:sim|approx|simeq|thicksim)\b")

# What a temperature looks like once formatting is stripped: an optional
# label ("T =", "Tg ="), an optional approximately-sign, a number or a
# numeric range, the degree, and an optional unit letter.
_TEMPERATURE_RE = re.compile(
    r"""^\s*
    (?P<open>\()?\s*
    (?:(?P<label>T[gmc]?|\#Delta\s*T)\s*=\s*)?
    (?P<approx>\#approx)?
    [\^\s]*
    (?P<value>[-+\u2212]?\s*\d+(?:\.\d+)?
        (?:\s*[-\u2013\u2014]\s*[-+\u2212]?\s*\d+(?:\.\d+)?)?)?
    [\^\s]*\#circ\s*
    (?P<unit>[CFK])?\s*
    (?P<tail>[.,;:)\]]*)\s*$""",
    re.VERBOSE,
)


# MinerU sometimes reads the degree *ring* as the digit zero, producing a
# superscript number followed by a superscript "0" and then the unit:
#   $^\textrm{\scriptsize 4 5}^{\scriptsize\textrm{\scriptsize 0}}\mathbf{C}$
# That is 45 °C, but read literally it is "45" "0" "C" -- i.e. a reader can
# come away with 450 °C. This is a corrupted value, not just ugly markup,
# which is why it is worth recovering rather than merely leaving alone.
#
# Confirmed against each paper's own surrounding prose before enabling:
#   54df2c4d  "The reaction was performed at <span>" -- a polymerisation,
#             so 45 °C; 450 °C would destroy the polymer.
#   d4892d64  the same sentence writes "22 °C" and "-49 °C" with a correct
#             \circ, then "an exothermic peak at <span>" -> 27 °C.
#   cca778d3  "a Tm of around 100 °C, while ... exhibit no Tm or Tg up to
#             <span>" -> 200 °C (DSC range), with the ring doubled to "00".
# Only ever applied when the span as a whole then reduces to a temperature,
# so a stray `10^0 C` in an equation cannot be caught by it.
_DEGREE_AS_ZERO_RE = re.compile(r"(?<=\d)\s*\^\s*0+\s*\^?\s*(?=[CFK]\b)")


def _reduce(tex: str, recover_degree_as_zero: bool = True) -> str:
    """Strip formatting/spacing/braces; mark surviving commands with '#'.

    Also rejoins letter-spaced digits: MinerU frequently emits a value as
    `1 2 0` rather than `120` (an artefact of reading glyph positions), and
    without rejoining, no numeric pattern matches at all.
    """
    tex = _FORMATTING_RE.sub(" ", tex)
    tex = _SPACING_RE.sub(" ", tex)
    tex = _APPROX_RE.sub(" #approx ", tex)
    tex = tex.replace("\\circ", " #circ ").replace("\\Delta", " #Delta ")
    tex = re.sub(r"[{}_]", " ", tex)
    tex = re.sub(r"\s+", " ", tex).strip()
    # `1 2 0` -> `120`, repeatedly (each pass closes one gap)
    while True:
        joined = re.sub(r"(?<=\d) (?=\d)", "", tex)
        if joined == tex:
            break
        tex = joined
    if not recover_degree_as_zero:
        return tex
    return _DEGREE_AS_ZERO_RE.sub(" #circ ", tex)


def _as_plain_temperature(tex: str, recover_degree_as_zero: bool = True) -> str | None:
    """Plain-text form of a temperature span, or None if not one."""
    reduced = _reduce(tex, recover_degree_as_zero)
    # Any LaTeX command left over means this is not a bare temperature
    # (an equation, a chemical formula, a subscripted symbol) -- leave it.
    if "\\" in reduced:
        return None
    m = _TEMPERATURE_RE.match(reduced)
    if not m:
        return None

    value = (m.group("value") or "").replace("\u2212", "-")
    value = re.sub(r"\s*([-\u2013\u2014])\s*", r"\1", value)
    # MinerU spaces a leading sign away from its digits ("- 4 2").
    value = re.sub(r"^([-+])\s+", r"\1", value)
    out = ""
    if m.group("open"):
        out += "("
    if m.group("label"):
        out += f"{m.group('label')} = "
    if m.group("approx"):
        out += "~"
    out += f"{value} °{m.group('unit') or ''}".strip()
    out += m.group("tail") or ""
    # Belt-and-braces: never emit a rewrite that loses a real digit, even
    # if some future pattern here is wrong.
    return out if _only_zeros_deleted(tex, out) else None


def normalise_degree_math(
    md: str, recover_degree_as_zero: bool = True
) -> tuple[str, int, list[tuple[str, str]]]:
    """Replace temperature-only inline math spans with plain text.

    Returns (markdown, total rewrites, inferred rewrites).

    The third value lists only the rewrites that relied on reading a
    superscript zero as a degree ring. Those are *inferences* about what
    the page meant, unlike the rest of this module which only changes
    spelling -- so they are reported rather than applied silently, and can
    be switched off wholesale for a corpus where the assumption does not
    hold. A span that already carried a real `\\circ` is never in this list.
    """
    count = 0
    inferred: list[tuple[str, str]] = []

    def replace(match: re.Match[str]) -> str:
        nonlocal count
        tex = match.group(1)
        plain = _as_plain_temperature(tex, recover_degree_as_zero)
        if plain is None:
            return match.group(0)
        count += 1
        if "\\circ" not in tex:
            inferred.append((re.sub(r"\s+", " ", tex).strip(), plain))
        return plain

    lines = [_INLINE_MATH_RE.sub(replace, line) for line in md.split("\n")]
    return "\n".join(lines), count, inferred


# --- 3. text-mode commands used in math mode --------------------------
# MinerU occasionally emits a LaTeX *text*-mode command inside a math span.
# KaTeX has no math-mode definition for these, so the entire span fails to
# render with "Undefined control sequence" -- one bad command takes the
# whole formula down, not just itself. Each has an exact math-mode
# equivalent, so this changes spelling and nothing else. Between them these
# accounted for every remaining render failure across 11144 spans except
# one garbled author name.
_TEXT_MODE_FIXES = {
    r"\textellipsis": r"\ldots",
    r"\textquotesingle": r"\prime",
    r"\textless": "<",
    r"\textgreater": ">",
    r"\normalfont": "",
}


def fix_text_mode_commands(md: str) -> tuple[str, int]:
    """Swap text-mode-only commands for their math-mode equivalents."""
    total = 0
    for command, replacement in _TEXT_MODE_FIXES.items():
        # A function replacement avoids re's backslash-escape handling in
        # the replacement string, which would mangle `\ldots`.
        pattern = re.escape(command) + r"(?![a-zA-Z])"
        md, n = re.subn(pattern, lambda _m, r=replacement: r, md)
        total += n
    return md, total


# --- safety guard -------------------------------------------------------
_DIGIT_RE = re.compile(r"\d")


def _only_zeros_deleted(before: str, after: str) -> bool:
    """True if `after`'s digits are `before`'s with only '0's deleted.

    A plain "digits must be identical" check is too strict: recovering
    `^{45}^{0}C` as `45 °C` deliberately deletes a zero, because that zero
    is a misread degree ring rather than data. It is also too weak in the
    wrong direction -- it would happily accept a reordering. This checks the
    exact property wanted: every surviving digit appears in the same order
    with the same value, and anything dropped was a zero. So a real
    measurement can never be silently altered, dropped, or moved.
    """
    b = _DIGIT_RE.findall(before)
    a = _DIGIT_RE.findall(after)
    i = 0
    for digit in b:
        if i < len(a) and a[i] == digit:
            i += 1
        elif digit != "0":
            return False  # a non-zero digit vanished
    return i == len(a)  # every digit in `after` was consumed, in order


def digits_unchanged(before: str, after: str) -> bool:
    """Guard for the whole-document rewrite; see `_only_zeros_deleted`."""
    def prep(text: str) -> str:
        # The literal-dollar fix emits `&#36;`, whose own digits would
        # otherwise read as data appearing out of nowhere.
        return re.sub(r"(?<=\d)[\s,]+(?=\d)", "", text.replace("&#36;", "$"))

    return _only_zeros_deleted(prep(before), prep(after))


def clean_markdown(md: str, recover_degree_as_zero: bool = True) -> tuple[str, dict]:
    """All three fixes.

    Returns (markdown, stats). `stats["inferred_degrees"]` lists the
    (before, after) pairs that required reading a superscript zero as a
    degree ring -- review these when pointing the pipeline at a new corpus,
    or pass `recover_degree_as_zero=False` to disable that rule entirely.
    """
    md, n_dollars = escape_literal_dollars(md)
    md, n_degrees, inferred = normalise_degree_math(md, recover_degree_as_zero)
    md, n_textmode = fix_text_mode_commands(md)
    return md, {
        "literal_dollars": n_dollars,
        "degree_spans": n_degrees,
        "text_mode_commands": n_textmode,
        "inferred_degrees": inferred,
    }
