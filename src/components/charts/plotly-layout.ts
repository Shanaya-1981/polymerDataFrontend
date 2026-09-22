/**
 * Pure, DOM-free pieces of `PlotlyChart`'s default layout/config — split out
 * of `PlotlyChart.tsx` so that file can stay component-only (react-refresh
 * requires that for fast refresh to work) and so these are independently
 * unit-testable without a canvas/WebGL context (see `plotly-layout.test.ts`).
 */
import type { Config, Layout } from "./plotly";
import type { ChartThemeTokens } from "./theme";

export const DEFAULT_CONFIG: Partial<Config> = {
  displaylogo: false,
  // PlotlyChart owns resizing via its own ResizeObserver — avoid double
  // handling from Plotly's built-in window-resize listener.
  responsive: false,
  modeBarButtonsToRemove: ["sendChartToCloud", "lasso2d", "select2d"],
  toImageButtonOptions: { format: "png", filename: "polymer-electrolyte-chart", scale: 2 },
};

function axisDefaults(tokens: ChartThemeTokens): Partial<Layout>["xaxis"] {
  return {
    showgrid: false,
    zeroline: false,
    ticks: "inside",
    mirror: true,
    automargin: true,
    exponentformat: "power",
    linecolor: tokens.borderDefault,
    tickcolor: tokens.borderDefault,
    tickfont: { color: tokens.textSecondary },
    title: { font: { color: tokens.textSecondary } },
  };
}

/**
 * Theme-aware defaults matching the original site's scientific-plot look:
 * inside ticks, mirrored axis lines, no gridlines, `automargin`, and
 * `exponentformat: 'power'` so large/small exponents on log axes render as
 * `10ⁿ` instead of `1e+21`. Colors are resolved concrete values (`tokens`),
 * never `var(--...)` — see `theme.ts`'s doc comment for why Plotly can't
 * consume a CSS custom property directly.
 */
export function buildBaseLayout(tokens: ChartThemeTokens): Partial<Layout> {
  return {
    paper_bgcolor: tokens.surface,
    plot_bgcolor: tokens.surface,
    font: {
      family: "Inter Variable, ui-sans-serif, system-ui, sans-serif",
      size: 12,
      color: tokens.textSecondary,
    },
    margin: { l: 56, r: 24, t: 24, b: 48, pad: 4 },
    hovermode: "closest",
    hoverlabel: {
      bgcolor: tokens.surface,
      bordercolor: tokens.borderDefault,
      font: { color: tokens.textPrimary },
    },
    legend: {
      bgcolor: tokens.surface,
      bordercolor: "transparent",
      font: { color: tokens.textSecondary },
    },
    xaxis: axisDefaults(tokens),
    yaxis: axisDefaults(tokens),
  };
}

/**
 * Combine the theme-derived base layout with a caller's overrides. Shallow
 * per top-level key, except `xaxis`/`yaxis`/`legend`/`margin`/`font`, which
 * merge one level deeper — so a page can set e.g. `layout.xaxis.type =
 * "log"` without losing `mirror`/`ticks`/`exponentformat`/`automargin` from
 * the base.
 */
export function mergeLayout(base: Partial<Layout>, overrides?: Partial<Layout>): Partial<Layout> {
  if (!overrides) return base;
  return {
    ...base,
    ...overrides,
    xaxis: { ...base.xaxis, ...overrides.xaxis },
    yaxis: { ...base.yaxis, ...overrides.yaxis },
    legend: { ...base.legend, ...overrides.legend },
    margin: { ...base.margin, ...overrides.margin },
    font: { ...base.font, ...overrides.font },
  };
}
