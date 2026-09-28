/**
 * Define the Node-only `global` identifier that parts of Plotly still reach
 * for. `plotly.js/src/lib/prepare_regl.js` reads `global.devicePixelRatio`
 * **unguarded**, and `lib/core` pulls that module in whether or not any WebGL
 * trace is registered — so without this, the very first `Plotly.react()`
 * throws `global is not defined` and the chart pages render blank.
 *
 * Imported for its side effect at the top of `plotly.ts`, before the Plotly
 * import. ES module imports execute in source order, so this runs first.
 *
 * Deliberately a runtime shim rather than Vite's `define: { global:
 * "globalThis" }`. `define` is a *textual* substitution applied across the
 * whole bundle — it rewrites every bare `global` token it sees, including in
 * our own code and in unrelated dependencies that legitimately feature-detect
 * it. This affects exactly one property on exactly one object.
 *
 * Regression note: this was briefly removed along with the `scattergl`
 * registration, on the assumption that only the WebGL dependency chain needed
 * it. It does not — and nothing caught it, because jsdom never mounts real
 * Plotly, so the type checker, the linter and all 236 unit tests stayed green
 * while three of six pages rendered blank.
 *
 * A unit test cannot cover this: Vitest runs under Node, where `global`
 * already exists, so the bug is invisible there by construction. It only
 * appears in a browser. `npm run smoke` is what actually catches it — it
 * loads every route in real Chrome and fails on a console error or an empty
 * page. Run it before trusting a green test suite on anything chart-related.
 */
// `globalThis.global` is not in the DOM lib, so widen the access site rather
// than declaring an ambient `var global` (which collides with @types/node's
// own non-optional declaration).
const g = globalThis as typeof globalThis & { global?: typeof globalThis };
g.global ??= globalThis;

export {};
