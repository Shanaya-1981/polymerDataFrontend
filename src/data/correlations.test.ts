import { describe, expect, it } from "vitest";
import { CORRELATION_LABELS, correlationBetween, correlationMatrix } from "./correlations";

describe("correlation accessors", () => {
  it("has 36 labels and a 36x36 matrix with an exact 1.0 diagonal", () => {
    expect(CORRELATION_LABELS).toHaveLength(36);
    const matrix = correlationMatrix();
    expect(matrix).toHaveLength(36);
    matrix.forEach((row, i) => expect(row[i]).toBe(1));
  });

  it("correlationBetween a label and itself is exactly 1", () => {
    const label = CORRELATION_LABELS[0];
    expect(correlationBetween(label, label)).toBe(1);
  });

  it("correlationBetween is symmetric", () => {
    const [a, b] = CORRELATION_LABELS;
    expect(correlationBetween(a, b)).toBe(correlationBetween(b, a));
  });

  it("returns null for an unknown label", () => {
    expect(correlationBetween("not-a-real-feature", CORRELATION_LABELS[0])).toBeNull();
  });
});
