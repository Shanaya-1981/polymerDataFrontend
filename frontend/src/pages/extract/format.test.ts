import { describe, expect, it } from "vitest";
import { DEFAULT_EXTRACT_API_URL, resolveExtractApiUrl } from "./config";
import {
  countPoints,
  extractionCsv,
  extractionCsvName,
  formatElapsed,
  formatExtractedValue,
  formatFileSize,
  formatSource,
  formatSourceLine,
  hasSources,
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

describe("extractionCsv", () => {
  it("writes one row per data point, the sample first, a blank where the paper gives nothing", () => {
    const csv = extractionCsv({
      PEO: [
        { "Temperature (°C)": 20, "Conductivity (S/cm)": 2.82e-7 },
        { "Temperature (°C)": 25, "Conductivity (S/cm)": null },
      ],
      'PEO:LiClO4, "dry"': [{ "Temperature (°C)": 20, "Conductivity (S/cm)": "~1e-5" }],
    });
    expect(csv.split("\r\n")).toEqual([
      "sample,Temperature (°C),Conductivity (S/cm)",
      "PEO,20,2.82e-7",
      "PEO,25,",
      '"PEO:LiClO4, ""dry""",20,~1e-5',
    ]);
  });

  it("is just the header when there are no samples", () => {
    expect(extractionCsv({})).toBe("sample");
  });
});

describe("extractionCsvName", () => {
  it("names the file after the PDF", () => {
    expect(extractionCsvName("bdf71b01-linden1988.pdf")).toBe("bdf71b01-linden1988-extracted.csv");
    expect(extractionCsvName("Paper.PDF")).toBe("Paper-extracted.csv");
    expect(extractionCsvName(".pdf")).toBe("paper-extracted.csv");
  });
});

describe("where each point was read (issue #33)", () => {
  const table = { kind: "table", label: "Table IV", page: 12, quote: null } as const;
  const text = { kind: "text", label: null, page: 3, quote: "1e-7 S/cm at 20 °C" } as const;

  it("names the table or figure and its page, or says it was the text", () => {
    expect(formatSource(table)).toBe("Table IV, page 12");
    expect(formatSource({ kind: "figure", label: "Figure 3", page: null, quote: null })).toBe(
      "Figure 3",
    );
    expect(formatSource(text)).toBe("Text, page 3");
    expect(formatSource({ kind: "table", label: null, page: 2, quote: null })).toBe(
      "Table, page 2",
    );
  });

  it("puts a text source's quote in the CSV's one line", () => {
    expect(formatSourceLine(text)).toBe('Text, page 3: "1e-7 S/cm at 20 °C"');
    expect(formatSourceLine(table)).toBe("Table IV, page 12");
    expect(formatSourceLine(null)).toBe("");
  });

  it("has sources only when a point has one", () => {
    expect(hasSources(undefined)).toBe(false);
    expect(hasSources({ PEO: [null] })).toBe(false);
    expect(hasSources({ PEO: [null, table] })).toBe(true);
  });

  it("adds a source column to the CSV, as extract_features.py writes it", () => {
    const samples = { PEO: [{ T: 20 }, { T: 25 }] };
    expect(extractionCsv(samples, { PEO: [table, null] }).split("\r\n")).toEqual([
      "sample,T,source",
      'PEO,20,"Table IV, page 12"',
      "PEO,25,",
    ]);
    // A feature already called "source" keeps its column.
    expect(extractionCsv({ PEO: [{ source: "lab" }] }, { PEO: [table] }).split("\r\n")[0]).toBe(
      "sample,source,source of this data point",
    );
    // Without sources, the CSV is as before.
    expect(extractionCsv(samples, { PEO: [null, null] }).split("\r\n")[0]).toBe("sample,T");
  });
});
