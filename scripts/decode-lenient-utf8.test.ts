import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeLenientUtf8 } from "./decode-lenient-utf8";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Built from code points rather than embedded as literal characters/escapes
// in string literals, so what this file is actually asserting about stays
// legible instead of resting on invisible characters.
const NBSP = String.fromCharCode(0xa0);
const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);

describe("decodeLenientUtf8", () => {
  it("is a no-op on plain ASCII", () => {
    const buf = Buffer.from("polyethylene carbonate, TFSI, 30", "utf8");
    expect(decodeLenientUtf8(buf)).toBe("polyethylene carbonate, TFSI, 30");
  });

  it("passes valid multi-byte UTF-8 through untouched", () => {
    const text = "Chem. Mater. \u2013 caf\u00e9 \u2014 \u4e2d\u6587 \u2014 \ud83c\udf89";
    const buf = Buffer.from(text, "utf8");
    expect(decodeLenientUtf8(buf)).toBe(text);
  });

  it("repairs a stray raw Latin-1 0xA0 byte to U+00A0 instead of U+FFFD", () => {
    // "Chem." + 0xA0 (raw, not the valid 2-byte UTF-8 encoding 0xC2 0xA0) + "2018"
    const buf = Buffer.concat([Buffer.from("Chem.", "utf8"), Buffer.from([0xa0]), Buffer.from("2018", "utf8")]);
    const decoded = decodeLenientUtf8(buf);
    expect(decoded).toBe(`Chem.${NBSP}2018`);
    expect(decoded).not.toContain(REPLACEMENT_CHARACTER);
  });

  it("does not corrupt a legitimate, already-valid 0xC2 0xA0 (proper NBSP) sequence", () => {
    const buf = Buffer.from(`a${NBSP}b`, "utf8"); // proper 2-byte encoding
    expect(decodeLenientUtf8(buf)).toBe(`a${NBSP}b`);
  });

  it("falls back byte-by-byte for a truncated multi-byte sequence at end of buffer", () => {
    const buf = Buffer.concat([Buffer.from("x", "utf8"), Buffer.from([0xe2, 0x80])]); // incomplete 3-byte sequence
    const decoded = decodeLenientUtf8(buf);
    expect(decoded).not.toContain(REPLACEMENT_CHARACTER);
    expect(decoded.length).toBe(3); // "x" + 2 raw fallback code units
  });

  it("matches the exact citation text observed in the real CSV, with zero U+FFFD", () => {
    const csvPath = path.join(PROJECT_ROOT, "data/raw/_Cleaned_Final_Data_6_2_2020.csv");
    const decoded = decodeLenientUtf8(fs.readFileSync(csvPath));
    expect(decoded).not.toContain(REPLACEMENT_CHARACTER);
    expect(decoded).toContain(
      `Coordination,${NBSP}Chem. Mater.${NBSP}2018,${NBSP}30, 5759-${NBSP}5769.${NBSP}`,
    );
  });

  it("is a strict no-op on the already-valid forML CSV", () => {
    const csvPath = path.join(PROJECT_ROOT, "data/raw/_Cleaned_Final_Data-forML_6_2_2020.csv");
    const raw = fs.readFileSync(csvPath);
    expect(decodeLenientUtf8(raw)).toBe(raw.toString("utf8"));
  });
});
