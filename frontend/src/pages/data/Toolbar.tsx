import { useId } from "react";
import { Button, Label, MultiSelect } from "@/components/ui";
import type { ColumnId } from "@/data";
import { ALL_COLUMN_OPTIONS } from "./columns";

export interface ToolbarProps {
  search: string;
  onSearchChange: (query: string) => void;
  visibleColumns: readonly ColumnId[];
  onColumnsChange: (ids: string[]) => void;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  activeFilterCount: number;
  /** Id of the live region announcing the result count, so the search box
   *  exposes it as an `aria-describedby` — a screen-reader user typing a
   *  query hears both the new letter and, via the description, where to
   *  find the updated count. */
  searchDescribedBy?: string;
}

/**
 * The page's primary control row: search, the column picker, and the
 * Filters disclosure toggle. Export actions live in `DataTable.tsx` next to
 * the result-count live region instead of here, since they act on the
 * result of these controls rather than being an input themselves.
 */
export function Toolbar({
  search,
  onSearchChange,
  visibleColumns,
  onColumnsChange,
  filtersOpen,
  onToggleFilters,
  activeFilterCount,
  searchDescribedBy,
}: ToolbarProps) {
  const searchId = useId();
  const columnsId = useId();

  // items-start, not items-end: the Columns block grows downward as chips are
  // added, and bottom-aligning would shove the search field down into the
  // middle of a column of empty space.
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-[220px]">
        <Label htmlFor={searchId}>Search</Label>
        <input
          id={searchId}
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search polymer, anion, notes, DOI…"
          aria-describedby={searchDescribedBy}
          className="h-9 w-full rounded-md border border-default bg-surface px-3 text-sm text-primary placeholder:text-muted"
        />
      </div>

      <div className="flex flex-col gap-1.5 sm:w-72">
        <Label htmlFor={columnsId}>Columns</Label>
        <MultiSelect
          id={columnsId}
          aria-label="Columns"
          options={ALL_COLUMN_OPTIONS}
          values={visibleColumns}
          onChange={onColumnsChange}
          placeholder="Choose columns"
          searchPlaceholder="Search columns…"
          maxVisibleChips={2}
        />
      </div>

      <Button
        variant="outline"
        aria-expanded={filtersOpen}
        aria-controls="data-filter-panel"
        onClick={onToggleFilters}
      >
        Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
      </Button>
    </div>
  );
}
