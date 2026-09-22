import { describe, expect, it } from "vitest";
import { buildCorrelationMatrix, pearsonCorrelation } from "./correlation";
import correlationsJson from "@/data/generated/correlations.json";
import originalJson from "../../data/reference/correlations-original.json";

describe("pearsonCorrelation", () => {
  it("is 1 for a perfectly linearly increasing relationship", () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12);
  });

  it("is -1 for a perfectly inverse relationship", () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12);
  });

  it("is pairwise-complete: rows where either value is null are excluded", () => {
    // Without the null row this is a perfect line; a naive treat-null-as-0
    // implementation would corrupt it.
    const a = [1, 2, null, 4];
    const b = [2, 4, 999, 8];
    expect(pearsonCorrelation(a, b)).toBeCloseTo(1, 12);
  });

  it("returns null with fewer than 2 overlapping points", () => {
    expect(pearsonCorrelation([1, null, null], [null, 2, null])).toBeNull();
  });

  it("returns null when a column has zero variance over the overlap", () => {
    expect(pearsonCorrelation([5, 5, 5], [1, 2, 3])).toBeNull();
  });
});

describe("buildCorrelationMatrix", () => {
  it("sets the diagonal to exactly 1 without going through the formula", () => {
    const columns = { a: [1, 2, 3], b: [3, 2, 1] };
    const { matrix } = buildCorrelationMatrix(["a", "b"], columns);
    expect(matrix[0][0]).toBe(1);
    expect(matrix[1][1]).toBe(1);
  });

  it("is symmetric", () => {
    const columns = { a: [1, 2, 3, 4], b: [4, 1, 2, 8], c: [1, 1, 2, 3] };
    const { matrix } = buildCorrelationMatrix(["a", "b", "c"], columns);
    expect(matrix[0][1]).toBeCloseTo(matrix[1][0], 12);
    expect(matrix[0][2]).toBeCloseTo(matrix[2][0], 12);
    expect(matrix[1][2]).toBeCloseTo(matrix[2][1], 12);
  });

  it("throws rather than silently emitting a bogus entry for undefined correlations", () => {
    const columns = { a: [1, 1, 1], b: [1, 2, 3] };
    expect(() => buildCorrelationMatrix(["a", "b"], columns)).toThrow(/undefined correlation/);
  });
});

interface CorrelationsJson {
  labels: string[];
  matrix: number[][];
}

describe("the generated correlation matrix (DATA-SPEC.md §4)", () => {
  const ours = correlationsJson as CorrelationsJson;
  const original = originalJson as CorrelationsJson;

  it("is 36x36 with a diagonal of exactly 1.0", () => {
    expect(ours.labels).toHaveLength(36);
    expect(ours.matrix).toHaveLength(36);
    for (let i = 0; i < 36; i++) {
      expect(ours.matrix[i]).toHaveLength(36);
      expect(ours.matrix[i][i]).toBe(1);
    }
  });

  it("uses the same label order as the original (and the feature glossary)", () => {
    expect(ours.labels).toEqual(original.labels);
  });

  // This is the crux of DATA-SPEC.md §4: the original multiplied every
  // entry by n/(n-1) = 271/270 because it standardized with population std
  // (ddof=0) but took the sample covariance (ddof=1). Scaling our
  // (correct) matrix back up by that same ratio should reproduce the
  // original almost exactly, proving we understand the discrepancy rather
  // than just asserting our own answer is different.
  it("times 271/270 reproduces the original matrix within 1e-6", () => {
    const ratio = 271 / 270;
    let maxDiff = 0;
    for (let i = 0; i < 36; i++) {
      for (let j = 0; j < 36; j++) {
        const scaled = ours.matrix[i][j] * ratio;
        maxDiff = Math.max(maxDiff, Math.abs(scaled - original.matrix[i][j]));
      }
    }
    expect(maxDiff).toBeLessThan(1e-6);
  });
});
