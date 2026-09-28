/**
 * Categorical chart palette — typed mirror of the `--chart-1` … `--chart-7`
 * and `--chart-other` custom properties defined in `src/styles/theme.css`.
 * Each slot has a paired light/dark hex that swaps automatically via the
 * `.dark` class on `<html>`.
 *
 * Prefer the `cssVar` form in rendered chart output so colors stay
 * theme-reactive with zero JS on theme change. Use `light`/`dark` only where a
 * CSS variable can't be consumed directly (canvas/WebGL fills, exported
 * images, non-DOM renderers) — keep them in sync with theme.css.
 *
 * ## Validation — computed, not eyeballed
 *
 * Derived by searching the OKLCH gamut and scoring against the dataviz skill's
 * `validate_palette.js` (OKLab ΔE, Machado-Oliveira-Fernandes CVD simulation).
 * These 7 hues PASS every hard check under the strict `--pairs all` criterion
 * in BOTH light and dark:
 *
 * ```
 * LIGHT  --pairs all : CVD ΔE 8.2 · normal ΔE 17.2 · ALL CHECKS PASS
 * DARK   --pairs all : CVD ΔE 9.9 · normal ΔE 18.6 · ALL CHECKS PASS
 * ```
 *
 * `--pairs all` is the criterion this app needs: the primary view is a scatter
 * plot, where any two categories can land next to each other, unlike bars or
 * stacked lines where only legend-neighbors touch.
 *
 * **7 is the computed maximum, not a guess.** Joint light+dark margins from the
 * search (≥ 1.0 passes): N=6 → 1.29, N=7 → 1.03, N=8 → 0.96, N≥9 worse. Dark is
 * the binding constraint — its lightness band is L ∈ [0.48, 0.67] versus
 * light's [0.43, 0.77], so hues must separate on hue and chroma alone.
 *
 * For scale: the dataviz skill's own 8-hue reference palette clears all-pairs
 * for only its first 3 slots. Re-ordering never helps (the all-pairs pairlist
 * is order-independent) — re-*choosing* the hues is what buys the extra slots.
 *
 * ## More categories than slots
 *
 * The dataset exceeds 7 in several columns (12 anions, 14 solvents, 24 polymer
 * families, 65 DOIs, 78 polymers). The rule is **fold, never cycle**:
 *
 * 1. The 7 most frequent categories — ranked once over the FULL dataset, never
 *    over the filtered view — take slots 1–7 in that fixed order.
 * 2. Everything else renders in `OTHER_SLOT`, a desaturated gray that is
 *    deliberately recessive. It is not an 8th hue.
 * 3. Never synthesize an 8th+ hue at runtime (HSL rotation and friends) and
 *    never recycle slots 1–7 for a second group of categories. An unvalidated
 *    hue will collide with an existing slot under CVD.
 * 4. Let the user promote a specific category into a hue slot, so a researcher
 *    studying a rare anion isn't stuck reading it as "Other".
 *
 * Because ranking is global and frozen, filtering never repaints the surviving
 * series — a category keeps its color for the whole session.
 *
 * ## Secondary encoding is mandatory on scatter
 *
 * Light-mode CVD ΔE is 8.2, only just past the 8.0 target, so identity must not
 * rest on hue alone. Pair every color with `SERIES_SYMBOLS[i]` on point marks.
 * This also makes the chart readable in grayscale print. A legend is always
 * present, hover tooltips always name the category in text, and `/data` is the
 * table view that discharges the validator's contrast WARN.
 *
 * ## Continuous data
 *
 * This palette is for categories only. Numeric color needs a single-hue
 * sequential ramp with a colorbar; the correlation matrix is polarity data and
 * needs a diverging scale with a neutral midpoint pinned at 0. Never a rainbow.
 */

export interface ChartPaletteSlot {
  /** 1-based slot number; matches the `--chart-N` custom property suffix. */
  index: number;
  /** `var(--chart-N)` — use this in rendered output so theme swaps "just work". */
  cssVar: string;
  /** Resolved light-mode hex. Keep in sync with `theme.css`. */
  light: string;
  /** Resolved dark-mode hex. Keep in sync with `theme.css`. */
  dark: string;
}

/**
 * The 7 categorical hues, in fixed assignment order. Validated as a set —
 * re-run `validate_palette.js --pairs all` in both modes before changing any
 * value, and do not add an 8th.
 */
export const CHART_PALETTE: readonly ChartPaletteSlot[] = [
  { index: 1, cssVar: "var(--chart-1)", light: "#e2276c", dark: "#de2269" },
  { index: 2, cssVar: "var(--chart-2)", light: "#0c3dc9", dark: "#1a4eda" },
  { index: 3, cssVar: "var(--chart-3)", light: "#29b1c5", dark: "#24a0b2" },
  { index: 4, cssVar: "var(--chart-4)", light: "#8c59f3", dark: "#9870f7" },
  { index: 5, cssVar: "var(--chart-5)", light: "#8a5512", dark: "#c67c1f" },
  { index: 6, cssVar: "var(--chart-6)", light: "#82138c", dark: "#9618a2" },
  { index: 7, cssVar: "var(--chart-7)", light: "#8c941f", dark: "#606612" },
] as const;

/**
 * Reserved bucket for every category beyond the top 7. Intentionally
 * low-chroma so folded categories recede behind the named ones — it is a
 * non-answer, not an 8th series.
 */
export const OTHER_SLOT = {
  cssVar: "var(--chart-other)",
  light: "#9a9a94",
  dark: "#6b6b66",
} as const;

/**
 * Marker for user-imported rows overlaid on the Explore scatter. Not a
 * categorical slot and not an 8th hue: it marks provenance ("this point is
 * yours, not the literature's"), so it deliberately sits outside the 7-hue
 * set and pairs with a symbol no slot uses (`star`).
 *
 * Checked with `validate_palette.js --pairs all` as an 8th entry against
 * each mode's 7 hues: it leaves the set's worst pairs unchanged (light CVD
 * ΔE 8.2 / normal 17.2, dark 9.9 / 18.6), so it collides with none of them.
 * It fails only the lightness band, by design — it is meant to pop — and in
 * light mode sits at 1.79:1 against the white surface, which is what the
 * near-black `outline` is for.
 */
export const IMPORTED_SLOT = {
  light: "#f5b800",
  dark: "#facc15",
  outlineLight: "#18181b",
  outlineDark: "#0a0a0b",
  symbol: "star",
} as const;

/** Maximum number of categories that can carry a distinct hue. */
export const MAX_CATEGORICAL_SLOTS = CHART_PALETTE.length;

/** `["var(--chart-1)", ...]` — ready to hand to a chart library's color range. */
export const CHART_COLOR_VARS: readonly string[] = CHART_PALETTE.map((slot) => slot.cssVar);

/**
 * Plotly marker symbols paired 1:1 with the hue slots, as the required
 * secondary encoding on point marks. Index 7 is the "Other" bucket.
 */
export const SERIES_SYMBOLS: readonly string[] = [
  "circle",
  "square",
  "diamond",
  "triangle-up",
  "cross",
  "triangle-down",
  "x",
  "circle-open",
] as const;

/**
 * Resolve a category's position in the frozen global ranking to its color and
 * marker symbol. Ranks at or beyond {@link MAX_CATEGORICAL_SLOTS} fold into
 * "Other" rather than cycling.
 *
 * @param rank 0-based index into the canonical, dataset-wide category order.
 */
export function slotForRank(rank: number): { color: string; symbol: string; isOther: boolean } {
  const isOther = rank < 0 || rank >= MAX_CATEGORICAL_SLOTS;
  return {
    color: isOther ? OTHER_SLOT.cssVar : CHART_PALETTE[rank].cssVar,
    symbol: SERIES_SYMBOLS[isOther ? MAX_CATEGORICAL_SLOTS : rank],
    isOther,
  };
}
