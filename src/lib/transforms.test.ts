import { describe, expect, it } from "vitest";
import {
  buildTemperatureSeries,
  countPoints,
  modeRequiresTg,
  transformTemperature,
  type TemperatureMode,
} from "./transforms";
import conductivityJson from "@/data/generated/conductivity.json";
import datasetJson from "@/data/generated/dataset.json";

// Reference row from DATA-SPEC.md §6 / live-figure-fixtures.json:
// polyethylene carbonate / TFSI, Tg = -3.0 °C, conductivity 3.98e-8 S/cm at 30 °C.
const T = 30;
const TG = -3.0;

describe("transformTemperature — fixture ground truth (DATA-SPEC.md §6)", () => {
  it("Arrhenius: 1000/(T+273.15)", () => {
    expect(transformTemperature("Arrhenius", T, TG)).toBeCloseTo(3.298697014679202, 9);
  });

  it("T: identity", () => {
    expect(transformTemperature("T", T, TG)).toBe(30);
  });

  it("T/Tg: (T+273.15)/(Tg+273.15)", () => {
    expect(transformTemperature("T/Tg", T, TG)).toBeCloseTo(1.122154358689617, 9);
  });

  it("VFT: 1000/(T-Tg+50)", () => {
    expect(transformTemperature("VFT", T, TG)).toBeCloseTo(12.048192771084338, 9);
  });

  it("T/Tg and VFT return null without a raw Tg (never fall back to approxTg)", () => {
    expect(transformTemperature("T/Tg", T, null)).toBeNull();
    expect(transformTemperature("VFT", T, null)).toBeNull();
  });

  it("Arrhenius and T never need Tg", () => {
    expect(modeRequiresTg("Arrhenius")).toBe(false);
    expect(modeRequiresTg("T")).toBe(false);
    expect(modeRequiresTg("T/Tg")).toBe(true);
    expect(modeRequiresTg("VFT")).toBe(true);
  });
});

describe("buildTemperatureSeries — skip/keep semantics on a small synthetic dataset", () => {
  const temps = [30, 60];
  // row 0: full data + Tg. row 1: has Tg but zero conductivity (empty series, still counted).
  // row 2: no Tg, has conductivity (present for Arrhenius/T, absent for T/Tg & VFT).
  const conductivity: (number | null)[][] = [
    [1e-6, 2e-6],
    [null, null],
    [3e-6, null],
  ];
  const rawTg = [-3, 10, null];

  it("Arrhenius/T include every row, even ones with zero points", () => {
    const series = buildTemperatureSeries("Arrhenius", temps, conductivity, rawTg);
    expect(series).toHaveLength(3);
    expect(series[1].points).toHaveLength(0); // zero-conductivity row kept as an empty series
    expect(countPoints(series)).toBe(3); // row0: 2 points, row1: 0, row2: 1
  });

  it("T/Tg and VFT include only rows with a raw Tg", () => {
    const series = buildTemperatureSeries("T/Tg", temps, conductivity, rawTg);
    expect(series.map((s) => s.rowIndex)).toEqual([0, 1]); // row 2 excluded: no Tg
    expect(countPoints(series)).toBe(2); // row0: 2 points, row1: 0
  });
});

interface ConductivityJson {
  temps: number[];
  values: (number | null)[][];
}
interface DatasetJson {
  numeric: Record<string, (number | null)[]>;
}

describe("buildTemperatureSeries — series/point counts against the real dataset", () => {
  const conductivity = conductivityJson as ConductivityJson;
  const dataset = datasetJson as DatasetJson;
  const rawTg = dataset.numeric.tg;

  // DATA-SPEC.md §6 / live-figure-fixtures.json: 655/5225, 655/5225, 368/3401, 368/3401.
  const expected: Record<TemperatureMode, { series: number; points: number }> = {
    Arrhenius: { series: 655, points: 5225 },
    T: { series: 655, points: 5225 },
    "T/Tg": { series: 368, points: 3401 },
    VFT: { series: 368, points: 3401 },
  };

  for (const mode of Object.keys(expected) as TemperatureMode[]) {
    it(`${mode}: ${expected[mode].series} series / ${expected[mode].points} points`, () => {
      const series = buildTemperatureSeries(mode, conductivity.temps, conductivity.values, rawTg);
      expect(series).toHaveLength(expected[mode].series);
      expect(countPoints(series)).toBe(expected[mode].points);
    });
  }
});
