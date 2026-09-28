/**
 * What the ranked-correlation view's target picker can point at, and how to
 * turn a chosen target into a ranked list. Two kinds of target, two data
 * sources, one shared ranking path (`@/lib/correlation-ranking`):
 *
 * - a conductivity temperature → `feature-target-correlations.json` (main
 *   CSV, this agent's new build-time table).
 * - a glossary feature → a row of the existing 36x36 matrix
 *   (`correlations.json`, forML CSV) — reused as-is, per the wave brief:
 *   "a row of the existing 36×36 matrix already *is* the ranked list."
 */
import { CORRELATION_LABELS, correlationMatrix } from "@/data";
import type { ComboboxOption } from "@/components/ui";
import { FEATURE_GLOSSARY } from "../features/feature-glossary";
import {
  FEATURE_TARGET_FEATURES,
  FEATURE_TARGET_TEMPERATURES_C,
  MATRIX_SAMPLE_SIZE,
  featureTargetRow,
} from "./feature-target-correlations";
import {
  rankColumnarCorrelations,
  rankMatrixRow,
  type RankedCorrelation,
} from "@/lib/correlation-ranking";

export type CorrelationTarget =
  | { readonly kind: "conductivity"; readonly temperatureC: number }
  | { readonly kind: "feature"; readonly mlColumn: string };

const CONDUCTIVITY_VALUE_PREFIX = "conductivity:";
const FEATURE_VALUE_PREFIX = "feature:";

/** Encode a target as the single string `Combobox` needs for its `value`/`onChange`. */
export function targetToValue(target: CorrelationTarget): string {
  return target.kind === "conductivity"
    ? `${CONDUCTIVITY_VALUE_PREFIX}${target.temperatureC}`
    : `${FEATURE_VALUE_PREFIX}${target.mlColumn}`;
}

/** Inverse of {@link targetToValue}. Returns `null` for anything that isn't a live option — Combobox only ever hands back one of its own option values, but a decoder that can fail loudly is safer than one that assumes. */
export function targetFromValue(value: string): CorrelationTarget | null {
  if (value.startsWith(CONDUCTIVITY_VALUE_PREFIX)) {
    const temperatureC = Number(value.slice(CONDUCTIVITY_VALUE_PREFIX.length));
    return Number.isFinite(temperatureC) && FEATURE_TARGET_TEMPERATURES_C.includes(temperatureC)
      ? { kind: "conductivity", temperatureC }
      : null;
  }
  if (value.startsWith(FEATURE_VALUE_PREFIX)) {
    const mlColumn = value.slice(FEATURE_VALUE_PREFIX.length);
    return CORRELATION_LABELS.includes(mlColumn) ? { kind: "feature", mlColumn } : null;
  }
  return null;
}

function glossaryFeatureName(mlColumn: string): string {
  return FEATURE_GLOSSARY.find((entry) => entry.mlColumn === mlColumn)?.feature ?? mlColumn;
}

/** Display label for a target: "60 °C" for a conductivity temperature, the glossary's plain-language name for a feature. */
export function targetLabel(target: CorrelationTarget): string {
  return target.kind === "conductivity" ? `${target.temperatureC} °C` : glossaryFeatureName(target.mlColumn);
}

/** The full option list for the target `Combobox`: 22 conductivity temperatures followed by all 36 glossary features (including `drying vacuum` — it's a valid *feature* target via the matrix; it's only excluded from the conductivity table). */
export function buildTargetOptions(): ComboboxOption[] {
  const temperatureOptions = FEATURE_TARGET_TEMPERATURES_C.map((temperatureC) => ({
    value: targetToValue({ kind: "conductivity", temperatureC }),
    label: `${temperatureC} °C`,
    hint: "Conductivity",
  }));
  const featureOptions = CORRELATION_LABELS.map((mlColumn) => ({
    value: targetToValue({ kind: "feature", mlColumn }),
    label: glossaryFeatureName(mlColumn),
    hint: "Feature",
  }));
  return [...temperatureOptions, ...featureOptions];
}

/** Conductivity at 60°C: the temperature with the most measurements (389) and the one every reference number in this feature's build brief was checked against. */
export const DEFAULT_TARGET: CorrelationTarget = { kind: "conductivity", temperatureC: 60 };

export interface TargetRanking {
  readonly entries: readonly RankedCorrelation[];
  /** Set only for a feature target, where every entry shares one `n` because it comes from one square matrix — surfaced so the UI can explain *why* every bar has the same sample size, instead of leaving it looking like a coincidence. */
  readonly matrixSampleSize: number | null;
}

/** Resolve a target to its ranked list, dispatching to whichever data source it needs. */
export function resolveTargetRanking(target: CorrelationTarget): TargetRanking {
  if (target.kind === "conductivity") {
    const { r, n } = featureTargetRow(target.temperatureC);
    return { entries: rankColumnarCorrelations(FEATURE_TARGET_FEATURES, r, n), matrixSampleSize: null };
  }
  return {
    entries: rankMatrixRow(CORRELATION_LABELS, correlationMatrix(), target.mlColumn, MATRIX_SAMPLE_SIZE),
    matrixSampleSize: MATRIX_SAMPLE_SIZE,
  };
}
