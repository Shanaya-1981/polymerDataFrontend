import type { ColumnMeta } from "@/data";

/**
 * A column's display name with its unit appended — for axis titles, table
 * headings, and anywhere else a column is named to a reader.
 *
 * The subtlety: `label` is the source CSV header kept verbatim (so the axis
 * pickers match the original site option-for-option), while `unit` is derived
 * from a trailing parenthetical in that same header. For nine of the 69
 * columns the two therefore overlap — `approxMW(kDa)` already carries
 * `unit: "kDa"`, and `VFT prefactor (S/cm*T^(1/2))` carries the whole
 * `S/cm*T^(1/2)`. Naively appending prints `approxMW(kDa) (kDa)`.
 *
 * Fixing it at the source would mean stripping the unit out of `label`, but
 * the labels are deliberately verbatim copies of the original's dropdown
 * options and are asserted as such, so the formatting has to absorb it.
 *
 * This lives here, shared, because `/explore` and `/data` both need it and
 * both independently grew a copy — one of which had the doubling bug. Caught
 * by rendering the page in a browser, not by the type checker or any test.
 */
export function columnDisplayName(meta: ColumnMeta | undefined, fallback: string): string {
  if (!meta) return fallback;
  if (!meta.unit) return meta.label;
  const suffix = `(${meta.unit})`;
  return meta.label.endsWith(suffix) ? meta.label : `${meta.label} ${suffix}`;
}
