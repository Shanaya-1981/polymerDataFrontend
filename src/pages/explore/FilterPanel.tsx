import { Button, Label, MultiSelect } from "@/components/ui";
import { categoryOrder, ROW_COUNT, type FrozenCategoryColumnId } from "@/data";
import type { FilterSelections } from "@/lib/filtering";
import { columnLabel, FILTERABLE_COLUMN_IDS, filterValueLabel } from "./columns";

export interface FilterPanelProps {
  filters: FilterSelections;
  onChange: (columnId: FrozenCategoryColumnId, values: string[]) => void;
  onClearAll: () => void;
  /** Rows currently matching every active filter, out of `ROW_COUNT`. */
  selectedCount: number;
}

/**
 * The combinable filter panel — this rebuild's deliberate upgrade over the
 * original's single-column, single-value `prefiltervis`. Each of the six
 * frozen categorical columns gets its own multi-select: OR within a column,
 * AND across columns (`@/lib/filtering`). Options are listed in each
 * column's frozen frequency order (`categoryOrder`), the same order that
 * drives its color assignment elsewhere on the page.
 */
export function FilterPanel({ filters, onChange, onClearAll, selectedCount }: FilterPanelProps) {
  const hasActiveFilters = FILTERABLE_COLUMN_IDS.some((id) => (filters[id]?.length ?? 0) > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-primary">Filters</h2>
        {/* "Clear all filters" (not "Clear all"): `MultiSelect` already uses
            "Clear all" for its own per-column chip row, so this needs a
            distinct name for both screen readers and `getByRole` queries. */}
        <Button variant="ghost" size="sm" onClick={onClearAll} disabled={!hasActiveFilters}>
          Clear all filters
        </Button>
      </div>

      {FILTERABLE_COLUMN_IDS.map((columnId) => {
        const label = columnLabel(columnId);
        const options = categoryOrder(columnId).map((value) => ({
          value,
          label: filterValueLabel(columnId, value),
        }));
        return (
          <div key={columnId} className="flex flex-col gap-1.5">
            <Label htmlFor={`explore-filter-${columnId}`}>{label}</Label>
            <MultiSelect
              id={`explore-filter-${columnId}`}
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

      <p className="border-t border-subtle pt-3 text-sm text-secondary">
        <span className="font-medium text-primary">{selectedCount}</span> of {ROW_COUNT} rows
        selected
      </p>
    </div>
  );
}
