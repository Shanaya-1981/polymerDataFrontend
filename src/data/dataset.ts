/**
 * Typed accessor layer over `generated/dataset.json`.
 *
 * The data is static and small (655 rows), so this is deliberately just a
 * plain import plus a few derived selectors — no data-fetching library, no
 * async state. Row-oriented views are the one non-trivial derived value
 * (the source is columnar for compact storage/transfer), so `getRows` and
 * `getRow` memoize their result the first time they're called.
 */
import datasetJson from "./generated/dataset.json";
import type { CategoricalColumnId, ColumnId, NumericColumnId } from "./generated/columns";
import { filterRowIndices, type FilterSelections } from "@/lib/filtering";

interface DatasetJsonShape {
  readonly rowCount: number;
  readonly rowIndex: readonly number[];
  readonly numeric: Readonly<Record<NumericColumnId, ReadonlyArray<number | null>>>;
  readonly categorical: Readonly<Record<CategoricalColumnId, ReadonlyArray<string | null>>>;
}

const dataset = datasetJson as DatasetJsonShape;

export const ROW_COUNT = dataset.rowCount;

/** The full value array for one numeric column, in row order. */
export function numericColumn(id: NumericColumnId): readonly (number | null)[] {
  return dataset.numeric[id];
}

/** The full value array for one categorical column, in row order. */
export function categoricalColumn(id: CategoricalColumnId): readonly (string | null)[] {
  return dataset.categorical[id];
}

export type CellValue = number | string | null;

/** One row, keyed by column id — the shape a table view or CSV export wants. */
export type Row = Readonly<Record<ColumnId, CellValue>> & { readonly rowIndex: number };

let rowsCache: readonly Row[] | null = null;

/** Materialize array-of-object rows from the columnar storage, once, and cache the result. */
export function getRows(): readonly Row[] {
  if (rowsCache) return rowsCache;

  const numericIds = Object.keys(dataset.numeric) as NumericColumnId[];
  const categoricalIds = Object.keys(dataset.categorical) as CategoricalColumnId[];

  const rows: Row[] = [];
  for (let i = 0; i < dataset.rowCount; i++) {
    const row: Record<string, CellValue> = { rowIndex: i };
    for (const id of numericIds) row[id] = dataset.numeric[id][i];
    for (const id of categoricalIds) row[id] = dataset.categorical[id][i];
    rows.push(row as Row);
  }

  rowsCache = rows;
  return rows;
}

export function getRow(rowIndex: number): Row {
  const rows = getRows();
  const row = rows[rowIndex];
  if (!row) throw new Error(`getRow: no row at index ${rowIndex} (dataset has ${rows.length} rows)`);
  return row;
}

/**
 * Row indices matching a set of multi-select category filters (AND across
 * columns, OR within a column — see `@/lib/filtering`). An empty/absent
 * `filters` object matches every row.
 */
export function filterRows(filters: FilterSelections): number[] {
  return filterRowIndices(dataset.rowCount, dataset.categorical, filters);
}

export * from "./generated/columns";
