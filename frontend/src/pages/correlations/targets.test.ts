import { describe, expect, it } from "vitest";
import { CORRELATION_LABELS } from "@/data";
import {
  buildTargetOptions,
  DEFAULT_TARGET,
  resolveTargetRanking,
  targetFromValue,
  targetLabel,
  targetToValue,
  type CorrelationTarget,
} from "./targets";
import { FEATURE_TARGET_TEMPERATURES_C } from "./feature-target-correlations";

describe("targetToValue / targetFromValue", () => {
  it("round-trips a conductivity target", () => {
    const target: CorrelationTarget = { kind: "conductivity", temperatureC: 60 };
    expect(targetFromValue(targetToValue(target))).toEqual(target);
  });

  it("round-trips a feature target", () => {
    const target: CorrelationTarget = { kind: "feature", mlColumn: "approxTg" };
    expect(targetFromValue(targetToValue(target))).toEqual(target);
  });

  it("rejects a temperature that isn't one of the 22 measured", () => {
    expect(targetFromValue("conductivity:37")).toBeNull();
  });

  it("rejects a feature that isn't one of the 36 glossary columns", () => {
    expect(targetFromValue("feature:not-a-real-column")).toBeNull();
  });

  it("rejects garbage input", () => {
    expect(targetFromValue("")).toBeNull();
    expect(targetFromValue("nonsense")).toBeNull();
  });
});

describe("targetLabel", () => {
  it("formats a conductivity target with its unit", () => {
    expect(targetLabel({ kind: "conductivity", temperatureC: 60 })).toBe("60 °C");
  });

  it("formats a feature target with its plain-language glossary name", () => {
    expect(targetLabel({ kind: "feature", mlColumn: "approxMW(kDa)" })).toBe("approximate MW (kDa)");
  });

  it("falls back to the raw mlColumn for a feature outside the glossary, rather than throwing", () => {
    expect(targetLabel({ kind: "feature", mlColumn: "not-a-real-column" })).toBe("not-a-real-column");
  });
});

describe("buildTargetOptions", () => {
  const options = buildTargetOptions();

  it("offers all 22 conductivity temperatures plus all 36 glossary features", () => {
    expect(options).toHaveLength(22 + 36);
  });

  it("has no duplicate option values", () => {
    expect(new Set(options.map((o) => o.value)).size).toBe(options.length);
  });

  it("includes drying vacuum as a feature target (only excluded from the conductivity table, not from targets)", () => {
    const dryingVacuum = options.find((o) => o.value === "feature:drying vacuum");
    expect(dryingVacuum).toBeDefined();
    expect(dryingVacuum?.hint).toBe("Feature");
  });

  it("hints every option with its group", () => {
    for (const temperatureC of FEATURE_TARGET_TEMPERATURES_C) {
      expect(options.find((o) => o.value === `conductivity:${temperatureC}`)?.hint).toBe(
        "Conductivity",
      );
    }
    for (const mlColumn of CORRELATION_LABELS) {
      expect(options.find((o) => o.value === `feature:${mlColumn}`)?.hint).toBe("Feature");
    }
  });
});

describe("resolveTargetRanking", () => {
  it("reads the feature-target table for a conductivity target, and matches the documented 60C values", () => {
    const ranking = resolveTargetRanking(DEFAULT_TARGET); // 60 °C
    expect(ranking.matrixSampleSize).toBeNull();

    const expected: Record<string, { r: number; n: number }> = {
      approxTg: { r: -0.393, n: 302 },
      "approxMW(kDa)": { r: -0.323, n: 337 },
      "anion AETA_eta": { r: 0.306, n: 389 },
      "anion ETA_eta_L": { r: 0.264, n: 389 },
      "anion nO": { r: 0.237, n: 389 },
      "anion nHBAcc": { r: 0.223, n: 389 },
    };
    for (const [label, { r, n }] of Object.entries(expected)) {
      const entry = ranking.entries.find((e) => e.label === label);
      expect(entry?.r).toBeCloseTo(r, 3);
      expect(entry?.n).toBe(n);
    }
    expect(ranking.entries[0].label).toBe("approxTg");
    // drying vacuum is excluded from this table — must never show up here.
    expect(ranking.entries.some((e) => e.label === "drying vacuum")).toBe(false);
  });

  it("reads a matrix row for a feature target, excluding the target itself, with the matrix's sample size attached", () => {
    const ranking = resolveTargetRanking({ kind: "feature", mlColumn: "approxTg" });
    expect(ranking.matrixSampleSize).toBe(271);
    expect(ranking.entries).toHaveLength(35);
    expect(ranking.entries.some((e) => e.label === "approxTg")).toBe(false);
    expect(ranking.entries.every((e) => e.n === 271)).toBe(true);
  });

  it("agrees both ways for the same pair of features (matrix is symmetric)", () => {
    const fromA = resolveTargetRanking({ kind: "feature", mlColumn: "approxTg" }).entries.find(
      (e) => e.label === "approxMW(kDa)",
    );
    const fromB = resolveTargetRanking({ kind: "feature", mlColumn: "approxMW(kDa)" }).entries.find(
      (e) => e.label === "approxTg",
    );
    expect(fromA?.r).toBeCloseTo(fromB?.r ?? NaN, 12);
  });
});
