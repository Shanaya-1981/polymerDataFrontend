import { describe, expect, it } from "vitest";
import { categoricalColumn, numericColumn, rankOf } from "@/data";
import {
  axisNoticeMessage,
  buildAxisNotice,
  buildExplorePoints,
  categoryCounts,
  exploreEmptyReason,
  highCardinalityMessage,
  highCardinalityNotice,
} from "./plot-data";

const ALL_ROWS = Array.from({ length: 655 }, (_, i) => i);

describe("buildAxisNotice", () => {
  it("is null for a linear scale", () => {
    expect(buildAxisNotice("tg", "linear", ALL_ROWS)).toBeNull();
  });

  it("is null for a categorical column regardless of scale", () => {
    expect(buildAxisNotice("anion", "log", ALL_ROWS)).toBeNull();
  });

  it("is null for an unknown column id", () => {
    expect(buildAxisNotice("not-a-real-column", "log", ALL_ROWS)).toBeNull();
  });

  it("is null when a log scale drops nothing (an all-positive column)", () => {
    // Conductivity at 60C: 389 non-null, min 6.79e-11 > 0 — DATA-SPEC.md §3.
    expect(buildAxisNotice("conductivityAt60C", "log", ALL_ROWS)).toBeNull();
  });

  it("matches DATA-SPEC.md §3's ground truth for Tg on a log axis: 287 of 368 hidden", () => {
    const notice = buildAxisNotice("tg", "log", ALL_ROWS);
    expect(notice).toEqual({ droppedCount: 287, consideredCount: 368, columnLabel: "Tg" });
  });

  it("recomputes against whatever row subset it's given, not always the full dataset", () => {
    const tg = numericColumn("tg");
    const firstHundred = ALL_ROWS.slice(0, 100);
    const expectedConsidered = firstHundred.filter((row) => tg[row] != null).length;
    const expectedDropped = firstHundred.filter(
      (row) => tg[row] != null && (tg[row] as number) <= 0,
    ).length;

    const notice = buildAxisNotice("tg", "log", firstHundred);

    if (expectedDropped === 0) {
      expect(notice).toBeNull();
    } else {
      expect(notice).toEqual({
        droppedCount: expectedDropped,
        consideredCount: expectedConsidered,
        columnLabel: "Tg",
      });
    }
    // Sanity: this 100-row slice is a genuinely different (smaller) sample
    // than the full-dataset case above, so this test isn't a tautology.
    expect(expectedConsidered).toBeLessThan(368);
  });
});

describe("axisNoticeMessage", () => {
  it("is calm and factual, naming the axis, both counts, and the column", () => {
    const message = axisNoticeMessage("Y", { droppedCount: 287, consideredCount: 368, columnLabel: "Tg" });
    expect(message).toBe("287 of 368 Y-axis points hidden — a log axis can't show Tg values ≤ 0.");
  });
});

describe("buildExplorePoints", () => {
  it("only ever returns points whose rowIndex was in the input list", () => {
    const rows = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const { seriesInput } = buildExplorePoints(
      rows,
      "approxTg",
      "linear",
      "conductivityAt60C",
      "log",
      "anion",
    );
    for (const point of seriesInput.points) {
      expect(rows).toContain(point.rowIndex);
    }
  });

  it("drops rows missing on either axis, matching a manual computation", () => {
    const rows = ALL_ROWS.slice(0, 50);
    const x = numericColumn("approxTg");
    const y = numericColumn("conductivityAt60C");
    const expectedCount = rows.filter((row) => x[row] != null && y[row] != null).length;

    const { plottedCount } = buildExplorePoints(
      rows,
      "approxTg",
      "linear",
      "conductivityAt60C",
      "linear",
      "anion",
    );

    expect(plottedCount).toBe(expectedCount);
    expect(expectedCount).toBeGreaterThan(0);
    expect(expectedCount).toBeLessThan(rows.length); // proves some rows really are missing data
  });

  it("additionally drops non-positive values when an axis is log-scaled", () => {
    const x = numericColumn("tg");
    const y = numericColumn("conductivityAt60C");
    const expectedCount = ALL_ROWS.filter(
      (row) => x[row] != null && y[row] != null && (x[row] as number) > 0,
    ).length;

    const { plottedCount } = buildExplorePoints(
      ALL_ROWS,
      "tg",
      "log",
      "conductivityAt60C",
      "linear",
      "anion",
    );

    expect(plottedCount).toBe(expectedCount);
  });

  it("builds categorical points with rank/category resolved via the frozen order", () => {
    const rows = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const anion = categoricalColumn("anion");
    const { seriesInput } = buildExplorePoints(
      rows,
      "approxTg",
      "linear",
      "conductivityAt60C",
      "linear",
      "anion",
    );

    expect(seriesInput.kind).toBe("categorical");
    if (seriesInput.kind !== "categorical") throw new Error("unreachable");
    expect(seriesInput.points.length).toBeGreaterThan(0);
    for (const point of seriesInput.points) {
      expect(point.category).toBe(anion[point.rowIndex]);
      expect(point.rank).toBe(rankOf("anion", point.category));
    }
  });

  it("builds a single continuous series with colorValue bound to the numeric color column", () => {
    const rows = [0, 1, 2, 3, 4];
    const tg = numericColumn("tg");
    const { seriesInput } = buildExplorePoints(
      rows,
      "approxTg",
      "linear",
      "conductivityAt60C",
      "linear",
      "tg",
    );

    expect(seriesInput.kind).toBe("continuous");
    if (seriesInput.kind !== "continuous") throw new Error("unreachable");
    for (const point of seriesInput.points) {
      expect(point.colorValue).toBe(tg[point.rowIndex] ?? null);
    }
  });

  it("supports a categorical column on an axis (not just as color)", () => {
    const rows = [0, 1, 2, 3, 4];
    const { seriesInput } = buildExplorePoints(
      rows,
      "polymerFamily",
      "linear",
      "conductivityAt60C",
      "linear",
      "anion",
    );
    for (const point of seriesInput.points) {
      expect(typeof point.x).toBe("string");
    }
  });

  it("throws for a genuinely unknown column id", () => {
    expect(() =>
      buildExplorePoints([0], "not-a-real-column", "linear", "conductivityAt60C", "linear", "anion"),
    ).toThrow(/unknown column id/);
  });
});

describe("categoryCounts", () => {
  it("sums to the full 655-row dataset — no categorical column has blanks (DATA-SPEC.md §5)", () => {
    const counts = categoryCounts("anion");
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(655);
    expect(counts.size).toBe(12); // distinct Anion count, DATA-SPEC.md §5
  });

  it("matches the distinct counts for every frozen categorical column", () => {
    expect(categoryCounts("polymerFamily").size).toBe(24);
    expect(categoryCounts("polymer").size).toBe(78);
    expect(categoryCounts("crystalline").size).toBe(3);
    expect(categoryCounts("solventUsed").size).toBe(14);
    expect(categoryCounts("doi").size).toBe(65);
  });
});

describe("highCardinalityNotice", () => {
  it("is null for columns that fold acceptably (DATA-SPEC.md / CHART-PALETTE.md coverage table)", () => {
    expect(highCardinalityNotice("anion")).toBeNull();
    expect(highCardinalityNotice("crystalline")).toBeNull();
    expect(highCardinalityNotice("solventUsed")).toBeNull();
    expect(highCardinalityNotice("polymerFamily")).toBeNull();
  });

  it("is null for a column with no metadata at all", () => {
    expect(highCardinalityNotice("not-a-real-column")).toBeNull();
  });

  it("fires for Polymer: 78 distinct values, well under 100% top-7 coverage", () => {
    const notice = highCardinalityNotice("polymer");
    expect(notice).not.toBeNull();
    expect(notice?.distinctCount).toBe(78);
    expect(notice?.topCoveragePercent).toBeGreaterThan(0);
    expect(notice?.topCoveragePercent).toBeLessThan(60);
    expect(notice?.columnLabel).toBe("Polymer");
  });

  it("fires for DOI too, even though it isn't a selectable color option today", () => {
    const notice = highCardinalityNotice("doi");
    expect(notice).not.toBeNull();
    expect(notice?.distinctCount).toBe(65);
    expect(notice?.topCoveragePercent).toBeLessThan(40);
  });
});

describe("highCardinalityMessage", () => {
  it("names the column, its distinct count, and the coverage percentage — tells the truth, doesn't hide it", () => {
    const message = highCardinalityMessage({
      distinctCount: 78,
      topCoveragePercent: 53.4,
      columnLabel: "Polymer",
    });
    expect(message).toContain("Polymer");
    expect(message).toContain("78 distinct");
    expect(message).toContain("53.4%");
  });
});

describe("exploreEmptyReason", () => {
  it("prioritizes 'no rows match filters' over 'nothing plottable'", () => {
    expect(exploreEmptyReason(0, 0)).toBe("no-rows-match-filters");
  });

  it("reports 'no plottable points' when rows exist but none can be plotted", () => {
    expect(exploreEmptyReason(10, 0)).toBe("no-plottable-points");
  });

  it("is null once anything is plottable", () => {
    expect(exploreEmptyReason(10, 1)).toBeNull();
  });
});
