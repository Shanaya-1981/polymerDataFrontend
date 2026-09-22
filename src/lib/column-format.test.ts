import { describe, expect, it } from "vitest";
import { COLUMNS } from "@/data";
import { columnDisplayName } from "./column-format";

describe("columnDisplayName", () => {
  it("appends the unit when the label doesn't already carry it", () => {
    expect(
      columnDisplayName(
        { id: "x", label: "approxTg", kind: "continuous", unit: "°C" } as never,
        "x",
      ),
    ).toBe("approxTg (°C)");
  });

  it("does not repeat a unit the label already ends with", () => {
    expect(
      columnDisplayName(
        { id: "x", label: "approxMW(kDa)", kind: "continuous", unit: "kDa" } as never,
        "x",
      ),
    ).toBe("approxMW(kDa)");
  });

  it("falls back for an unknown column", () => {
    expect(columnDisplayName(undefined, "mystery")).toBe("mystery");
  });

  // Data-driven rather than spot-checked: this is the assertion that actually
  // holds the line. Nine of the real columns embed their unit in the label
  // (`approxMW(kDa)`, `Arrhenius Ea (eV)`, `VFT prefactor (S/cm*T^(1/2))`, …),
  // so a naive formatter produces "approxMW(kDa) (kDa)". Checking every
  // generated column means a newly-added one can't reintroduce it.
  it("never doubles a unit for any column in the real registry", () => {
    const doubled = COLUMNS.filter((meta) => {
      if (!meta.unit) return false;
      const rendered = columnDisplayName(meta, meta.id);
      // The unit's own text should appear exactly once in the rendered name.
      return rendered.split(`(${meta.unit})`).length - 1 !== 1;
    }).map((meta) => `${meta.id}: ${columnDisplayName(meta, meta.id)}`);

    expect(doubled).toEqual([]);
  });

  it("still shows the unit exactly once for the nine self-describing labels", () => {
    const selfDescribing = COLUMNS.filter((m) => m.unit && m.label.endsWith(`(${m.unit})`));
    expect(selfDescribing.length).toBe(9);
    for (const meta of selfDescribing) {
      expect(columnDisplayName(meta, meta.id)).toBe(meta.label);
    }
  });
});
