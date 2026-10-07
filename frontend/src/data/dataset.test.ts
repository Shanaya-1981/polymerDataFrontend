import { describe, expect, it } from "vitest";
import { ROW_COUNT, categoricalColumn, filterRows, getRow, getRows, numericColumn } from "./dataset";

describe("dataset accessors", () => {
  it("reports the full 655-row count", () => {
    expect(ROW_COUNT).toBe(655);
  });

  it("numericColumn/categoricalColumn return the full column", () => {
    expect(numericColumn("tg")).toHaveLength(655);
    expect(categoricalColumn("anion")).toHaveLength(655);
  });

  it("getRows materializes one object per row, including the fixture row", () => {
    const rows = getRows();
    expect(rows).toHaveLength(655);

    const fixture = rows.find(
      (r) => r.polymer === "polyethylene carbonate" && r.anion === "TFSI" && r.tg === -3,
    );
    expect(fixture).toBeDefined();
    expect(fixture?.conductivityAt30C).toBeCloseTo(3.98e-8, 12);
    expect(fixture?.doi).toBe("https://doi.org/10.1038/pj.2012.97");
  });

  it("getRows is memoized (same array reference across calls)", () => {
    expect(getRows()).toBe(getRows());
  });

  it("getRow returns the row at that index and throws out of range", () => {
    expect(getRow(0).rowIndex).toBe(0);
    expect(() => getRow(655)).toThrow(/no row at index/);
  });
});

describe("filterRows against the real dataset", () => {
  it("returns every row when no filters are active", () => {
    expect(filterRows({})).toHaveLength(655);
  });

  it("ORs within a column: Anion count matches the frozen frequency ranking (282 + 164)", () => {
    expect(filterRows({ anion: ["TFSI"] })).toHaveLength(282);
    expect(filterRows({ anion: ["TFSI", "CF3SO3"] })).toHaveLength(282 + 164);
  });

  it("ANDs across columns", () => {
    const anionOnly = filterRows({ anion: ["TFSI"] }).length;
    const combined = filterRows({ anion: ["TFSI"], crystalline: ["yes"] }).length;
    expect(combined).toBeLessThanOrEqual(anionOnly);
    expect(combined).toBeGreaterThan(0);
  });
});
