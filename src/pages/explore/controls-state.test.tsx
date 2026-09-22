import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COLOR_COLUMN,
  DEFAULT_X_COLUMN,
  DEFAULT_X_SCALE,
  DEFAULT_Y_COLUMN,
  DEFAULT_Y_SCALE,
  resolveAxisScale,
  resolveColumnId,
  resolveExploreState,
  useExploreControls,
  type ExploreUrlState,
} from "./controls-state";

describe("resolveColumnId", () => {
  it("passes through a known plottable column id", () => {
    expect(resolveColumnId("tg", "approxTg")).toBe("tg");
  });

  it("falls back for an id that isn't one of the 41 plottable columns", () => {
    expect(resolveColumnId("doi", "approxTg")).toBe("approxTg"); // filter-only, not plottable
    expect(resolveColumnId("garbage", "approxTg")).toBe("approxTg");
    expect(resolveColumnId("", "approxTg")).toBe("approxTg");
  });
});

describe("resolveAxisScale", () => {
  it("passes through 'linear' and 'log'", () => {
    expect(resolveAxisScale("linear", "log")).toBe("linear");
    expect(resolveAxisScale("log", "linear")).toBe("log");
  });

  it("falls back for anything else", () => {
    expect(resolveAxisScale("Log", "linear")).toBe("linear"); // case-sensitive, not fuzzy
    expect(resolveAxisScale("garbage", "linear")).toBe("linear");
    expect(resolveAxisScale("", "log")).toBe("log");
  });
});

describe("resolveExploreState", () => {
  const raw: ExploreUrlState = {
    x: "tg",
    y: "conductivityAt30C",
    color: "polymerFamily",
    xscale: "log",
    yscale: "linear",
    polymerFamily: ["ether"],
    polymer: [],
    anion: ["TFSI", "ClO4"],
    crystalline: [],
    solventUsed: [],
    doi: [],
  };

  it("passes valid raw state straight through", () => {
    expect(resolveExploreState(raw)).toEqual({
      x: "tg",
      xScale: "log",
      y: "conductivityAt30C",
      yScale: "linear",
      color: "polymerFamily",
      filters: {
        polymerFamily: ["ether"],
        polymer: [],
        anion: ["TFSI", "ClO4"],
        crystalline: [],
        solventUsed: [],
        doi: [],
      },
    });
  });

  it("falls back to the documented defaults for garbled/unknown values", () => {
    const garbled: ExploreUrlState = {
      ...raw,
      x: "not-a-column",
      color: "doi", // filter-only, never a plottable color option
      xscale: "sideways",
    };
    const resolved = resolveExploreState(garbled);
    expect(resolved.x).toBe(DEFAULT_X_COLUMN);
    expect(resolved.color).toBe(DEFAULT_COLOR_COLUMN);
    expect(resolved.xScale).toBe(DEFAULT_X_SCALE);
  });
});

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={["/explore"]}>{children}</MemoryRouter>;
}

describe("useExploreControls", () => {
  it("starts at the documented defaults with every filter empty", () => {
    const { result } = renderHook(() => useExploreControls(), { wrapper });
    expect(result.current.resolved).toEqual({
      x: DEFAULT_X_COLUMN,
      xScale: DEFAULT_X_SCALE,
      y: DEFAULT_Y_COLUMN,
      yScale: DEFAULT_Y_SCALE,
      color: DEFAULT_COLOR_COLUMN,
      filters: {
        polymerFamily: [],
        polymer: [],
        anion: [],
        crystalline: [],
        solventUsed: [],
        doi: [],
      },
    });
  });

  it("setX/setY/setColor/setXScale/setYScale each update just their own field", () => {
    const { result } = renderHook(() => useExploreControls(), { wrapper });

    act(() => result.current.setX("tg"));
    expect(result.current.resolved.x).toBe("tg");
    expect(result.current.resolved.y).toBe(DEFAULT_Y_COLUMN); // untouched

    act(() => result.current.setYScale("linear"));
    expect(result.current.resolved.yScale).toBe("linear");
    expect(result.current.resolved.xScale).toBe(DEFAULT_X_SCALE); // untouched
  });

  it("setFilter sets one column's selection without disturbing the others", () => {
    const { result } = renderHook(() => useExploreControls(), { wrapper });

    act(() => result.current.setFilter("anion", ["TFSI", "ClO4"]));
    expect(result.current.resolved.filters.anion).toEqual(["TFSI", "ClO4"]);
    expect(result.current.resolved.filters.solventUsed).toEqual([]);

    act(() => result.current.setFilter("solventUsed", ["water"]));
    expect(result.current.resolved.filters.anion).toEqual(["TFSI", "ClO4"]); // still there
    expect(result.current.resolved.filters.solventUsed).toEqual(["water"]);
  });

  it("clearAllFilters resets every filter column back to empty", () => {
    const { result } = renderHook(() => useExploreControls(), { wrapper });

    // Two separate interactions (their own `act()`), not one batch — see
    // this file's note on `useUrlState`'s same-tick `patch()` limitation.
    act(() => result.current.setFilter("anion", ["TFSI"]));
    act(() => result.current.setFilter("polymer", ["PEO"]));
    expect(result.current.resolved.filters.anion).toEqual(["TFSI"]);

    act(() => result.current.clearAllFilters());
    expect(result.current.resolved.filters).toEqual({
      polymerFamily: [],
      polymer: [],
      anion: [],
      crystalline: [],
      solventUsed: [],
      doi: [],
    });
  });

  // Regression test for a bug found while writing the above. React Router's
  // functional `setSearchParams` hands its updater the params from the
  // current render's closure rather than a queued value, so two `patch()`
  // calls in one synchronous batch used to both start from the same base and
  // the second would silently discard the first. `useUrlState` now carries
  // the pending params across calls within a tick. This page never hit it
  // (each handler fires exactly one setter), but a "reset these two related
  // fields together" handler would have.
  it("composes two setters fired in the same synchronous batch", () => {
    const { result } = renderHook(() => useExploreControls(), { wrapper });

    act(() => {
      result.current.setFilter("anion", ["TFSI"]);
      result.current.setFilter("polymer", ["PEO"]);
    });

    expect(result.current.resolved.filters.anion).toEqual(["TFSI"]);
    expect(result.current.resolved.filters.polymer).toEqual(["PEO"]);
  });
});
