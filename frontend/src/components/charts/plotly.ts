/**
 * The app's single Plotly entry point — a slim custom bundle registering
 * only the trace types this app renders (scatter, heatmap),
 * instead of the full `plotly.js`/`plotly.js-dist` bundle (~350+ trace
 * types: 3D, geo, finance, polar, ternary...) or `@types/plotly.js`.
 *
 * Always import Plotly — and its types — from this module, never from
 * `plotly.js` directly. That keeps the size/feature trade-off made in one
 * place, and guarantees `Plotly.register` has already run before anything
 * calls `Plotly.react`.
 *
 * Pattern follows plotly.js's own documented custom-bundle recipe (see the
 * generated `plotly.js/src/types/generated/entry_points/*.d.ts` files,
 * whose doc comments give this exact import shape):
 *
 *   import * as Plotly from "plotly.js/lib/core";
 *   import * as scatter from "plotly.js/lib/scatter";
 *   Plotly.register([scatter]);
 *
 * ## Why no `scattergl`
 *
 * WebGL rendering is deliberately NOT registered. Measured against this
 * project's own Vite config, adding `scattergl` costs **143 KB gzipped**
 * (436 -> 579 KB) and drags in a regl/`typedarray-pool` dependency chain that
 * needs a `buffer` shim and a `global` define to build at all.
 *
 * We do not need it. The largest plot in the app is the temperature page at
 * 5,225 points, batched into <= 8 traces — comfortably inside SVG's range.
 * SVG also exports crisp PNGs at any scale, which matters for a tool whose
 * output ends up in papers; WebGL exports raster at canvas resolution.
 *
 * If a future dataset pushes past ~15-20k points, re-register `scattergl`
 * here and restore those two Vite settings.
 */
// MUST stay first: defines the bare `global` that plotly's prepare_regl
// reads unguarded. Imports run in source order, so this beats lib/core.
import "./global-shim";
import * as Plotly from "plotly.js/lib/core";
import * as scatter from "plotly.js/lib/scatter";
import * as heatmap from "plotly.js/lib/heatmap";

Plotly.register([scatter, heatmap]);

export default Plotly;

// Re-exported so `PlotlyChart.tsx` and `series.ts` never need to reach into
// `plotly.js/lib/core` themselves — this file is the one seam.
export type {
  Data,
  Layout,
  Config,
  ColorScale,
  Datum,
  MarkerSymbol,
  PlotMouseEvent,
  PlotDatum,
  PlotlyHTMLElement,
} from "plotly.js/lib/core";
