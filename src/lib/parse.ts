/**
 * Cell-level parsing rules for the raw source CSVs.
 *
 * Ground truth: `data/reference/DATA-SPEC.md` §2. The complete set of
 * non-numeric junk in the numeric columns we consume is: empty string,
 * `none`, `na`, `n/a` (defensive — never observed, but specified), and the
 * literal `unknown atom type (...)` string that appears 10x in `anion Vabc`.
 * All of these are matched case-insensitively after trimming.
 *
 * `na` is deliberately NOT handled here for `crystalline?` — that column is
 * parsed with {@link parseTextCell}, not {@link parseNumericCell}, so its
 * literal `na` category value is preserved rather than nulled.
 */

/** The exact sentinel string DATA-SPEC.md documents, kept in its canonical case for readability. */
export const UNKNOWN_ATOM_TYPE_SENTINEL =
  "unknown atom type (Vabc/nARing/mordred.RingCount.Rings()/naRing/nBonds)";

const NUMERIC_SENTINELS = new Set(
  ["", "none", "na", "n/a", UNKNOWN_ATOM_TYPE_SENTINEL].map((s) => s.toLowerCase()),
);

/** `^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$` — DATA-SPEC.md §2, verbatim. */
const NUMERIC_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Parse one raw CSV cell as a number, applying the sentinel-to-null rules.
 *
 * Throws on anything that is neither a recognized sentinel nor a valid
 * number — the dataset has already been verified to contain no other junk
 * in the numeric columns we read (see DATA-SPEC.md §2), so an unexpected
 * value here means either the source CSV changed or a column was
 * misclassified as numeric. Fail loudly rather than silently coercing to
 * `null` and hiding a data-quality regression.
 */
export function parseNumericCell(raw: string, context?: string): number | null {
  const trimmed = raw.trim();
  if (NUMERIC_SENTINELS.has(trimmed.toLowerCase())) {
    return null;
  }
  if (!NUMERIC_PATTERN.test(trimmed)) {
    const where = context ? ` in ${context}` : "";
    throw new Error(`parseNumericCell: unparseable numeric value ${JSON.stringify(raw)}${where}`);
  }
  return Number(trimmed);
}

/**
 * Non-breaking space (U+00A0), built from its code point instead of a
 * regex/string escape so it can't be silently mis-typed as (or confused
 * with) an ordinary space.
 */
const NON_BREAKING_SPACE = String.fromCharCode(160);

/**
 * Zero-width and invisible formatting characters that must be removed
 * outright rather than turned into spaces.
 *
 * The source CSV carries `U+FEFF` (zero-width no-break space) *inside* three
 * polymer names and several notes — 40 cells in all, e.g.
 * `"poly <U+FEFF>N-(2-methoxylethyl)glycine"`. Because it has zero width it
 * survives `trim()` and is invisible in every editor, but it still breaks
 * exact matching: a user typing that polymer's name would never match the
 * stored value, and the same name pasted from two sources would compare
 * unequal. Stripping is correct here — unlike NBSP, these characters are not
 * standing in for a space.
 */
const ZERO_WIDTH = new RegExp(
  "[" + [0xfeff, 0x200b, 0x200c, 0x200d, 0x2060].map((c) => String.fromCharCode(c)).join("") + "]",
  "g",
);

/** Remove zero-width/invisible formatting characters. Exported so the build
 *  script cleans the downloadable CSV the same way the app cleans cells. */
export function stripZeroWidth(value: string): string {
  return value.replace(ZERO_WIDTH, "");
}

/**
 * Parse one raw CSV cell as text: normalize stray non-breaking spaces to
 * regular spaces (a handful leak into the `Reference` column from
 * copy-pasted citations — see the mojibake repair in `scripts/build-data.ts`),
 * strip zero-width characters, collapse the resulting whitespace runs, trim,
 * and treat empty as `null`. Sentinels like `none`/`na` are NOT special-cased
 * here — for text/categorical columns they are real values (`crystalline?`
 * uses the literal category `"na"`).
 */
export function parseTextCell(raw: string): string | null {
  const cleaned = raw
    .replaceAll(NON_BREAKING_SPACE, " ")
    .replace(ZERO_WIDTH, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned === "" ? null : cleaned;
}
