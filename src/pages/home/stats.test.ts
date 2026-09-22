import { describe, expect, it } from "vitest";
import { ROW_COUNT, TEMPERATURES_C, categoryOrder } from "@/data";
import { landingStats } from "./stats";

describe("landingStats", () => {
  it("derives every value from the data layer, not a literal", () => {
    const stats = landingStats();
    const byLabel = Object.fromEntries(stats.map((s) => [s.label, s.value]));

    // Each expected value is itself computed from the same accessors the
    // dataviz pages use, so this fails if `landingStats` ever hard-codes a
    // number instead of deriving it.
    expect(byLabel.Samples).toBe(ROW_COUNT);
    expect(byLabel["Source papers"]).toBe(categoryOrder("doi").length);
    expect(byLabel.Polymers).toBe(categoryOrder("polymer").length);
    expect(byLabel.Anions).toBe(categoryOrder("anion").length);
    expect(byLabel["Polymer families"]).toBe(categoryOrder("polymerFamily").length);
    expect(byLabel["Measured temperatures"]).toBe(TEMPERATURES_C.length);
  });

  it("matches the ground-truth counts verified in DATA-SPEC.md", () => {
    const stats = landingStats();
    const byLabel = Object.fromEntries(stats.map((s) => [s.label, s.value]));

    expect(byLabel).toEqual({
      Samples: 655,
      "Source papers": 65,
      Polymers: 78,
      Anions: 12,
      "Polymer families": 24,
      "Measured temperatures": 22,
    });
  });

  it("returns a stable set of labels with no duplicates", () => {
    const labels = landingStats().map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
