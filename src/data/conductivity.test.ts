import { describe, expect, it } from "vitest";
import { TEMPERATURES_C, conductivityForRow, conductivityMatrix } from "./conductivity";

describe("conductivity accessors", () => {
  it("exposes the 22 temperatures in DATA-SPEC.md §5 order", () => {
    expect(TEMPERATURES_C).toEqual([
      0, 15, 20, 21, 25, 27, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 100, 110, 125,
    ]);
  });

  it("conductivityForRow(0) matches the fixture row's known values at 30/40/60/80/100 °C", () => {
    const row = conductivityForRow(0);
    expect(row).toHaveLength(22);
    const at = (tempC: number) => row[TEMPERATURES_C.indexOf(tempC)];
    expect(at(30)).toBeCloseTo(3.98e-8, 12);
    expect(at(40)).toBeCloseTo(1.74e-7, 12);
    expect(at(60)).toBeCloseTo(1.91e-6, 12);
    expect(at(80)).toBeCloseTo(1.17e-5, 12);
    expect(at(100)).toBeCloseTo(6.31e-5, 12);
  });

  it("conductivityMatrix has 655 rows of 22 values each", () => {
    const matrix = conductivityMatrix();
    expect(matrix).toHaveLength(655);
    expect(matrix.every((row) => row.length === 22)).toBe(true);
  });
});
