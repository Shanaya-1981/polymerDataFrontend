import { describe, expect, it } from "vitest";
import { EMPTY_CELL_TEXT, formatCellValue, formatNumber } from "./format";

describe("formatNumber", () => {
  it("prints integers with no decimal point, regardless of magnitude", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(-3)).toBe("-3");
    expect(formatNumber(655)).toBe("655");
    expect(formatNumber(168000)).toBe("168000");
  });

  it("rounds a non-integer of ordinary magnitude to at most 4 significant digits", () => {
    expect(formatNumber(1.234567)).toBe("1.235");
    expect(formatNumber(167823.456)).toBe("167800");
  });

  it("switches small non-integer magnitudes to exponential notation, matching DATA-SPEC.md's own style", () => {
    expect(formatNumber(6.79e-11)).toBe("6.79e-11"); // the dataset's smallest conductivity
    expect(formatNumber(-6.79e-11)).toBe("-6.79e-11");
    expect(formatNumber(3.98e-8)).toBe("3.98e-8");
  });

  it("switches large non-integer magnitudes to exponential notation", () => {
    expect(formatNumber(2_500_000.5)).toBe("2.50e6");
  });
});

describe("formatCellValue", () => {
  it("renders null as the empty-cell glyph", () => {
    expect(formatCellValue(null)).toBe(EMPTY_CELL_TEXT);
  });

  it("formats a number through formatNumber", () => {
    expect(formatCellValue(-3)).toBe("-3");
  });

  it("passes a string through unchanged", () => {
    expect(formatCellValue("TFSI")).toBe("TFSI");
  });
});
