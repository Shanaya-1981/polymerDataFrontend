import featureGlossaryJson from "@/data/generated/feature-glossary.json";

export interface FeatureGlossaryEntry {
  readonly number: number;
  readonly feature: string;
  readonly description: string;
  readonly mlColumn: string;
}

/**
 * The full 36-row ML feature glossary. Never hand-retyped: the build script
 * copies it verbatim from the verified `data/reference/feature-glossary.json`
 * into the generated data layer, so it cannot drift, and nothing under `src/`
 * has to import out of the reconnaissance directory. Row order matches
 * `CORRELATION_LABELS` (`@/data/correlations`) 1:1.
 */
export const FEATURE_GLOSSARY: readonly FeatureGlossaryEntry[] = featureGlossaryJson;
