/**
 * Categorical chart palette — typed mirror of the `--chart-1` … `--chart-12`
 * custom properties defined in `src/styles/theme.css`. Each slot has a paired
 * light/dark hex that swaps automatically via the `.dark` class on `<html>`.
 *
 * Prefer the `var` (CSS `var(--chart-N)`) form in rendered chart output so
 * colors stay theme-reactive with zero JS on theme change. Use `light`/`dark`
 * only where a CSS variable can't be consumed directly (canvas/WebGL fills,
 * exported/downloaded images, non-DOM renderers) — keep them in sync with
 * theme.css if a slot ever changes.
 *
 * ## Validation
 * Colors were chosen and verified with the dataviz skill's method: fixed hue
 * order, OKLCH lightness-band + chroma-floor checks, and CVD separation under
 * Machado-Oliveira-Fernandes (2009) protanopia/deuteranopia simulation at
 * severity 1.0, plus an unsimulated "normal vision" floor — computed with
 * `validate_palette.js`, not eyeballed.
 *
 * - All 12 slots, in this fixed order, PASS every check for *adjacent* pairs
 *   (legends, bars, stacked lines, chips, i.e. only neighbors in a fixed,
 *   never-recycled assignment touch) in BOTH light and dark.
 * - Slots 1–4 (`allPairsSafe: true`) additionally pass the stricter
 *   *all-pairs* check, safe for scatter/bubble/choropleth/small-multiples
 *   forms where any two categories can end up visually adjacent regardless
 *   of assignment order.
 * - This 4-slot all-pairs cap is a hard colorimetry limit, not an oversight:
 *   the dataviz skill's own 8-hue reference palette clears all-pairs for
 *   only its first 3 slots. Packing 12 mutually CVD-distinct hues into one
 *   perceptually-uniform lightness band leaves no room for more; no
 *   re-ordering fixes it. If a chart shows more than ~4 categories at once
 *   in an all-pairs-risk form, add the secondary encoding described below.
 *
 * ## Fallback strategy for >12 categories
 * The dataset has up to 24 polymer families (only 12 anions, which fit
 * directly). When a view needs more than 12 simultaneous categories:
 *
 * 1. Prefer NOT color-encoding all of them at once — fold the long tail into
 *    an explicit "Other" bucket (render it with `text-secondary` /
 *    `border-default`, not a chart hue), or facet/small-multiple instead of
 *    minting a 13th+ hue.
 * 2. If every category must stay individually addressable, cycle these same
 *    12 hues with a SECOND encoding channel so a repeat is never mistaken
 *    for its first pass:
 *    - a distinct marker shape per cycle (circle / square / triangle /
 *      diamond / …) for scatter points;
 *    - a stroke-dash pattern per cycle for lines;
 *    - a lightness/opacity step per cycle (e.g. cycle 2 = 70% fill opacity)
 *      — the weakest signal; pair it with direct labels or a togglable
 *      legend, never ship it alone.
 *    Never synthesize a 13th+ hue at runtime (e.g. HSL rotation) — it will
 *    not have been validated and will likely collide with an existing slot
 *    under color-vision deficiency.
 * 3. Always ship a non-color relief once many categories are visible at
 *    once: a legend (mandatory for 2+ series regardless of count), direct
 *    labels where the count is small, and/or a table view. Identity should
 *    never rest on hue alone past a handful of simultaneously-visible
 *    categories — see `references/anti-patterns.md` in the dataviz skill.
 */

export interface ChartPaletteSlot {
  /** 1-based slot number; matches the `--chart-N` custom property suffix. */
  index: number;
  /** `var(--chart-N)` — use this in rendered output so theme swaps "just work". */
  cssVar: string;
  /** Resolved light-mode hex. Keep in sync with `theme.css`'s `@theme` block. */
  light: string;
  /** Resolved dark-mode hex. Keep in sync with `theme.css`'s `.dark` block. */
  dark: string;
  /** True for the leading slots that also clear the stricter *all-pairs*
   *  CVD floor (safe for scatter/bubble/small-multiples), not just the
   *  *adjacent* floor that all 12 slots clear. */
  allPairsSafe: boolean;
}

export const CHART_PALETTE: readonly ChartPaletteSlot[] = [
  { index: 1, cssVar: "var(--chart-1)", light: "#31cc3f", dark: "#26a832", allPairsSafe: true },
  { index: 2, cssVar: "var(--chart-2)", light: "#30bddb", dark: "#269cb5", allPairsSafe: true },
  { index: 3, cssVar: "var(--chart-3)", light: "#d52ef6", dark: "#d22bf2", allPairsSafe: true },
  { index: 4, cssVar: "var(--chart-4)", light: "#f82d89", dark: "#f42a86", allPairsSafe: true },
  { index: 5, cssVar: "var(--chart-5)", light: "#2db2f8", dark: "#2596d2", allPairsSafe: false },
  { index: 6, cssVar: "var(--chart-6)", light: "#f72d4f", dark: "#f72a4e", allPairsSafe: false },
  { index: 7, cssVar: "var(--chart-7)", light: "#1e7ef5", dark: "#1f7ef5", allPairsSafe: false },
  { index: 8, cssVar: "var(--chart-8)", light: "#f75a23", dark: "#e85520", allPairsSafe: false },
  { index: 9, cssVar: "var(--chart-9)", light: "#31c4ae", dark: "#26a18f", allPairsSafe: false },
  { index: 10, cssVar: "var(--chart-10)", light: "#6b24f1", dark: "#6b24f2", allPairsSafe: false },
  { index: 11, cssVar: "var(--chart-11)", light: "#b4b12b", dark: "#949121", allPairsSafe: false },
  { index: 12, cssVar: "var(--chart-12)", light: "#f62dc4", dark: "#e829b9", allPairsSafe: false },
] as const;

/** `["var(--chart-1)", ...]` — handy as a `range()`/`scale` input for most chart libs. */
export const CHART_COLOR_VARS: readonly string[] = CHART_PALETTE.map((slot) => slot.cssVar);

/** The 4 slots verified safe even when any two categories can sit side by side. */
export const ALL_PAIRS_SAFE_CHART_VARS: readonly string[] = CHART_PALETTE.filter(
  (slot) => slot.allPairsSafe,
).map((slot) => slot.cssVar);
