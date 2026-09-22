/**
 * Control-state modeling for the Temperature page: which columns are valid
 * choices for the X-axis mode / "color by" control / multi-select filters,
 * plus guards that re-validate values coming back out of the URL.
 *
 * `useUrlState` (`@/lib/url-state`) does NOT validate a param against a
 * union — it only supplies the default when a key is *absent* from the URL.
 * A hand-edited link like `?mode=bogus` comes back out of the hook as the
 * literal string `"bogus"`, so every value read from URL state must be
 * re-checked with a guard below before it's trusted as a `TemperatureMode`
 * or `TemperatureColorColumn`.
 */
import type { RadioOption } from "@/components/ui";
import { COLUMN_BY_ID } from "@/data";
import { TEMPERATURE_MODES, type TemperatureMode } from "@/lib/transforms";

export const DEFAULT_TEMPERATURE_MODE: TemperatureMode = "Arrhenius";

export function isTemperatureMode(value: string): value is TemperatureMode {
  return (TEMPERATURE_MODES as readonly string[]).includes(value);
}

/** Canonical order from `@/lib/transforms` (matches DATA-SPEC.md §6's table
 *  order) — the "Controls" bullet in the page brief lists them in a
 *  different order, treated as incidental prose rather than a UI spec. */
export const TEMPERATURE_MODE_OPTIONS: readonly RadioOption[] = TEMPERATURE_MODES.map((mode) => ({
  value: mode,
  label: mode,
}));

/**
 * The 4 categorical columns offered as "color by" on this page.
 * CHART-PALETTE.md restricts color to categorical data here and calls out
 * `Polymer` (78 distinct) and `DOI` (65 distinct) as "near-useless as a
 * color encoding" — both are excluded here even though they're still valid
 * filters (see `TEMPERATURE_FILTER_COLUMN_IDS` below).
 */
export const TEMPERATURE_COLOR_COLUMN_IDS = [
  "polymerFamily",
  "anion",
  "crystalline",
  "solventUsed",
] as const;
export type TemperatureColorColumn = (typeof TEMPERATURE_COLOR_COLUMN_IDS)[number];

export const DEFAULT_TEMPERATURE_COLOR_COLUMN: TemperatureColorColumn = "anion";

export function isTemperatureColorColumn(value: string): value is TemperatureColorColumn {
  return (TEMPERATURE_COLOR_COLUMN_IDS as readonly string[]).includes(value);
}

export const TEMPERATURE_COLOR_COLUMN_OPTIONS: readonly RadioOption[] = TEMPERATURE_COLOR_COLUMN_IDS.map(
  (id) => ({ value: id, label: COLUMN_BY_ID[id].label }),
);

/**
 * The 5 combinable multi-select filters: DOI plus the same 4 categorical
 * columns offered for color. This is the "same upgrade as the sibling
 * explore page" the brief calls for — OR within a column, AND across
 * columns (`@/lib/filtering`) — versus the original's single
 * column/single-value `prefiltervis`.
 */
export const TEMPERATURE_FILTER_COLUMN_IDS = [
  "doi",
  "polymerFamily",
  "anion",
  "crystalline",
  "solventUsed",
] as const;
export type TemperatureFilterColumnId = (typeof TEMPERATURE_FILTER_COLUMN_IDS)[number];
