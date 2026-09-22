/**
 * CSV export for the `/data` page's "current view" download — the filtered
 * (and searched) rows, restricted to the currently visible columns, in the
 * current sort order. Serialization itself is `@/lib/csv-export`'s `toCsv`;
 * this module only decides *which* headers/cells go in, plus the one
 * DOM-touching step (triggering the browser download) that module's own
 * doc comment leaves to its caller.
 *
 * The complete 305-column dataset is a separate, deliberately unrelated
 * path: it's the static asset at `public/data/polymer-electrolyte-dataset.
 * csv` (linked directly from `DataTable.tsx`), not something this module
 * generates — the typed data layer only carries 69 of the 305 source
 * columns (see the wave report for why), so a true 305-column export could
 * not be built from `Row` even if we wanted to regenerate it here.
 */
import { toCsv } from "@/lib/csv-export";
import type { CellValue, ColumnId, Row } from "@/data";
import { columnHeading } from "./columns";

/** Build the exportable CSV for the given columns (in the given order) over
 *  the given rows. Both are caller-supplied so this stays pure and testable
 *  — `DataTable.tsx` passes the full filtered+sorted row set, never just the
 *  current page. */
export function buildFilteredCsv(
  visibleColumnIds: readonly ColumnId[],
  rows: readonly Row[],
): string {
  const headers = visibleColumnIds.map(columnHeading);
  const cells: CellValue[][] = rows.map((row) => visibleColumnIds.map((id) => row[id]));
  return toCsv(headers, cells);
}

/**
 * Trigger a client-side download of a CSV string. All side effect and not
 * meaningfully unit-testable (see `@/lib/csv-export`'s own doc comment on
 * this exact split), so it's kept to this one small function with no
 * corresponding test in `csv.test.ts`.
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
