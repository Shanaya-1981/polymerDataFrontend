import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DEFAULT_COLUMN_IDS } from "./columns";
import { DEFAULT_PAGE_SIZE } from "./pagination";
import {
  DEFAULT_PAGE,
  FILTERABLE_COLUMN_IDS,
  resolveDataTableState,
  useDataTableState,
  type DataTableUrlState,
} from "./table-state";

const BASE_RAW: DataTableUrlState = {
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

describe("resolveDataTableState", () => {
  it("passes valid raw state straight through", () => {
    const resolved = resolveDataTableState({
      ...BASE_RAW,
      q: "carbonate",
      sort: "anion",
      dir: "desc",
      page: "2",
      anion: ["TFSI"],
    });
    expect(resolved.search).toBe("carbonate");
    expect(resolved.sortColumn).toBe("anion");
    expect(resolved.sortDirection).toBe("desc");
    expect(resolved.page).toBe(2);
    expect(resolved.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(resolved.filters.anion).toEqual(["TFSI"]);
  });

  it("falls back to unsorted for a sort column id that doesn't exist", () => {
    expect(resolveDataTableState({ ...BASE_RAW, sort: "not-a-column" }).sortColumn).toBeNull();
  });

  it("falls back to unsorted for a sort column that isn't currently visible", () => {
    const resolved = resolveDataTableState({
      ...BASE_RAW,
      sort: "notes",
      cols: ["polymer", "anion"],
    });
    expect(resolved.sortColumn).toBeNull();
  });

  it("defaults direction to ascending for anything other than the literal 'desc'", () => {
    expect(resolveDataTableState({ ...BASE_RAW, dir: "DESC" }).sortDirection).toBe("asc");
    expect(resolveDataTableState({ ...BASE_RAW, dir: "" }).sortDirection).toBe("asc");
  });

  it("falls back to the default page size for anything outside the documented options", () => {
    expect(resolveDataTableState({ ...BASE_RAW, pageSize: "17" }).pageSize).toBe(
      DEFAULT_PAGE_SIZE,
    );
    expect(resolveDataTableState({ ...BASE_RAW, pageSize: "not-a-number" }).pageSize).toBe(
      DEFAULT_PAGE_SIZE,
    );
  });

  it("falls back to page 1 for a garbled page number", () => {
    expect(resolveDataTableState({ ...BASE_RAW, page: "0" }).page).toBe(1);
    expect(resolveDataTableState({ ...BASE_RAW, page: "abc" }).page).toBe(1);
  });

  it("drops unknown column ids from cols, preserving order", () => {
    const resolved = resolveDataTableState({ ...BASE_RAW, cols: ["anion", "bogus", "polymer"] });
    expect(resolved.visibleColumns).toEqual(["anion", "polymer"]);
  });
});

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={["/data"]}>{children}</MemoryRouter>;
}

describe("useDataTableState", () => {
  it("starts at the documented defaults with every filter empty", () => {
    const { result } = renderHook(() => useDataTableState(), { wrapper });
    expect(result.current.resolved.search).toBe("");
    expect(result.current.resolved.sortColumn).toBeNull();
    expect(result.current.resolved.page).toBe(1);
    expect(result.current.resolved.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(result.current.resolved.visibleColumns).toEqual(DEFAULT_COLUMN_IDS);
    for (const id of FILTERABLE_COLUMN_IDS) {
      expect(result.current.resolved.filters[id]).toEqual([]);
    }
  });

  it("setSearch updates the query and resets to page 1", () => {
    const { result } = renderHook(() => useDataTableState(), { wrapper });
    act(() => result.current.setPage(3));
    expect(result.current.resolved.page).toBe(3);

    act(() => result.current.setSearch("carbonate"));
    expect(result.current.resolved.search).toBe("carbonate");
    expect(result.current.resolved.page).toBe(1);
  });

  it("setSort selects a new column ascending, then flips direction on a second call", () => {
    const { result } = renderHook(() => useDataTableState(), { wrapper });

    act(() => result.current.setSort("anion"));
    expect(result.current.resolved.sortColumn).toBe("anion");
    expect(result.current.resolved.sortDirection).toBe("asc");

    act(() => result.current.setSort("anion"));
    expect(result.current.resolved.sortColumn).toBe("anion");
    expect(result.current.resolved.sortDirection).toBe("desc");
  });

  it("setSort on a different column resets direction to ascending", () => {
    const { result } = renderHook(() => useDataTableState(), { wrapper });

    act(() => result.current.setSort("anion"));
    act(() => result.current.setSort("anion")); // now descending
    act(() => result.current.setSort("polymer"));

    expect(result.current.resolved.sortColumn).toBe("polymer");
    expect(result.current.resolved.sortDirection).toBe("asc");
  });

  it("setFilter sets one column without disturbing the others, and resets to page 1", () => {
    const { result } = renderHook(() => useDataTableState(), { wrapper });
    act(() => result.current.setPage(2));

    act(() => result.current.setFilter("anion", ["TFSI"]));
    expect(result.current.resolved.filters.anion).toEqual(["TFSI"]);
    expect(result.current.resolved.filters.polymer).toEqual([]);
    expect(result.current.resolved.page).toBe(1);
  });

  it("clearAllFilters resets every filter column back to empty", () => {
    const { result } = renderHook(() => useDataTableState(), { wrapper });

    act(() => result.current.setFilter("anion", ["TFSI"]));
    act(() => result.current.setFilter("polymer", ["PEO"]));
    act(() => result.current.clearAllFilters());

    for (const id of FILTERABLE_COLUMN_IDS) {
      expect(result.current.resolved.filters[id]).toEqual([]);
    }
  });

  it("setColumns replaces the visible column set", () => {
    const { result } = renderHook(() => useDataTableState(), { wrapper });
    act(() => result.current.setColumns(["anion", "polymer"]));
    expect(result.current.resolved.visibleColumns).toEqual(["anion", "polymer"]);
  });

  it("setPageSize updates the page size and resets to page 1", () => {
    const { result } = renderHook(() => useDataTableState(), { wrapper });
    act(() => result.current.setPage(3));

    act(() => result.current.setPageSize(100));
    expect(result.current.resolved.pageSize).toBe(100);
    expect(result.current.resolved.page).toBe(1);
  });
});
