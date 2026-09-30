import { describe, expect, it } from "vitest";
import { DEFAULT_EXTRACT_API_URL, resolveExtractApiUrl } from "./config";
import {
  countPoints,
  formatElapsed,
  formatExtractedValue,
  formatFileSize,
  isNumericColumn,
  MISSING_VALUE_TEXT,
  parseFeatureNames,
  tableColumns,
} from "./format";

describe("parseFeatureNames", () => {
  it("splits at commas and trims, the way POST /extract does", () => {
    expect(parseFeatureNames("Temperature (°C), Conductivity (S/cm)")).toEqual([
      "Temperature (°C)",
      "Conductivity (S/cm)",
    ]);
  });

  it("drops blank names, so commas and spaces alone count as no features", () => {
    expect(parseFeatureNames(" Tg ,, Anion , ")).toEqual(["Tg", "Anion"]);
    expect(parseFeatureNames("")).toEqual([]);
    expect(parseFeatureNames(" , ,")).toEqual([]);
  });
});

describe("formatExtractedValue", () => {
  it("shows a missing value as a dash and a string as given", () => {
    expect(formatExtractedValue(null)).toBe(MISSING_VALUE_TEXT);
    expect(formatExtractedValue("RT")).toBe("RT");
  });

  it("prints ordinary numbers plainly", () => {
    expect(formatExtractedValue(60)).toBe("60");
    expect(formatExtractedValue(25.5)).toBe("25.5");
    expect(formatExtractedValue(0.001)).toBe("0.001");
    expect(formatExtractedValue(0)).toBe("0");
  });

  it("switches tiny and huge magnitudes to e-notation without rounding a digit", () => {
    expect(formatExtractedValue(2.82e-7)).toBe("2.82e-7");
    expect(formatExtractedValue(1.2345e-5)).toBe("1.2345e-5");
    expect(formatExtractedValue(-3.5e-4)).toBe("-3.5e-4");
    expect(formatExtractedValue(1234567)).toBe("1.234567e6");
  });
});

describe("tableColumns", () => {
  it("lists every feature in first-seen order, including one only some points have", () => {
    expect(
      tableColumns({
        a: [{ T: 20, sigma: 1e-7 }],
        b: [{ T: 25, sigma: null, extra: "x" }],
      }),
    ).toEqual(["T", "sigma", "extra"]);
    expect(tableColumns({})).toEqual([]);
  });
});

describe("isNumericColumn", () => {
  const samples = {
    a: [{ T: 20, name: "PEO", gap: null }],
    b: [{ T: null, name: "PEO:LiClO4", gap: null }],
  };

  it("is true for numbers with gaps, false once any value is text or nothing is a number", () => {
    expect(isNumericColumn(samples, "T")).toBe(true);
    expect(isNumericColumn(samples, "name")).toBe(false);
    expect(isNumericColumn(samples, "gap")).toBe(false);
  });
});

describe("countPoints", () => {
  it("adds up every sample's points", () => {
    expect(countPoints({ a: [{ T: 1 }, { T: 2 }], b: [{ T: 3 }], c: [] })).toBe(3);
  });
});

describe("formatElapsed", () => {
  it("prints minutes and zero-padded seconds", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(5_400)).toBe("0:05");
    expect(formatElapsed(83_000)).toBe("1:23");
    expect(formatElapsed(3_600_000)).toBe("60:00");
    expect(formatElapsed(-500)).toBe("0:00");
  });
});

describe("formatFileSize", () => {
  it("picks a unit that tells files apart", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(1_500_000)).toBe("1.4 MB");
  });
});

describe("resolveExtractApiUrl", () => {
  it("falls back to the server's own default when nothing is configured", () => {
    expect(resolveExtractApiUrl(undefined)).toBe(DEFAULT_EXTRACT_API_URL);
    expect(resolveExtractApiUrl("   ")).toBe(DEFAULT_EXTRACT_API_URL);
    expect(DEFAULT_EXTRACT_API_URL).toBe("http://127.0.0.1:8000");
  });

  it("uses VITE_EXTRACT_API_URL, minus any trailing slash", () => {
    expect(resolveExtractApiUrl(" http://lab-box:9000/ ")).toBe("http://lab-box:9000");
  });
});
