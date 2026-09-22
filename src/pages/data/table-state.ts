/**
 * The `/data` page's whole control surface — search, sort, page, page size,
 * visible columns, and every active filter — round-tripped through the URL
 * via `@/lib/url-state`'s `useUrlState`, so a particular table view (a
 * search term, a sort, a page, a chosen column set, active filters) is a
 * shareable link. Mirrors the param-naming and resolve/validate approach
 * `src/pages/explore/controls-state.ts` established:
 *
 *   - `q`        free-text search
 *   - `sort`     the sorted column's id, or absent for the dataset's
 *                original row order
 *   - `dir`      "asc" | "desc"
 *   - `page`     1-based page number
 *   - `pageSize` rows per page (25 | 50 | 100)
 *   - `cols`     visible column ids, in display order
 *   - one repeated param per filterable column, holding its selected values
 *     (`?anion=TFSI&anion=ClO4`) — the same six columns and the same
 *     AND-across/OR-within semantics as `/explore` (`@/lib/filtering`)
 *
 * `useUrlState` only round-trips strings; it doesn't know `dir` should be
 * "asc"/"desc" or that `cols` should only ever name real columns. Validating
 * that is `resolveDataTableState`'s job — anything unrecognized (a garbled
 * sort direction, a hand-typed column id that was never generated) falls
 * back to its documented default rather than reaching the data layer.
 */
import { useCallback, useMemo } from "react";
import { useUrlState, type UrlStateValue } from "@/lib/url-state";
import type { FilterSelections } from "@/lib/filtering";
import type { ColumnId, FrozenCategoryColumnId } from "@/data";
import { DEFAULT_COLUMN_IDS, isColumnId, resolveColumnIds } from "./columns";
import { DEFAULT_PAGE_SIZE, isValidPageSize } from "./pagination";
import type { SortDirection } from "./sorting";

/** DOI, Polymer family, Polymer, Anion, crystalline?, Solvent used — every
 *  column with a frozen category order (DATA-SPEC.md §7), all six offered
 *  as filters here exactly as they are on `/explore`. */
export const FILTERABLE_COLUMN_IDS: readonly FrozenCategoryColumnId[] = [
  "polymerFamily",
  "polymer",
  "anion",
  "crystalline",
  "solventUsed",
  "doi",
];

export interface DataTableUrlState {
  // See `ExploreUrlState`'s identical comment: `useUrlState`'s `T extends
  // UrlState` constraint needs an index signature, which a plain interface
  // doesn't have by default.
  [key: string]: UrlStateValue;
  q: string;
  sort: string;
  dir: string;
  page: string;
  pageSize: string;
  cols: readonly string[];
  polymerFamily: readonly string[];
  polymer: readonly string[];
  anion: readonly string[];
  crystalline: readonly string[];
  solventUsed: readonly string[];
  doi: readonly string[];
}

export const DEFAULT_PAGE = "1";

const DEFAULTS: DataTableUrlState = {
  q: "",
  sort: "",
  dir: "asc",
  page: DEFAULT_PAGE,
  pageSize: String(DEFAULT_PAGE_SIZE),
  cols: DEFAULT_COLUMN_IDS,
  polymerFamily: [],
  polymer: [],
  anion: [],
  crystalline: [],
  solventUsed: [],
  doi: [],
};

export interface ResolvedDataTableState {
  search: string;
  sortColumn: ColumnId | null;
  sortDirection: SortDirection;
  page: number;
  pageSize: number;
  visibleColumns: ColumnId[];
  filters: FilterSelections;
}

function resolvePositiveInt(raw: string, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Validate raw (user-editable) URL state into values the rest of the page
 *  can trust — see this module's header comment for the param scheme. */
export function resolveDataTableState(raw: DataTableUrlState): ResolvedDataTableState {
  const visibleColumns = resolveColumnIds(raw.cols);

  // A sort column that isn't currently visible is treated as unsorted
  // rather than silently reordering rows by a column the reader can't see.
  // Removing then re-adding the same column resumes the sort — a small,
  // harmless side effect of not scrubbing `sort` from the URL when this
  // happens, rather than a deliberate feature.
  const sortColumn =
    isColumnId(raw.sort) && visibleColumns.includes(raw.sort) ? raw.sort : null;

  const requestedPageSize = resolvePositiveInt(raw.pageSize, DEFAULT_PAGE_SIZE);
  const pageSize = isValidPageSize(requestedPageSize) ? requestedPageSize : DEFAULT_PAGE_SIZE;

  return {
    search: raw.q,
    sortColumn,
    sortDirection: raw.dir === "desc" ? "desc" : "asc",
    page: resolvePositiveInt(raw.page, 1),
    pageSize,
    visibleColumns,
    filters: {
      polymerFamily: raw.polymerFamily,
      polymer: raw.polymer,
      anion: raw.anion,
      crystalline: raw.crystalline,
      solventUsed: raw.solventUsed,
      doi: raw.doi,
    },
  };
}

export interface UseDataTableStateResult {
  readonly raw: DataTableUrlState;
  readonly resolved: ResolvedDataTableState;
  readonly setSearch: (query: string) => void;
  /** Clicking an unsorted (or differently-sorted) column selects it,
   *  ascending; clicking the already-sorted column flips its direction. */
  readonly setSort: (columnId: ColumnId) => void;
  readonly setPage: (page: number) => void;
  readonly setPageSize: (size: number) => void;
  readonly setColumns: (ids: string[]) => void;
  readonly setFilter: (columnId: FrozenCategoryColumnId, values: string[]) => void;
  readonly clearAllFilters: () => void;
}

/** Two-way bind the `/data` page's whole control surface to the URL. See
 *  this module's header comment for the param-naming scheme. */
export function useDataTableState(): UseDataTableStateResult {
  const [raw, patch] = useUrlState(DEFAULTS);
  const resolved = useMemo(() => resolveDataTableState(raw), [raw]);

  // Search, sort, page size, and filter changes all reset to page 1 —
  // otherwise a narrower result set can silently strand the reader on a now
  // out-of-range page (paginate() would clamp it, but the page-size/sort
  // controls staying in sync with what's on screen is less surprising).
  const setSearch = useCallback((query: string) => patch({ q: query, page: DEFAULT_PAGE }), [patch]);

  const setSort = useCallback(
    (columnId: ColumnId) => {
      if (resolved.sortColumn === columnId) {
        patch({ dir: resolved.sortDirection === "asc" ? "desc" : "asc" });
      } else {
        patch({ sort: columnId, dir: "asc", page: DEFAULT_PAGE });
      }
    },
    [patch, resolved.sortColumn, resolved.sortDirection],
  );

  const setPage = useCallback((page: number) => patch({ page: String(page) }), [patch]);

  const setPageSize = useCallback(
    (size: number) => patch({ pageSize: String(size), page: DEFAULT_PAGE }),
    [patch],
  );

  const setColumns = useCallback((ids: string[]) => patch({ cols: ids }), [patch]);

  const setFilter = useCallback(
    (columnId: FrozenCategoryColumnId, values: string[]) => {
      patch({ [columnId]: values, page: DEFAULT_PAGE });
    },
    [patch],
  );

  const clearAllFilters = useCallback(() => {
    patch({
      polymerFamily: [],
      polymer: [],
      anion: [],
      crystalline: [],
      solventUsed: [],
      doi: [],
      page: DEFAULT_PAGE,
    });
  }, [patch]);

  return {
    raw,
    resolved,
    setSearch,
    setSort,
    setPage,
    setPageSize,
    setColumns,
    setFilter,
    clearAllFilters,
  };
}
