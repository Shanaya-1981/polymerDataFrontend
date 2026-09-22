import { describe, expect, it } from "vitest";
import { toCsv } from "./csv-export";

describe("toCsv", () => {
  it("joins a header row and data rows with commas and CRLF", () => {
    const csv = toCsv(
      ["Polymer", "Anion", "Tg"],
      [
        ["polyethylene carbonate", "TFSI", -3],
        ["PEO", "ClO4", -60],
      ],
    );
    expect(csv).toBe(
      "Polymer,Anion,Tg\r\n" + "polyethylene carbonate,TFSI,-3\r\n" + "PEO,ClO4,-60",
    );
  });

  it("renders null/undefined cells as empty", () => {
    expect(toCsv(["a"], [[null], [undefined]])).toBe("a\r\n\r\n");
  });

  it("quotes fields containing a comma", () => {
    expect(toCsv(["Reference"], [["Smith, J. et al."]])).toBe(
      'Reference\r\n"Smith, J. et al."',
    );
  });

  it("doubles embedded double quotes and wraps the field in quotes", () => {
    expect(toCsv(["Notes"], [['He said "hello"']])).toBe('Notes\r\n"He said ""hello"""');
  });

  it("quotes fields containing a line break", () => {
    expect(toCsv(["Notes"], [["line1\nline2"]])).toBe('Notes\r\n"line1\nline2"');
  });

  it("does not quote fields that need no escaping", () => {
    expect(toCsv(["Anion"], [["TFSI"]])).toBe("Anion\r\nTFSI");
  });

  it("round-trips through Papa.parse", async () => {
    const Papa = await import("papaparse");
    const csv = toCsv(
      ["Polymer", "Notes"],
      [["PEO, branched", 'has "quotes" and\nnewlines']],
    );
    const result = Papa.parse<string[]>(csv, { skipEmptyLines: true });
    expect(result.data[0]).toEqual(["Polymer", "Notes"]);
    expect(result.data[1]).toEqual(["PEO, branched", 'has "quotes" and\nnewlines']);
  });
});
