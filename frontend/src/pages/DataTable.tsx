import { useId, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, Notice } from "@/components/ui";
import { filterRows, getRows, ROW_COUNT } from "@/data";
import { buildFilteredCsv, downloadCsv } from "./data/csv";
import { FilterPanel } from "./data/FilterPanel";
import { PaginationControls } from "./data/PaginationControls";
import { paginate } from "./data/pagination";
import { RowsTable } from "./data/RowsTable";
import { matchesSearch } from "./data/search";
import { sortRowIndices } from "./data/sorting";
import { FILTERABLE_COLUMN_IDS, useDataTableState } from "./data/table-state";
import { Toolbar } from "./data/Toolbar";

/** Ships unmodified at this path — see DATA-SPEC.md and the wave brief.
 *  Linked directly rather than regenerated: the typed data layer this page
 *  otherwise reads from only carries 69 of the source CSV's 305 columns. */
const FULL_DATASET_HREF = "/data/polymer-electrolyte-dataset.csv";

/**
 * The dataset browser — the answer to "I see a dot on a plot, what actually
 * is it?", and the accessible, non-color-dependent fallback the rest of the
 * app's chart-color rules require. New relative to the original site, which
 * had no way to see the underlying data at all.
 *
 * Composition mirrors `/explore`'s split (controls + a memoized data
 * pipeline + a results view): `useDataTableState` owns the URL-backed
 * control surface, this component threads filtered → searched → sorted →
 * paginated row indices through one `useMemo` chain, and `Toolbar`/
 * `FilterPanel`/`RowsTable`/`PaginationControls` are pure presentation.
 */
export default function DataTable() {
  const {
    resolved,
    setSearch,
    setSort,
    setPage,
    setPageSize,
    setColumns,
    setFilter,
    clearAllFilters,
    isAtDefaults,
    resetToDefaults,
  } = useDataTableState();
  const [filtersOpen, setFiltersOpen] = useState(() =>
    FILTERABLE_COLUMN_IDS.some((id) => (resolved.filters[id]?.length ?? 0) > 0),
  );
  const statusId = useId();

  // `getRows()` memoizes internally (see `@/data/dataset`); wrapping it here
  // too just avoids re-reading that cache's reference on every render.
  const allRows = useMemo(() => getRows(), []);

  const filteredIndices = useMemo(() => {
    const byColumnFilters = filterRows(resolved.filters);
    const query = resolved.search;
    if (!query.trim()) return byColumnFilters;
    return byColumnFilters.filter((rowIndex) => matchesSearch(allRows[rowIndex], query));
  }, [allRows, resolved.filters, resolved.search]);

  const sortedIndices = useMemo(() => {
    const columnId = resolved.sortColumn;
    if (!columnId) return filteredIndices;
    return sortRowIndices(
      filteredIndices,
      (rowIndex) => allRows[rowIndex][columnId],
      resolved.sortDirection,
    );
  }, [filteredIndices, allRows, resolved.sortColumn, resolved.sortDirection]);

  const pageInfo = useMemo(
    () => paginate(sortedIndices.length, resolved.page, resolved.pageSize),
    [sortedIndices.length, resolved.page, resolved.pageSize],
  );

  const visibleRows = useMemo(
    () => sortedIndices.slice(pageInfo.startIndex, pageInfo.endIndex).map((i) => allRows[i]),
    [sortedIndices, pageInfo.startIndex, pageInfo.endIndex, allRows],
  );

  const activeFilterCount = FILTERABLE_COLUMN_IDS.filter(
    (id) => (resolved.filters[id]?.length ?? 0) > 0,
  ).length;
  const hasNarrowedResults = resolved.search.trim().length > 0 || activeFilterCount > 0;
  const canExport = sortedIndices.length > 0 && resolved.visibleColumns.length > 0;

  function handleExportFiltered() {
    const exportRows = sortedIndices.map((i) => allRows[i]);
    const csv = buildFilteredCsv(resolved.visibleColumns, exportRows);
    downloadCsv("polymer-electrolyte-filtered.csv", csv);
  }

  function handleClearNarrowing() {
    setSearch("");
    clearAllFilters();
  }

  return (
    <>
      <PageHeader
        title="Data"
        description="Browse, search, sort, and export every row of the polymer electrolyte dataset."
      />

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          {/* "Reset to defaults" (not "Clear all filters", inside FilterPanel
              below): this also resets search, sort, page, page size, and
              visible columns, not just the filters — a broader action that
              needs a name distinct enough neither screen readers nor
              `getByRole` queries can confuse the two. */}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={resetToDefaults}
            disabled={isAtDefaults}
          >
            Reset to defaults
          </Button>

          <Toolbar
            search={resolved.search}
            onSearchChange={setSearch}
            visibleColumns={resolved.visibleColumns}
            onColumnsChange={setColumns}
            filtersOpen={filtersOpen}
            onToggleFilters={() => setFiltersOpen((open) => !open)}
            activeFilterCount={activeFilterCount}
            searchDescribedBy={statusId}
          />

          {filtersOpen ? (
            <Card id="data-filter-panel" className="p-4 sm:p-5">
              <FilterPanel
                filters={resolved.filters}
                onChange={setFilter}
                onClearAll={clearAllFilters}
                matchedCount={filteredIndices.length}
              />
            </Card>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p id={statusId} role="status" aria-live="polite" className="text-sm text-muted">
              Showing{" "}
              <span className="font-medium text-primary">
                {pageInfo.startDisplay}–{pageInfo.endDisplay}
              </span>{" "}
              of <span className="font-medium text-primary">{sortedIndices.length}</span> rows
              {sortedIndices.length !== ROW_COUNT ? ` (filtered from ${ROW_COUNT})` : ""}.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportFiltered}
                disabled={!canExport}
              >
                Export view (CSV)
              </Button>
              <a
                href={FULL_DATASET_HREF}
                download
                className="inline-flex h-8 items-center rounded-md border border-default px-3 text-sm font-medium text-primary transition-colors hover:bg-muted"
              >
                Full dataset (305 cols, CSV)
              </a>
            </div>
          </div>
        </div>

        {sortedIndices.length === 0 ? (
          <Notice tone="info" title="No rows match">
            <div className="flex flex-col gap-3">
              <p>
                {hasNarrowedResults
                  ? "No rows match the current search and filters."
                  : "No rows to show."}
              </p>
              {hasNarrowedResults ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  onClick={handleClearNarrowing}
                >
                  Clear search and filters
                </Button>
              ) : null}
            </div>
          </Notice>
        ) : (
          <>
            <RowsTable
              columns={resolved.visibleColumns}
              rows={visibleRows}
              sortColumn={resolved.sortColumn}
              sortDirection={resolved.sortDirection}
              onSort={setSort}
            />
            {resolved.visibleColumns.length === 0 ? (
              <p className="text-sm text-muted">
                No columns selected — use the Columns picker above to add some.
              </p>
            ) : null}
            <PaginationControls
              page={pageInfo.page}
              totalPages={pageInfo.totalPages}
              pageSize={resolved.pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </div>
    </>
  );
}
