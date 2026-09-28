/**
 * Cell-value display formatting for the data table. Display only: CSV
 * export (`./csv.ts`) writes the raw `CellValue` straight through `@/lib/
 * csv-export`, so the exported figure's precision is never lossy just
 * because the table rounds it for on-screen readability.
 */
import type { CellValue } from "@/data";

/** Shown for a missing cell on screen. A missing value in an exported CSV
 *  is simply an empty field — this glyph is never written to a CSV. */
export const EMPTY_CELL_TEXT = "—";

/**
 * Pretty-print a number for on-screen display. Very small/large magnitudes
 * — conductivity reaches 6.79e-11 (DATA-SPEC.md §3) — switch to exponential
 * notation with 3 significant figures, matching the style DATA-SPEC.md
 * itself uses; everything else rounds to at most 4 significant digits.
 * Integers (row counts, temperatures) print with no decimal point at all.
 */
export function formatNumber(value: number): string {
  if (Number.isInteger(value)) return value.toString();

  const magnitude = Math.abs(value);
  if (magnitude < 1e-3 || magnitude >= 1e6) {
    const [mantissa, exponent] = value.toExponential(2).split("e");
    return `${mantissa}e${exponent.replace("+", "")}`;
  }

  // Round-tripping through Number() un-does toPrecision's own occasional
  // switch to exponential form (e.g. (168000).toPrecision(4) === "1.680e+5"),
  // since plain Number#toString only goes exponential far outside this
  // function's already-carved-out small/large ranges.
  return Number(value.toPrecision(4)).toString();
}

/** Display text for any cell value — the one place `null` becomes visible
 *  UI (`EMPTY_CELL_TEXT`) rather than a stray "null" or empty string. */
export function formatCellValue(value: CellValue): string {
  if (value == null) return EMPTY_CELL_TEXT;
  return typeof value === "number" ? formatNumber(value) : value;
}
