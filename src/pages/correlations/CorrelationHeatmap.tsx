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
 * Fixed top/bottom margins Plotly reserves around the plot area (rotated
 * x-axis labels need real room at the bottom; there's no top axis). Shared
 * with the sticky label column below, in absolute pixels on both sides, so
 * the column's 36 rows land exactly on the heatmap's 36 categorical bands
 * regardless of the container's actual rendered height — no ResizeObserver
 * or measured geometry needed, just the same two numbers in two places.
 */
const HEATMAP_MARGIN = { l: 12, r: 24, t: 16, b: 160, pad: 4 } as const;

/** Width of the sticky row-label column, and how many characters of the
 *  abbreviated label it gives each row before eliding (see `./tick-labels`). */
const LABEL_COLUMN_WIDTH_PX = 132;
const LABEL_MAX_CHARS = 20;

/**
 * The 36×36 Pearson correlation heatmap (DATA-SPEC.md §4).
 *
 * 36 labels on both axes is the real design problem here:
 * - `scaleanchor`/`scaleratio` on the y-axis lock the plot to a square grid
 *   regardless of the container's aspect ratio.
 * - The outer wrapper scrolls horizontally below `min-w-[860px]` instead of
 *   squashing 36 columns into unreadable slivers on a phone; the inner
 *   panel keeps a tall, roughly-square viewport height so the grid stays
 *   legible once you do scroll.
 * - Column (x-axis) labels are rotated -45° and truncated (see
 *   `./tick-labels.ts`) so full names still appear in the hover tooltip,
 *   which reads off the trace's real data, not the shortened `ticktext`.
 *   They scroll horizontally with their columns, which is correct.
 * - Row (y-axis) labels are a **separate, real DOM column** — not Plotly's
 *   own y-axis text (`showticklabels: false` below) — `position: sticky`
 *   pinned to the left of the same scrolling container the chart sits in.
 *   Plotly draws its axes as part of one SVG, so a sub-region of that SVG
 *   can't be made sticky; splitting the row labels out into ordinary HTML
 *   is what lets them stay put while the chart scrolls underneath, the same
 *   technique `src/pages/data/RowsTable.tsx` uses for its pinned "#" column.
 *   That used to be the actual defect here: on a narrow viewport, the
 *   moment you scrolled right to inspect a cell, the row labels — visually
 *   pinned only by starting at the left edge, never by CSS — scrolled away
 *   with everything else.
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
      margin: HEATMAP_MARGIN,
      xaxis: {
        tickangle: -45,
        tickmode: "array",
        tickvals: [...CORRELATION_LABELS],
        ticktext: tickText,
        tickfont: { size: 10, color: tokens.textSecondary },
        automargin: true,
      },
      yaxis: {
        // Row labels are rendered by the sticky HTML column below instead —
        // see this component's doc comment for why. `automargin` still
        // applies (there's nothing to auto-size around now), and the
        // category ordering/aspect-lock config is unchanged.
        showticklabels: false,
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
        {/* `min-w-`/`max-w-` live on this row itself, not just on the chart
            pane below — a block/flex box's own formal width does not
            expand to match an overflowing child's min-width, it only clips
            or scrolls around it. A `position: sticky` descendant's
            containing block is this row, so if the row stayed at the
            scroller's available width (356px on a phone) while its
            children overflowed it to 992px, the sticky column would only
            have ~224px of real travel before running out of containing
            block and sliding away with the rest — which is exactly the bug
            this replaced. Giving the row the same min/max as the chart
            pane, offset by the label column's fixed width, keeps the row's
            own box exactly as wide as its content at every breakpoint. */}
        <div
          className="mx-auto flex w-full items-stretch"
          style={{
            minWidth: LABEL_COLUMN_WIDTH_PX + 860,
            maxWidth: LABEL_COLUMN_WIDTH_PX + 980,
          }}
        >
          {/* Sticky row-label column — see the component doc comment. Padding
              top/bottom matches HEATMAP_MARGIN.t/.b exactly, so 36 equal-flex
              rows in between land on the same 36 bands Plotly's categorical
              y-axis divides its own (now-blank) plot area into. */}
          <div
            className="sticky left-0 z-10 shrink-0 border-r border-subtle bg-surface"
            style={{
              width: LABEL_COLUMN_WIDTH_PX,
              paddingTop: HEATMAP_MARGIN.t,
              paddingBottom: HEATMAP_MARGIN.b,
            }}
          >
            <div className="flex h-full flex-col">
              {CORRELATION_LABELS.map((label) => (
                <div
                  key={label}
                  title={label}
                  className="flex flex-1 items-center justify-end overflow-hidden pr-2"
                >
                  <span className="truncate text-[10px] leading-tight text-secondary">
                    {formatTickLabel(label, LABEL_MAX_CHARS)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* No min/max-width of its own: the row above already guarantees
              the space left over after the fixed-width label column is
              always between 860 and 980px, the matrix's original bounds. */}
          <div className="aspect-square min-w-0 flex-1 p-2">
            <PlotlyChart
              data={[trace]}
              layout={layout}
              ariaLabel="Correlation heatmap of 36 machine-learning features, colored from blue (negative correlation) through gray (no correlation) to pink-red (positive correlation)"
            />
          </div>
        </div>
      </div>
      <figcaption className="mt-2 text-sm text-muted">
        Axis labels are abbreviated: {TICK_LABEL_LEGEND}. Hover any cell for the full feature names
        and the exact r value.
      </figcaption>
    </figure>
  );
}
