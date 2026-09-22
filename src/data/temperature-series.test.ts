import { describe, expect, it } from "vitest";
import { countPoints } from "@/lib/transforms";
import { getTemperatureSeries } from "./temperature-series";

describe("getTemperatureSeries wired to the real dataset", () => {
  it("Arrhenius: 655 series / 5225 points", () => {
    const series = getTemperatureSeries("Arrhenius");
    expect(series).toHaveLength(655);
    expect(countPoints(series)).toBe(5225);
  });

  it("T/Tg: 368 series / 3401 points (raw Tg only)", () => {
    const series = getTemperatureSeries("T/Tg");
    expect(series).toHaveLength(368);
    expect(countPoints(series)).toBe(3401);
  });

  it("memoizes per mode (same reference on repeat calls)", () => {
    expect(getTemperatureSeries("VFT")).toBe(getTemperatureSeries("VFT"));
  });
});
