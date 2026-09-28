import { FEATURE_TARGET_EXCLUDED_FEATURE } from "./feature-target-correlations";
import { RankedCorrelationBars } from "./RankedCorrelationBars";
import { targetLabel, type CorrelationTarget, type TargetRanking } from "./targets";

export interface RankedCorrelationViewProps {
  target: CorrelationTarget;
  ranking: TargetRanking;
}

/**
 * The ranked-list view's body: a caption naming the current target, the bar
 * list itself, and a closing note explaining *why* the numbers look the way
 * they do — the drying-vacuum gap for a conductivity target, or the shared
 * sample size for a feature target (reused straight from the 36x36 matrix).
 */
export function RankedCorrelationView({ target, ranking }: RankedCorrelationViewProps) {
  const otherCount = ranking.entries.length;

  return (
    <figure className="m-0 flex flex-col gap-3" aria-label="Ranked correlations">
      <figcaption className="text-sm text-secondary">
        The other {otherCount} feature{otherCount === 1 ? "" : "s"}, ranked by |r| against{" "}
        <span className="font-medium text-primary">{targetLabel(target)}</span>.
      </figcaption>

      <RankedCorrelationBars entries={ranking.entries} />

      {target.kind === "feature" ? (
        <p className="text-xs text-muted">
          Every bar above is based on the same {ranking.matrixSampleSize} samples — the ML training
          subset behind the feature-vs-feature matrix.
        </p>
      ) : (
        <p className="text-xs text-muted">
          <span className="font-mono">{FEATURE_TARGET_EXCLUDED_FEATURE.mlColumn}</span> isn&rsquo;t
          shown here: {FEATURE_TARGET_EXCLUDED_FEATURE.reason}
        </p>
      )}
    </figure>
  );
}
