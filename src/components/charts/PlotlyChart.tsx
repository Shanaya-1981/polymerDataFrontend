import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/components/ui/cn";
import Plotly, {
  type Config,
  type Data,
  type Datum,
  type Layout,
  type PlotlyHTMLElement,
  type PlotMouseEvent,
} from "./plotly";
import { DEFAULT_CONFIG, buildBaseLayout, mergeLayout } from "./plotly-layout";
import { useChartThemeTokens } from "./theme";

/** The clicked point's identifying data — Plotly always reports an array of
 *  points under the cursor (`event.points`); this surfaces the first
 *  (topmost/nearest) one, which is what "the clicked point" means for a
 *  single click on a scatter/line mark. */
export interface PlotlyPointClick {
  /** Whatever the trace's `customdata` array held at this point — the
   *  source row index, for every trace `series.ts` builds. */
  customdata: Datum;
  curveNumber: number;
  pointIndex: number;
  x: Datum;
  y: Datum;
}

export interface PlotlyChartProps {
  data: Data[];
  layout?: Partial<Layout>;
  config?: Partial<Config>;
  /** Fires once per click, with the nearest point under the cursor. */
  onPointClick?: (point: PlotlyPointClick) => void;
  className?: string;
  /** Accessible name for the chart region. Omit only if the surrounding
   *  page already provides one (e.g. a heading immediately above with
   *  `aria-describedby`) — an unlabeled region is worse than none. */
  ariaLabel?: string;
}

const RESIZE_DEBOUNCE_MS = 120;

/**
 * The one Plotly chart wrapper. Calls `Plotly.react()` imperatively against
 * a plain ref instead of using `react-plotly.js` (an extra dependency that
 * re-renders more eagerly than this app needs — `react()` itself already
 * diffs, so there is nothing left for a wrapper library to add here).
 *
 * Owns: responsive resizing (debounced `ResizeObserver` +
 * `Plotly.Plots.resize`, since `config.responsive`'s own window-resize
 * listener misses container-only size changes, e.g. a sidebar collapsing),
 * theme-reactive repaint (see `theme.ts`), and always `Plotly.purge`-ing on
 * unmount.
 */
export function PlotlyChart({
  data,
  layout,
  config,
  onPointClick,
  className,
  ariaLabel,
}: PlotlyChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gdRef = useRef<PlotlyHTMLElement | null>(null);
  const resizeTimeoutRef = useRef<number | undefined>(undefined);

  // Read the latest callback through a ref so the click listener is
  // attached exactly once (see the effect below) instead of being torn
  // down and re-attached — via `removeAllListeners`/`on` — on every render.
  const onPointClickRef = useRef(onPointClick);
  useEffect(() => {
    onPointClickRef.current = onPointClick;
  }, [onPointClick]);

  const tokens = useChartThemeTokens();
  const mergedLayout = useMemo(
    () => mergeLayout(buildBaseLayout(tokens), layout),
    [tokens, layout],
  );
  const mergedConfig = useMemo<Partial<Config>>(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // Render/update. `Plotly.react()` diffs against the previous plot itself,
  // so it's cheap to call on every relevant change rather than trying to
  // hand-roll a shouldComponentUpdate — that's the whole reason to prefer
  // `react()` over `newPlot()` here.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    void Plotly.react(container, data, mergedLayout, mergedConfig).then((gd) => {
      if (cancelled) return;
      if (!gdRef.current) {
        gdRef.current = gd;
        gd.on("plotly_click", (event: PlotMouseEvent) => {
          const point = event.points[0];
          if (!point) return;
          onPointClickRef.current?.({
            customdata: point.customdata,
            curveNumber: point.curveNumber,
            pointIndex: point.pointIndex,
            x: point.x,
            y: point.y,
          });
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [data, mergedLayout, mergedConfig]);

  // Teardown. Separate from the effect above so it only runs once, on
  // unmount — purging on every data/layout change would defeat `react()`'s
  // whole purpose. Captures `container` now (mount time) rather than
  // reading `containerRef.current` inside the cleanup itself, since React
  // may have already cleared the ref by the time cleanup runs.
  useEffect(() => {
    const container = containerRef.current;
    return () => {
      if (container) Plotly.purge(container);
      gdRef.current = null;
    };
  }, []);

  // Responsive resizing. `config.responsive` (Plotly's own opt-in) only
  // listens for `window` resize events, which misses container-only size
  // changes (e.g. a filter Sheet opening, a CSS grid reflow) — a
  // ResizeObserver on the container itself catches those too.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      window.clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = window.setTimeout(() => {
        if (containerRef.current) Plotly.Plots.resize(containerRef.current);
      }, RESIZE_DEBOUNCE_MS);
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      window.clearTimeout(resizeTimeoutRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      // `figure`, not `img`: Plotly fills this container with interactive
      // controls (modebar buttons, the drag layer), and `img` declares the
      // subtree a single leaf graphic — which axe flags as nested-interactive
      // and which hides those controls from assistive tech. `figure` carries
      // the same accessible name while permitting interactive descendants.
      {...(ariaLabel ? { role: "figure", "aria-label": ariaLabel } : {})}
      className={cn("h-full min-h-[320px] w-full", className)}
    />
  );
}
