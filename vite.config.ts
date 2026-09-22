import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/  |  https://vitest.dev/config/
//
// --- Plotly custom-bundle support (owned by the chart-layer wave) ---------
// `src/components/charts/plotly.ts` builds a slim Plotly bundle registering
// only `scatter` and `heatmap`. WebGL (`scattergl`) is deliberately not
// registered: it measured 143 KB gzipped extra on this config for a dataset
// whose largest plot is 5,225 points, and it required a `buffer` shim plus a
// `define: { global: "globalThis" }` to build at all. Both are now gone.
//
// One alias remains, and it is unrelated to WebGL:
//   `plotly.js/src/registry.js` is loaded by every custom bundle regardless
//   of which traces you register, and contains
//   `if (basePlotModule.name === "map") require("maplibre-gl/dist/maplibre-gl.css")`.
//   That branch is dead for cartesian traces, but it is a CommonJS
//   `require()` inside a function rather than a static ESM import, so
//   bundlers cannot prove it unreachable and ship the CSS anyway — 81 KB of
//   unused map-widget styling. Aliasing it to an empty file drops that to 0.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Keep in sync with the `paths` entry in tsconfig.json.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "maplibre-gl/dist/maplibre-gl.css": fileURLToPath(
        new URL("./src/components/charts/empty.css", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
