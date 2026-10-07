import { describe, expect, it } from "vitest";
import { COLUMNS } from "@/data";
import {
  importErrorMessage,
  matchHeader,
  MAX_IMPORT_ROWS,
  parseImportCsv,
  readImportFile,
  type ImportedDataset,
  type ImportResult,
} from "./csv-import";

function expectOk(result: ImportResult): ImportedDataset {
  if (!result.ok) throw new Error(`expected a successful import, got ${result.error}`);
  return result.data;
}

describe("matchHeader", () => {
  it("resolves every column's id and label back to that same column", () => {
    for (const column of COLUMNS) {
      expect(matchHeader(column.id)?.id).toBe(column.id);
      expect(matchHeader(column.label)?.id).toBe(column.id);
    }
  });

  it("ignores case and stray whitespace", () => {
    expect(matchHeader("conductivity at 60c")?.id).toBe("conductivityAt60C");
    expect(matchHeader("  Conductivity   at 60C ")?.id).toBe("conductivityAt60C");
    expect(matchHeader("APPROXTG")?.id).toBe("approxTg");
  });

  it("ignores zero-width characters (a BOM stuck to the first header)", () => {
    expect(matchHeader("﻿approxTg")?.id).toBe("approxTg");
  });

  it("returns undefined for an unknown header", () => {
    expect(matchHeader("my sample id")).toBeUndefined();
    expect(matchHeader("")).toBeUndefined();
  });
});

describe("parseImportCsv", () => {
  it("matches headers by label or id and stores values in columnar form", () => {
    const data = expectOk(
      parseImportCsv("approxTg,conductivityAt60C,Anion\n-40,1e-4,TFSI\n10,3.2e-5,ClO4\n", "a.csv"),
    );

    expect(data.fileName).toBe("a.csv");
    expect(data.rowCount).toBe(2);
    expect(data.matchedColumnIds).toEqual(["approxTg", "conductivityAt60C", "anion"]);
    expect(data.numeric.approxTg).toEqual([-40, 10]);
    expect(data.numeric.conductivityAt60C).toEqual([1e-4, 3.2e-5]);
    expect(data.categorical.anion).toEqual(["TFSI", "ClO4"]);
    expect(data.ignoredHeaders).toEqual([]);
    expect(data.invalidNumericCount).toBe(0);
  });

  it("reports unmatched headers without importing them", () => {
    const data = expectOk(parseImportCsv("Sample,Tg,Notes from lab\nA,-20,ok\n", "b.csv"));
    expect(data.matchedColumnIds).toEqual(["tg"]);
    expect(data.ignoredHeaders).toEqual(["Sample", "Notes from lab"]);
  });

  it("keeps the first of two headers that name the same column", () => {
    const data = expectOk(parseImportCsv("Tg,tg\n1,2\n", "c.csv"));
    expect(data.matchedColumnIds).toEqual(["tg"]);
    expect(data.numeric.tg).toEqual([1]);
    expect(data.ignoredHeaders).toHaveLength(1);
  });

  it("applies the dataset's sentinel rules and counts junk as missing, not an error", () => {
    const data = expectOk(parseImportCsv("Tg\n-3.0\nnone\nNA\n\nabc\n12 kDa\n", "d.csv"));
    // "none"/"NA" are the dataset's own sentinels; "abc"/"12 kDa" are junk.
    // The blank line is skipped as an empty row.
    expect(data.numeric.tg).toEqual([-3, null, null, null, null]);
    expect(data.invalidNumericCount).toBe(2);
  });

  it("treats cells missing from a short row as blank", () => {
    const data = expectOk(parseImportCsv("Tg,Anion\n5,TFSI\n7\n", "e.csv"));
    expect(data.numeric.tg).toEqual([5, 7]);
    expect(data.categorical.anion).toEqual(["TFSI", null]);
  });

  it("snaps a category to the dataset's spelling when only case differs", () => {
    const data = expectOk(parseImportCsv("Anion\ntfsi\n  TFSI \nMyNewAnion\n", "f.csv"));
    expect(data.categorical.anion).toEqual(["TFSI", "TFSI", "MyNewAnion"]);
  });

  it("handles a UTF-8 BOM and CRLF line endings", () => {
    const data = expectOk(parseImportCsv("﻿approxTg,Tg\r\n1,2\r\n", "g.csv"));
    expect(data.matchedColumnIds).toEqual(["approxTg", "tg"]);
    expect(data.numeric.tg).toEqual([2]);
  });

  it("fails with no-matching-columns when nothing matches", () => {
    const result = parseImportCsv("foo,bar\n1,2\n", "h.csv");
    expect(result).toEqual({ ok: false, error: "no-matching-columns", fileName: "h.csv" });
  });

  it("fails with no-matching-columns for an empty file", () => {
    expect(parseImportCsv("", "empty.csv")).toMatchObject({
      ok: false,
      error: "no-matching-columns",
    });
  });

  it("fails with no-rows when headers match but there is no data", () => {
    expect(parseImportCsv("Tg,Anion\n", "i.csv")).toMatchObject({ ok: false, error: "no-rows" });
  });

  it("fails with too-many-rows past the cap", () => {
    const text = "Tg\n" + "1\n".repeat(MAX_IMPORT_ROWS + 1);
    expect(parseImportCsv(text, "big.csv")).toEqual({
      ok: false,
      error: "too-many-rows",
      fileName: "big.csv",
      rowCount: MAX_IMPORT_ROWS + 1,
    });
  });
});

describe("readImportFile", () => {
  it("reads a File's text and parses it", async () => {
    const file = new File(["Tg\n42\n"], "sample.csv", { type: "text/csv" });
    const data = expectOk(await readImportFile(file));
    expect(data.fileName).toBe("sample.csv");
    expect(data.numeric.tg).toEqual([42]);
  });
});

describe("importErrorMessage", () => {
  it("names the file and suggests real headers when nothing matched", () => {
    const message = importErrorMessage({
      ok: false,
      error: "no-matching-columns",
      fileName: "x.csv",
    });
    expect(message).toContain("x.csv");
    expect(message).toContain('"Conductivity at 60C"');
  });

  it("states the row count and the cap for an oversized file", () => {
    const message = importErrorMessage({
      ok: false,
      error: "too-many-rows",
      fileName: "big.csv",
      rowCount: 9000,
    });
    expect(message).toContain("9000");
    expect(message).toContain(String(MAX_IMPORT_ROWS));
  });
});
