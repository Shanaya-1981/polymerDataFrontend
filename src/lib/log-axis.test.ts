import { describe, expect, it } from "vitest";
import { applyAxisScale } from "./log-axis";
import datasetJson from "@/data/generated/dataset.json";

describe("applyAxisScale", () => {
  it("linear scale keeps everything except missing values, and never drops", () => {
    const result = applyAxisScale([1, -2, 0, null, 5], "linear");
    expect(result.kept.map((v) => v.value)).toEqual([1, -2, 0, 5]);
    expect(result.droppedCount).toBe(0);
  });

  it("log scale drops non-positive values and reports the count", () => {
    const result = applyAxisScale([1, -2, 0, null, 5], "log");
    expect(result.kept.map((v) => v.value)).toEqual([1, 5]);
    expect(result.droppedCount).toBe(2); // -2 and 0; the null is not counted
  });

  it("preserves original indices for re-joining to a row/series", () => {
    const result = applyAxisScale([-1, 2, -3, 4], "log");
    expect(result.kept).toEqual([
      { index: 1, value: 2 },
      { index: 3, value: 4 },
    ]);
  });

  it("never clamps: a dropped value never reappears at a floor value", () => {
    const result = applyAxisScale([-1, 0], "log");
    expect(result.kept).toHaveLength(0);
    expect(result.droppedCount).toBe(2);
  });
});

interface DatasetJson {
  numeric: Record<string, (number | null)[]>;
}

describe("applyAxisScale — Tg on a log axis (DATA-SPEC.md §3)", () => {
  it("drops exactly 287 of the 368 non-null Tg values (78%), never clamping", () => {
    const dataset = datasetJson as DatasetJson;
    const tg = dataset.numeric.tg;
    const nonNull = tg.filter((v) => v != null).length;
    expect(nonNull).toBe(368);

    const result = applyAxisScale(tg, "log");
    expect(result.droppedCount).toBe(287);
    expect(result.kept).toHaveLength(368 - 287);
  });
});
