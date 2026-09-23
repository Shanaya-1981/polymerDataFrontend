import {
  cn,
  InfoTooltip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import type { ColumnId, Row } from "@/data";
import { columnHeading, getColumnMeta, shortenDoi } from "./columns";
import { formatCellValue } from "./format";
import type { SortDirection } from "./sorting";

export interface RowsTableProps {
  columns: readonly ColumnId[];
  rows: readonly Row[];
  sortColumn: ColumnId | null;
  sortDirection: SortDirection;
  onSort: (id: ColumnId) => void;
}

/** Free-form text columns long enough to need truncation (full value still
 *  reachable via the cell's `title`) rather than blowing out row height or
 *  column width — Reference reaches 324 characters in the real dataset. */
const LONG_TEXT_COLUMN_IDS = new Set<ColumnId>([
  "reference",
  "notes",
  "smilesDescriptor1",
  "smilesDescriptor2",
  "polymerFamily",
]);

const STICKY_HEADER_CLASSES = "sticky left-0 z-20 border-r border-subtle bg-surface-raised";
const STICKY_CELL_CLASSES =
  "sticky left-0 z-10 border-r border-subtle bg-surface group-hover:bg-muted/60";

/**
 * The dataset browser's `<table>`. Mobile-first hard case: this can show up
 * to 69 columns at once, so the shared `Table` primitive's own bounded,
 * horizontally-scrolling container (see its doc comment) is load-bearing
 * here rather than incidental. Within it, the leading "#" column — the
 * row's stable position in the untouched 655-row dataset, independent of
 * the current sort/filter/page — stays pinned via `sticky left-0` so a
 * reader scrolled right never loses track of which row they're looking at.
 *
 * Both the header's corner cell and each body row's first cell are
 * independently `sticky left-0`; the corner additionally inherits `sticky
 * top-0` from `TableHeader`, and its `z-20` (versus the body column's
 * `z-10`) keeps it painting above the body's sticky column during vertical
 * scroll, where the two would otherwise occupy the same screen position.
 */
export function RowsTable({ columns, rows, sortColumn, sortDirection, onSort }: RowsTableProps) {
  return (
    <Table className="max-h-[70vh]">
      <TableHeader>
        <TableRow>
          <TableHead className={STICKY_HEADER_CLASSES}>#</TableHead>
          {columns.map((id) => {
            const meta = getColumnMeta(id);
            const isNumeric = meta?.kind === "continuous";
            return (
              <TableHead
                key={id}
                sortDirection={sortColumn === id ? sortDirection : false}
                onSort={() => onSort(id)}
                className={isNumeric ? "text-right" : undefined}
                endAdornment={
                  meta?.description ? (
                    <InfoTooltip content={meta.description} label={`What is "${columnHeading(id)}"?`} />
                  ) : null
                }
              >
                {columnHeading(id)}
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.rowIndex} className="group">
            <TableCell className={cn(STICKY_CELL_CLASSES, "tabular text-secondary")}>
              {row.rowIndex + 1}
            </TableCell>
            {columns.map((id) => {
              const value = row[id];
              const isNumeric = getColumnMeta(id)?.kind === "continuous";
              return (
                <TableCell
                  key={id}
                  title={typeof value === "string" ? value : undefined}
                  className={cn(
                    isNumeric && "text-right tabular",
                    LONG_TEXT_COLUMN_IDS.has(id) && "max-w-[240px] truncate",
                  )}
                >
                  {id === "doi" && typeof value === "string" ? (
                    <a
                      href={value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent underline underline-offset-4 hover:text-accent-hover"
                    >
                      {shortenDoi(value)}
                    </a>
                  ) : (
                    formatCellValue(value)
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
