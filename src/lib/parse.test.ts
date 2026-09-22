import { describe, expect, it } from "vitest";
import { parseNumericCell, parseTextCell, UNKNOWN_ATOM_TYPE_SENTINEL } from "./parse";

describe("parseNumericCell", () => {
  it("parses plain integers and decimals", () => {
    expect(parseNumericCell("42")).toBe(42);
    expect(parseNumericCell("-3")).toBe(-3);
    expect(parseNumericCell("3.98")).toBe(3.98);
    expect(parseNumericCell(".5")).toBe(0.5);
    expect(parseNumericCell("-.5")).toBe(-0.5);
    expect(parseNumericCell("5.")).toBe(5);
  });

  it("parses scientific notation, common in conductivity values", () => {
    expect(parseNumericCell("3.98e-08")).toBeCloseTo(3.98e-8);
    expect(parseNumericCell("6.79E-11")).toBeCloseTo(6.79e-11);
    expect(parseNumericCell("1E+5")).toBe(1e5);
  });

  it("trims surrounding whitespace before parsing", () => {
    expect(parseNumericCell("  3.98e-08  ")).toBeCloseTo(3.98e-8);
  });

  it("nulls every documented sentinel, case-insensitively", () => {
    expect(parseNumericCell("")).toBeNull();
    expect(parseNumericCell("   ")).toBeNull();
    expect(parseNumericCell("none")).toBeNull();
    expect(parseNumericCell("None")).toBeNull();
    expect(parseNumericCell("NONE")).toBeNull();
    expect(parseNumericCell("na")).toBeNull();
    expect(parseNumericCell("NA")).toBeNull();
    expect(parseNumericCell("n/a")).toBeNull();
    expect(parseNumericCell("N/A")).toBeNull();
    expect(parseNumericCell(UNKNOWN_ATOM_TYPE_SENTINEL)).toBeNull();
    expect(parseNumericCell(UNKNOWN_ATOM_TYPE_SENTINEL.toUpperCase())).toBeNull();
    expect(parseNumericCell(UNKNOWN_ATOM_TYPE_SENTINEL.toLowerCase())).toBeNull();
  });

  it("throws on unrecognized non-numeric junk instead of silently nulling it", () => {
    expect(() => parseNumericCell("banana")).toThrow(/unparseable/);
    expect(() => parseNumericCell("12abc")).toThrow(/unparseable/);
    expect(() => parseNumericCell("1,234")).toThrow(/unparseable/);
  });
});

describe("parseTextCell", () => {
  it("trims and passes through normal text", () => {
    expect(parseTextCell("  TFSI  ")).toBe("TFSI");
  });

  it("treats empty/whitespace-only strings as null", () => {
    expect(parseTextCell("")).toBeNull();
    expect(parseTextCell("   ")).toBeNull();
  });

  it("preserves sentinel-looking values that are real categories", () => {
    expect(parseTextCell("na")).toBe("na");
    expect(parseTextCell("none")).toBe("none");
  });

  it("normalizes non-breaking spaces to regular spaces", () => {
    const nbsp = String.fromCharCode(160);
    expect(parseTextCell(`Chem.${nbsp}Mater.${nbsp}2018`)).toBe("Chem. Mater. 2018");
  });
});
