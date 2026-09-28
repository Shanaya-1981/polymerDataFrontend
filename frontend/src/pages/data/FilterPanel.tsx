import { Button, Label, MultiSelect } from "@/components/ui";
import { categoryOrder, ROW_COUNT, type FrozenCategoryColumnId } from "@/data";
import type { FilterSelections } from "@/lib/filtering";
import { columnLabel, shortenDoi } from "./columns";
import { FILTERABLE_COLUMN_IDS } from "./table-state";

export interface FilterPanelProps {
  filters: FilterSelections;
  onChange: (columnId: FrozenCategoryColumnId, values: string[]) => void;
  onClearAll: () => void;
  /** Rows currently matching every active filter (search not included), out
   *  of `ROW_COUNT`. */
  matchedCount: number;
}

/**
 * The same six combinable category filters as `/explore` — AND across
 * columns, OR within a column (`@/lib/filtering`) — laid out as a responsive
 * grid rather than a sidebar, since this page has no chart competing for
 * width. A separate implementation from `explore/FilterPanel.tsx` by design;
 * see `src/pages/data/columns.ts`'s header comment on the file-ownership
 * split between the two pages.
 */
export function FilterPanel({ filters, onChange, onClearAll, matchedCount }: FilterPanelProps) {
  const hasActiveFilters = FILTERABLE_COLUMN_IDS.some((id) => (filters[id]?.length ?? 0) > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-primary">Filters</h3>
        {/* "Clear all filters" (not "Clear all"): `MultiSelect` already uses
            "Clear all" for its own per-column chip row, so this needs a
            distinct name for both screen readers and `getByRole` queries. */}
        <Button variant="ghost" size="sm" onClick={onClearAll} disabled={!hasActiveFilters}>
          Clear all filters
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FILTERABLE_COLUMN_IDS.map((columnId) => {
          const label = columnLabel(columnId);
          const options = categoryOrder(columnId).map((value) => ({
            value,
            label: columnId === "doi" ? shortenDoi(value) : value,
          }));
          return (
            <div key={columnId} className="flex flex-col gap-1.5">
              <Label htmlFor={`data-filter-${columnId}`}>{label}</Label>
              <MultiSelect
                id={`data-filter-${columnId}`}
                aria-label={label}
                options={options}
                values={filters[columnId] ?? []}
                onChange={(values) => onChange(columnId, values)}
                placeholder="Any value"
                searchPlaceholder="Search…"
              />
            </div>
          );
        })}
      </div>

      <p className="border-t border-subtle pt-3 text-sm text-secondary">
        <span className="font-medium text-primary">{matchedCount}</span> of {ROW_COUNT} rows match
      </p>
    </div>
  );
}
