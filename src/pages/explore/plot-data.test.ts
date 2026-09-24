import { describe, expect, it } from "vitest";
import { categoricalColumn, numericColumn, rankOf } from "@/data";
import {
  axisNoticeMessage,
  buildAxisNotice,
  buildExplorePoints,
  buildImportedPoints,
  categoryCounts,
  exploreEmptyReason,
  highCardinalityMessage,
  highCardinalityNotice,
  importedNoticeMessage,
} from "./plot-data";
import { parseImportCsv, type ImportedDataset } from "@/components/import";

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
    const message = axisNoticeMessage("Y", {
      droppedCount: 287,
      consideredCount: 368,
      columnLabel: "Tg",
    });
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
      buildExplorePoints(
        [0],
        "not-a-real-column",
        "linear",
        "conductivityAt60C",
        "linear",
        "anion",
      ),
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

describe("buildImportedPoints", () => {
  function importCsv(text: string): ImportedDataset {
    const result = parseImportCsv(text, "mine.csv");
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }

  const imported = importCsv(
    [
      "approxTg,Conductivity at 60C,Anion,Li:functional group",
      "-40,1e-4,TFSI,0.1",
      "10,,ClO4,0.2", // no conductivity: never plottable
      "20,5e-5,ClO4,", // no color value: still plotted
      "-5,0,TFSI,0.3", // zero conductivity: hidden on a log Y axis only
    ].join("\n"),
  );

  it("plots every row that has both axis values, carrying 1-based row numbers", () => {
    const result = buildImportedPoints(
      imported,
      "approxTg",
      "linear",
      "conductivityAt60C",
      "linear",
      "anion",
    );
    expect(result.points).toEqual([
      { x: -40, y: 1e-4, rowNumber: 1, colorValue: "TFSI" },
      { x: 20, y: 5e-5, rowNumber: 3, colorValue: "ClO4" },
      { x: -5, y: 0, rowNumber: 4, colorValue: "TFSI" },
    ]);
    expect(result.totalCount).toBe(4);
    expect(result.missingAxes).toEqual([]);
  });

  it("drops non-positive values on a log axis, like the dataset", () => {
    const result = buildImportedPoints(
      imported,
      "approxTg",
      "linear",
      "conductivityAt60C",
      "log",
      "anion",
    );
    expect(result.points.map((p) => p.rowNumber)).toEqual([1, 3]);
  });

  it("follows the color column for hover values, including a numeric one", () => {
    const result = buildImportedPoints(
      imported,
      "approxTg",
      "linear",
      "conductivityAt60C",
      "linear",
      "liFunctionalGroup",
    );
    expect(result.points.map((p) => p.colorValue)).toEqual([0.1, null, 0.3]);
  });

  it("gives a null color value when the file lacks the color column", () => {
    const result = buildImportedPoints(
      imported,
      "approxTg",
      "linear",
      "conductivityAt60C",
      "linear",
      "polymerFamily",
    );
    expect(result.points.every((p) => p.colorValue === null)).toBe(true);
  });

  it("plots categorical axes with the imported category values", () => {
    const result = buildImportedPoints(imported, "anion", "linear", "approxTg", "linear", "anion");
    expect(result.points.map((p) => p.x)).toEqual(["TFSI", "ClO4", "ClO4", "TFSI"]);
  });

  it("reports which axis columns the file doesn't have", () => {
    const result = buildImportedPoints(imported, "tg", "linear", "approxMWKDa", "log", "anion");
    expect(result.missingAxes).toEqual(["X", "Y"]);
    expect(result.points).toEqual([]);
  });
});

describe("importedNoticeMessage", () => {
  const base = { points: [], totalCount: 4, missingAxes: [] as ("X" | "Y")[] };
  const point = { x: 1, y: 1, rowNumber: 1, colorValue: null };

  it("is null when every imported row is plotted", () => {
    expect(
      importedNoticeMessage({ ...base, totalCount: 1, points: [point] }, "tg", "tg"),
    ).toBeNull();
  });

  it("names a missing axis column by its label", () => {
    expect(importedNoticeMessage({ ...base, missingAxes: ["X"] }, "approxTg", "tg")).toBe(
      'The imported file has no "approxTg" column, so its rows can\'t be placed on these axes.',
    );
  });

  it("names both missing axis columns", () => {
    expect(importedNoticeMessage({ ...base, missingAxes: ["X", "Y"] }, "approxTg", "tg")).toBe(
      'The imported file has no "approxTg" or "Tg" columns, so its rows can\'t be placed on these axes.',
    );
  });

  it("counts the rows it couldn't plot", () => {
    expect(
      importedNoticeMessage({ ...base, points: [point] }, "approxTg", "conductivityAt60C"),
    ).toBe(
      "1 of 4 imported rows plotted: 3 have a missing X or Y value, or one a log axis can't " +
        "show (≤ 0).",
    );
  });

  it("uses the singular for a single row", () => {
    expect(
      importedNoticeMessage(
        { ...base, totalCount: 2, points: [point] },
        "approxTg",
        "conductivityAt60C",
      ),
    ).toBe(
      "1 of 2 imported rows plotted: 1 has a missing X or Y value, or one a log axis can't " +
        "show (≤ 0).",
    );
  });
});
