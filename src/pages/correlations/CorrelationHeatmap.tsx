import { useMemo } from "react";
import {
  PlotlyChart,
  buildCorrelationHeatmapTrace,
  useChartThemeMode,
  useChartThemeTokens,
  type CorrelationMatrix,
  type PlotlyLayout,
} from "@/components/charts";
import { CORRELATION_LABELS, correlationMatrix } from "@/data";
import { TICK_LABEL_LEGEND, formatTickLabel } from "./tick-labels";

/**
 * The 36×36 Pearson correlation heatmap (DATA-SPEC.md §4).
 *
 * 36 labels on both axes is the real design problem here:
 * - `scaleanchor`/`scaleratio` on the y-axis lock the plot to a square grid
 *   regardless of the container's aspect ratio.
 * - Tick labels are rotated -45° and truncated (see `./tick-labels.ts`) so
 *   full names still appear in the hover tooltip, which reads off the
 *   trace's real data, not the shortened `ticktext`.
 * - The outer wrapper scrolls horizontally below `min-w-[820px]` instead of
 *   squashing 36 columns into unreadable slivers on a phone; the inner
 *   panel keeps a tall, roughly-square viewport height so the grid stays
 *   legible once you do scroll.
 */
export function CorrelationHeatmap() {
  const mode = useChartThemeMode();
  const tokens = useChartThemeTokens();

  const matrix: CorrelationMatrix = useMemo(
    () => ({ labels: CORRELATION_LABELS, z: correlationMatrix() }),
    [],
  );

  const trace = useMemo(() => buildCorrelationHeatmapTrace(matrix, mode), [matrix, mode]);

  const tickText = useMemo(() => CORRELATION_LABELS.map((label) => formatTickLabel(label)), []);

  const layout = useMemo<Partial<PlotlyLayout>>(
    () => ({
      margin: { l: 160, r: 24, t: 16, b: 160, pad: 4 },
      xaxis: {
        tickangle: -45,
        tickmode: "array",
        tickvals: [...CORRELATION_LABELS],
        ticktext: tickText,
        tickfont: { size: 10, color: tokens.textSecondary },
        automargin: true,
      },
      yaxis: {
        tickmode: "array",
        tickvals: [...CORRELATION_LABELS],
        ticktext: tickText,
        tickfont: { size: 10, color: tokens.textSecondary },
        automargin: true,
        autorange: "reversed",
        scaleanchor: "x",
        scaleratio: 1,
      },
    }),
    [tickText, tokens],
  );

  return (
    <figure className="m-0">
      {/* The matrix is square (scaleanchor + scaleratio), so the container has
          to be roughly square too — a full-width box just letterboxes the plot
          and leaves most of the card empty. Below the min-width it scrolls
          horizontally rather than squashing 36x36 cells into slivers. */}
      <div className="overflow-x-auto rounded-lg border border-subtle bg-surface">
        <div className="mx-auto aspect-square w-full max-w-[980px] min-w-[860px] p-2">
          <PlotlyChart
            data={[trace]}
            layout={layout}
            ariaLabel="Correlation heatmap of 36 machine-learning features, colored from blue (negative correlation) through gray (no correlation) to pink-red (positive correlation)"
          />
        </div>
      </div>
      <figcaption className="mt-2 text-sm text-muted">
        Axis labels are abbreviated: {TICK_LABEL_LEGEND}. Hover any cell for the full feature names
        and the exact r value.
      </figcaption>
    </figure>
  );
}
