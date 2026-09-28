import { describe, expect, it } from "vitest";
import { buildNullSeparatedGroups } from "@/components/charts/series";

// The temperature page concatenates up to 655 sample lines into <= 8 traces
// using null separators, so a click has to resolve through customdata rather
// than through a trace index. An off-by-one here would silently attribute a
// data point to the wrong paper — the kind of bug that looks fine on screen.
// This asserts the mapping end-to-end with values that encode their origin.
describe("null-separator index mapping", () => {
  it("maps every concatenated point back to its true source row", () => {
    // 3 samples in the SAME colour slot, deliberately different lengths,
    // with values encoding their origin so misalignment is detectable.
    const samples = [
      { rank: 0, category: "TFSI", rowIndex: 41, x: [1, 2, 3], y: [4100, 4101, 4102] },
      { rank: 0, category: "TFSI", rowIndex: 77, x: [4], y: [7700] },
      { rank: 0, category: "TFSI", rowIndex: 12, x: [5, 6], y: [1200, 1201] },
    ];
    const groups = buildNullSeparatedGroups(samples);
    expect(groups).toHaveLength(1);
    const g = groups[0];

    expect(g.x.length).toBe(g.y.length);
    expect(g.x.length).toBe(g.customdata.length);
    // 6 real points + 2 separators
    expect(g.x.length).toBe(8);

    for (let i = 0; i < g.x.length; i++) {
      if (g.x[i] === null) {
        expect(g.y[i]).toBeNull();
        expect(g.customdata[i]).toBeNull();
        continue;
      }
      // y encodes rowIndex*100 + offset; customdata must name that same row
      const claimed = g.customdata[i] as number;
      expect(Math.floor((g.y[i] as number) / 100)).toBe(claimed);
    }
    expect(g.x).toEqual([1, 2, 3, null, 4, null, 5, 6]);
    expect(g.customdata).toEqual([41, 41, 41, null, 77, null, 12, 12]);
  });
});
