import { describe, expect, it } from "vitest";
import type { CellValue, Row } from "@/data";
import { buildFilteredCsv } from "./csv";

/** A fully synthetic row — unlike this directory's other tests, this file
 *  wants exact control over field values (no stray commas/quotes from real
 *  citation text) so the exact CSV string can be asserted byte for byte. */
function makeRow(rowIndex: number, overrides: Record<string, CellValue>): Row {
  return { rowIndex, ...overrides } as unknown as Row;
}

describe("buildFilteredCsv", () => {
  it("headers with each column's label and unit, in the given order", () => {
    const row = makeRow(0, { polymer: "PEO", approxTg: -60 });
    const csv = buildFilteredCsv(["approxTg", "polymer"], [row]);
    const [headerLine] = csv.split("\r\n");
    expect(headerLine).toBe("approxTg (°C),Polymer");
  });

  it("emits only the requested columns' values — never another column on the row", () => {
    const row = makeRow(0, { polymer: "PEO", anion: "TFSI", approxTg: -60 });
    const csv = buildFilteredCsv(["anion", "polymer"], [row]);
    expect(csv).toBe("Anion,Polymer\r\nTFSI,PEO");
    expect(csv).not.toContain("-60");
  });

  it("emits one line per given row, in the given order (not the dataset's row order)", () => {
    const rowA = makeRow(5, { polymer: "PEO" });
    const rowB = makeRow(2, { polymer: "PVDF" });
    expect(buildFilteredCsv(["polymer"], [rowA, rowB])).toBe("Polymer\r\nPEO\r\nPVDF");
  });

  it("renders a null cell as an empty field, matching toCsv's own convention", () => {
    const row = makeRow(0, { notes: null });
    expect(buildFilteredCsv(["notes"], [row])).toBe("Notes\r\n");
  });

  it("returns just the header row for an empty row set", () => {
    expect(buildFilteredCsv(["polymer", "anion"], [])).toBe("Polymer,Anion");
  });

  it("returns an empty string for no columns and no rows", () => {
    expect(buildFilteredCsv([], [])).toBe("");
  });
});
