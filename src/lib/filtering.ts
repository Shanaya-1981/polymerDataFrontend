/**
 * Multi-select, multi-column filtering.
 *
 * The original only ever allowed a single column with a single selected
 * value (`prefiltervis` / `prefilter` in `ui-controls.json`). We generalize
 * to any number of columns, each with any number of selected values:
 * **AND across columns, OR within a column** — e.g. `Anion ∈ {TFSI, ClO4}
 * AND "Solvent used" ∈ {water}` keeps a row if its anion is either TFSI or
 * ClO4, and its solvent is water.
 *
 * An empty selection list for a column means "no constraint from this
 * column" (not "match nothing") — that's what makes an all-empty
 * `FilterSelections` a no-op that keeps every row, matching the "None"
 * default in `ui-controls.json`.
 */

/** columnId -> selected values (OR'd together); an absent/empty entry imposes no constraint. */
export type FilterSelections = Readonly<Record<string, readonly string[]>>;

/**
 * Does one row (given as columnId -> value for just the filterable columns)
 * satisfy every active filter?
 */
export function matchesFilters(
  row: Readonly<Record<string, string | null>>,
  filters: FilterSelections,
): boolean {
  for (const columnId in filters) {
    const selected = filters[columnId];
    if (!selected || selected.length === 0) continue;
    const value = row[columnId];
    if (value == null || !selected.includes(value)) return false;
  }
  return true;
}

/**
 * Compute matching row indices directly against columnar data (the shape
 * `dataset.json` and `categories.json` are already in), so callers never
 * need to materialize array-of-object rows just to filter.
 *
 * @param rowCount total number of rows in the columnar dataset
 * @param columns columnId -> that column's full value array (length `rowCount`)
 */
export function filterRowIndices(
  rowCount: number,
  columns: Readonly<Record<string, readonly (string | null)[]>>,
  filters: FilterSelections,
): number[] {
  const activeColumns = Object.entries(filters)
    .filter(([, selected]) => selected.length > 0)
    .map(([columnId, selected]) => [columnId, new Set(selected)] as const);

  if (activeColumns.length === 0) {
    return Array.from({ length: rowCount }, (_, i) => i);
  }

  const kept: number[] = [];
  for (let row = 0; row < rowCount; row++) {
    const passes = activeColumns.every(([columnId, selectedSet]) => {
      const value = columns[columnId]?.[row] ?? null;
      return value != null && selectedSet.has(value);
    });
    if (passes) kept.push(row);
  }
  return kept;
}
