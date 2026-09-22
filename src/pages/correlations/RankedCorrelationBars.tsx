import { CHART_PALETTE } from "@/styles/chart-palette";
import { Notice } from "@/components/ui";
import { relativeCoverage, type RankedCorrelation } from "@/lib/correlation-ranking";
import { formatTickLabel } from "./tick-labels";

// Same mapping `series.ts`'s `divergingColorscale` uses for the matrix
// heatmap (slot 2 blue for negative, slot 1 pink-red for positive), so the
// two views read as one system. These are plain DOM nodes painted through
// the CSS cascade (not Plotly SVG/canvas), so the `var(--chart-N)` form is
// used directly — see chart-palette.ts's own doc comment on preferring
// `cssVar` in rendered output for zero-JS theme reactivity.
const NEGATIVE_COLOR = CHART_PALETTE[1].cssVar; // blue
const POSITIVE_COLOR = CHART_PALETTE[0].cssVar; // pink-red

const ROW_LABEL_MAX_CHARS = 22;

function formatSignedR(r: number): string {
  return `${r >= 0 ? "+" : ""}${r.toFixed(3)}`;
}

export interface RankedCorrelationBarsProps {
  entries: readonly RankedCorrelation[];
}

/**
 * Sorted, signed diverging bar list — the mobile-friendly alternative to the
 * 36x36 matrix. Plain DOM, not Plotly: a list this simple doesn't need a
 * canvas/SVG chart library, and percentage-width `<div>`s are inherently
 * responsive, which is exactly what the matrix's fixed 860px grid isn't.
 *
 * `n` matters as much as `r` here because coverage is uneven (see the wave
 * brief). Every row prints its exact `n`, and each bar's opacity is scaled
 * by {@link relativeCoverage} against the largest `n` *in this list*, so a
 * correlation built on a thin sample looks visibly less certain rather than
 * just as solid as one backed by hundreds of rows — never hidden, just
 * de-emphasized.
 */
export function RankedCorrelationBars({ entries }: RankedCorrelationBarsProps) {
  if (entries.length === 0) {
    return <Notice tone="info">No correlations are available for this target.</Notice>;
  }

  const maxN = Math.max(...entries.map((entry) => entry.n));

  return (
    <ul
      role="list"
      className="flex flex-col divide-y divide-subtle rounded-lg border border-subtle bg-surface"
    >
      {entries.map((entry) => {
        const opacity = relativeCoverage(entry.n, maxN);
        const magnitudePercent = Math.min(Math.abs(entry.r), 1) * 100;
        const positive = entry.r >= 0;

        return (
          // Below `sm` the row stacks: the feature name gets a full-width
          // line of its own, then the bar and numbers sit underneath. Keeping
          // them on one line meant an 80px name column, which truncated
          // "anion AETA_eta" and "anion ETA_eta_L" into the same ambiguous
          // stub — the exact failure the matrix's own labels had. These names
          // share long prefixes and differ at the end, so they need the width.
          <li
            key={entry.label}
            className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
          >
            <span
              className="text-sm text-secondary sm:w-40 sm:shrink-0 sm:truncate"
              title={entry.label}
            >
              {formatTickLabel(entry.label, ROW_LABEL_MAX_CHARS)}
            </span>

            <div className="flex items-center gap-2 sm:min-w-0 sm:flex-1 sm:gap-3">
              <div className="relative flex h-4 min-w-0 flex-1 items-stretch" aria-hidden="true">
                <div className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-default" />
                <div className="grid h-full w-full grid-cols-2">
                  <div className="flex justify-end overflow-hidden">
                    {!positive ? (
                      <div
                        className="h-full rounded-l-sm"
                        style={{
                          width: `${magnitudePercent}%`,
                          backgroundColor: NEGATIVE_COLOR,
                          opacity,
                        }}
                      />
                    ) : null}
                  </div>
                  <div className="flex justify-start overflow-hidden">
                    {positive ? (
                      <div
                        className="h-full rounded-r-sm"
                        style={{
                          width: `${magnitudePercent}%`,
                          backgroundColor: POSITIVE_COLOR,
                          opacity,
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              </div>

              <span className="w-14 shrink-0 text-right text-sm tabular text-primary">
                {formatSignedR(entry.r)}
              </span>
              <span className="w-12 shrink-0 text-right text-xs tabular text-muted">
                n={entry.n}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
