# Where this stands

Rebuild of [pedatamine.org](https://pedatamine.org) — see `README.md` for what the project is
and `data/reference/` for the verified specs.

**Status: all four waves complete, reviewed and committed.**

327 tests pass; `typecheck`, `lint`, `build`, `build:data` and the browser smoke test are all
clean, and axe reports **no accessibility violations** across 7 routes x 2 viewports. All seven
routes are built and verified in a real browser at desktop and mobile widths, with every data
count cross-checked against the live original.

## Read these first when resuming

Everything worth knowing about the original site and its data is already written down. Don't
re-derive it:

| File                                               | What it holds                                               |
| -------------------------------------------------- | ----------------------------------------------------------- |
| `data/reference/DATA-SPEC.md`                      | Every data invariant, cross-checked against the live server |
| `data/reference/CHART-PALETTE.md`                  | The computed 7-hue palette and why it is exactly 7          |
| `data/reference/feature-glossary.json`             | The 36-row feature table, extracted                         |
| `data/reference/ui-controls.json`                  | The original's exact control options and defaults           |
| `data/reference/live-figure-fixtures.json`         | Captured live output, used as test ground truth             |
| `~/.claude/plans/take-a-look-at-magical-pebble.md` | The full plan and wave breakdown                            |

The original is a **Plotly Dash** app — there is no HTML to scrape. Its structure came from
Dash's own `/_dash-layout` and `/_dash-update-component` endpoints. That reconnaissance is
complete.

## Done

- **Wave 1 — foundation.** Vite + React 19 + TS (strict) + Tailwind v4, routing, responsive app
  shell with a mobile nav drawer, design tokens, light/dark.
- **Wave 2 — data layer + UI kit + chart layer.** A build script (`npm run build:data`) that
  regenerates the typed dataset and **asserts every verified invariant**, failing the build on
  any mismatch. Radix-based UI primitives, and a Plotly wrapper with null-separator trace
  batching.
- **Shared page infrastructure.** `ChartPageLayout` and `useUrlState`.
- **Wave 3 — pages.** `/explore`, `/temperature`, `/correlations`, `/features`, `/about`, `/`.
  Combinable multi-select filters (the original allowed one column, one value), shareable URL
  state (the original had none), and honest notices where the original silently misled — a log
  axis on Tg drops 78% of points, and VFT/T-Tg can only plot the 351 samples that have a Tg.
  The temperature page renders **≤ 8 traces instead of the original's 655**, with point totals
  matching the live server exactly in all 16 mode × colour combinations.

- **Wave 4 — `/data`.** Search, sort, combinable filters, a column picker over all 69 typed
  columns, pagination, and CSV export of either the current view or the full 305-column dataset.
  Plus an axe pass and a browser smoke test.

## Possible next steps

Nothing is outstanding. If the work continues, the honest candidates are:

1. **Click-to-inspect on the correlation heatmap** — currently hover-only.
2. **Let `/data` browse all 305 raw columns.** The typed layer carries 69; the rest are only
   reachable via the full CSV download. A deliberate split, but revisitable.
3. **A real UCSB/MRSEC logo asset** on `/about`. The original embedded a 64 kB base64 blob,
   which was deliberately not reproduced; the textual credit is there.
4. **Run `npm run smoke` in CI**, against `vite preview`.

## Two things that cost real time — don't relearn them

**A green test suite does not mean the app renders.** jsdom has no canvas, so no unit test ever
mounts a real chart. Three of six pages once rendered blank white while typecheck, lint and 236
tests were all green. Worse, that particular bug _cannot_ be unit-tested: it was a missing
Node-only `global`, which exists under Vitest and not in a browser. `npm run smoke` is the guard.

**Plotly lazy-loading is already handled.** Route-level code splitting puts it in its own
`charts` chunk (386 KB gzip) loaded only by `/explore`, `/temperature` and `/correlations`. A
cold visit to `/` transfers ~138 KB gzipped.

## How this was built

Sub-agents write the code in waves with disjoint file ownership; each wave is reviewed before
the next starts. Two things that matter if you continue that way:

- **Install shared dependencies centrally before launching parallel agents.** Two concurrent
  `npm install`s corrupt the lockfile.
- **Verify agent claims rather than accepting them.** Each wave so far produced at least one
  confident claim that was wrong: a "hard colorimetry limit" of 4 palette slots (the real limit
  is 7), an encoding repair that missed two byte values, and an "irreducible" Plotly bundle that
  shrank 25% once measured.

## Commands

```bash
npm run dev         # dev server
npm run build       # typecheck + production build
npm run build:data  # regenerate src/data/generated/ and assert every invariant
npm test            # vitest
npm run lint        # eslint
```

## Attribution

Data and the original application are MIT-licensed work by Nicole Schauser, Gabrielle Kliegle,
Piper Cooke, Rachel Segalman and Ram Seshadri (UC Santa Barbara / NSF MRSEC DMR 1720256),
published at <https://github.com/nschauser/PolymerElectrolyte>. Keep that credit intact.
