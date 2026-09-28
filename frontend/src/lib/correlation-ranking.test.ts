import { describe, expect, it } from "vitest";
import {
  rankByAbsoluteCorrelation,
  rankColumnarCorrelations,
  rankMatrixRow,
  relativeCoverage,
  type CorrelationEntry,
} from "./correlation-ranking";
import correlationsJson from "@/data/generated/correlations.json";
import featureTargetJson from "@/data/generated/feature-target-correlations.json";

describe("rankByAbsoluteCorrelation", () => {
  it("sorts by |r| descending, regardless of sign", () => {
    const entries: CorrelationEntry[] = [
      { label: "small-positive", r: 0.1, n: 10 },
      { label: "large-negative", r: -0.9, n: 10 },
      { label: "medium-positive", r: 0.5, n: 10 },
    ];
    expect(rankByAbsoluteCorrelation(entries).map((e) => e.label)).toEqual([
      "large-negative",
      "medium-positive",
      "small-positive",
    ]);
  });

  it("drops entries with a null r — there is nothing to rank them by", () => {
    const entries: CorrelationEntry[] = [
      { label: "defined", r: 0.4, n: 10 },
      { label: "undefined-correlation", r: null, n: 7 },
    ];
    const ranked = rankByAbsoluteCorrelation(entries);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].label).toBe("defined");
  });

  it("breaks equal-|r| ties deterministically by label", () => {
    const entries: CorrelationEntry[] = [
      { label: "zeta", r: 0.5, n: 10 },
      { label: "alpha", r: -0.5, n: 10 },
    ];
    expect(rankByAbsoluteCorrelation(entries).map((e) => e.label)).toEqual(["alpha", "zeta"]);
  });

  it("preserves the sign of r (does not fold negative into positive)", () => {
    const entries: CorrelationEntry[] = [{ label: "a", r: -0.7, n: 5 }];
    expect(rankByAbsoluteCorrelation(entries)[0].r).toBe(-0.7);
  });

  it("returns an empty list for an empty input", () => {
    expect(rankByAbsoluteCorrelation([])).toEqual([]);
  });
});

describe("rankColumnarCorrelations", () => {
  it("zips parallel labels/r/n arrays into a ranked list", () => {
    const ranked = rankColumnarCorrelations(["a", "b", "c"], [0.1, -0.6, 0.3], [100, 200, 300]);
    expect(ranked.map((e) => e.label)).toEqual(["b", "c", "a"]);
    expect(ranked.find((e) => e.label === "b")).toEqual({ label: "b", r: -0.6, n: 200 });
  });

  it("drops a null-r column but keeps the rest", () => {
    const ranked = rankColumnarCorrelations(["a", "b"], [null, 0.2], [5, 50]);
    expect(ranked).toEqual([{ label: "b", r: 0.2, n: 50 }]);
  });

  it("throws on a length mismatch rather than silently misaligning labels", () => {
    expect(() => rankColumnarCorrelations(["a", "b"], [0.1], [10, 20])).toThrow(/length mismatch/);
  });
});

describe("rankMatrixRow", () => {
  const labels = ["x", "y", "z"];
  // Symmetric, diagonal 1 — same shape buildCorrelationMatrix produces.
  const matrix = [
    [1, 0.2, -0.8],
    [0.2, 1, 0.5],
    [-0.8, 0.5, 1],
  ];

  it("excludes the self pair on the diagonal", () => {
    const ranked = rankMatrixRow(labels, matrix, "x", 100);
    expect(ranked.map((e) => e.label)).not.toContain("x");
    expect(ranked).toHaveLength(2);
  });

  it("ranks the remaining row by |r| descending", () => {
    const ranked = rankMatrixRow(labels, matrix, "x", 100);
    expect(ranked.map((e) => e.label)).toEqual(["z", "y"]);
    expect(ranked[0].r).toBe(-0.8);
  });

  it("assigns every entry the same caller-supplied sample size", () => {
    const ranked = rankMatrixRow(labels, matrix, "y", 271);
    expect(ranked.every((e) => e.n === 271)).toBe(true);
  });

  it("throws for a label that isn't in the matrix", () => {
    expect(() => rankMatrixRow(labels, matrix, "nope", 100)).toThrow(/unknown label/);
  });

  // "Unit tests for ... reading a matrix row as a ranked list" against the
  // real generated data, not just a synthetic 3x3 — proves the function
  // works against correlations.json's actual shape (36 labels, values in
  // [-1, 1], diagonal 1) and that every feature target reuses it cleanly.
  describe("against the real generated correlation matrix", () => {
    const { labels: realLabels, matrix: realMatrix } = correlationsJson as {
      labels: string[];
      matrix: number[][];
    };

    it("returns the other 35 features, never the target itself", () => {
      const target = "approxTg";
      const ranked = rankMatrixRow(realLabels, realMatrix, target, 271);
      expect(ranked).toHaveLength(35);
      expect(ranked.some((e) => e.label === target)).toBe(false);
      expect(new Set(ranked.map((e) => e.label)).size).toBe(35);
    });

    it("puts the real matrix's strongest relationship first", () => {
      // approxTg's row: find the true max |r| by brute force and confirm
      // rankMatrixRow's first entry matches it — a cross-check against the
      // function's own sort rather than a hand-picked expected feature.
      const targetIndex = realLabels.indexOf("approxTg");
      let bestIndex = -1;
      let bestAbs = -1;
      realMatrix[targetIndex].forEach((r, i) => {
        if (i === targetIndex) return;
        if (Math.abs(r) > bestAbs) {
          bestAbs = Math.abs(r);
          bestIndex = i;
        }
      });
      const ranked = rankMatrixRow(realLabels, realMatrix, "approxTg", 271);
      expect(ranked[0].label).toBe(realLabels[bestIndex]);
      expect(ranked[0].r).toBeCloseTo(realMatrix[targetIndex][bestIndex], 12);
    });
  });
});

describe("rankMatrixRow and rankColumnarCorrelations against the real feature-target-correlations.json", () => {
  const data = featureTargetJson as {
    temperatures: number[];
    features: string[];
    r: (number | null)[][];
    n: number[][];
  };

  it("ranks Conductivity at 60C with approxTg on top of the six documented reference features", () => {
    const tempIndex = data.temperatures.indexOf(60);
    const ranked = rankColumnarCorrelations(data.features, data.r[tempIndex], data.n[tempIndex]);

    // Ground truth from the wave brief, independently computed.
    const expected: Record<string, { r: number; n: number }> = {
      approxTg: { r: -0.393, n: 302 },
      "approxMW(kDa)": { r: -0.323, n: 337 },
      "anion AETA_eta": { r: 0.306, n: 389 },
      "anion ETA_eta_L": { r: 0.264, n: 389 },
      "anion nO": { r: 0.237, n: 389 },
      "anion nHBAcc": { r: 0.223, n: 389 },
    };
    for (const [label, { r, n }] of Object.entries(expected)) {
      const entry = ranked.find((e) => e.label === label);
      expect(entry).toBeDefined();
      expect(entry?.r).toBeCloseTo(r, 3);
      expect(entry?.n).toBe(n);
    }

    // approxTg has the largest documented |r| among the six, and nothing in
    // the full 35-feature table beats it either (checked by construction:
    // this is the row-max, not just the max of the six above).
    expect(ranked[0].label).toBe("approxTg");
  });
});

describe("relativeCoverage", () => {
  it("is 1 when n equals the largest n in the view", () => {
    expect(relativeCoverage(389, 389)).toBe(1);
  });

  it("is the floor as n approaches 0", () => {
    expect(relativeCoverage(0, 389)).toBeCloseTo(0.3, 5);
  });

  it("is monotonically increasing in n", () => {
    expect(relativeCoverage(30, 389)).toBeLessThan(relativeCoverage(200, 389));
    expect(relativeCoverage(200, 389)).toBeLessThan(relativeCoverage(389, 389));
  });

  it("never exceeds 1 even if n somehow exceeds maxN", () => {
    expect(relativeCoverage(500, 389)).toBe(1);
  });

  it("falls back to full confidence when maxN is 0 (nothing to compare against)", () => {
    expect(relativeCoverage(0, 0)).toBe(1);
  });
});
