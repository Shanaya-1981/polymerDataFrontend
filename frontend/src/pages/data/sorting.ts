/**
 * Column sort for the data table: a pure comparator plus a function that
 * sorts row indices by looking values up through a callback, so callers
 * never have to materialize a parallel array just to sort it.
 */
import type { CellValue } from "@/data";

export type SortDirection = "asc" | "desc";

/**
 * Compare two cell values for one column's sort. Nulls always sort to the
 * end, in BOTH directions — a missing value is not "smaller than
 * everything", so flipping to descending must not surface it first just
 * because descending usually reverses the order.
 *
 * Numbers compare numerically. Everything else compares as case-insensitive,
 * numeric-aware text (`localeCompare` with `numeric: true`, so e.g.
 * "Comonomer2" sorts before "Comonomer10" rather than after it
 * lexicographically).
 */
export function compareValues(a: CellValue, b: CellValue, direction: SortDirection): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  const ascending =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });

  return direction === "asc" ? ascending : -ascending;
}

/**
 * Sort a set of row indices by one column's values, looked up through
 * `getValue` for each index. Stable (relies on the ES2019 sort-stability
 * guarantee all our supported engines implement), so rows that tie on the
 * sort column keep their prior relative order — which, with no sort applied
 * at all, is the dataset's original row order.
 */
export function sortRowIndices(
  rowIndices: readonly number[],
  getValue: (rowIndex: number) => CellValue,
  direction: SortDirection,
): number[] {
  return [...rowIndices].sort((a, b) => compareValues(getValue(a), getValue(b), direction));
}
