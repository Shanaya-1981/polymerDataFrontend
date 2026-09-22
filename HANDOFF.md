# Where this stands

Rebuild of [pedatamine.org](https://pedatamine.org) — see `README.md` for what the project is
and `data/reference/` for the verified specs.

**Status: paused after Wave 3, reviewed and committed. Wave 4 was never started.**

236 tests pass; `typecheck`, `lint` and `build` are clean. All six built pages work against the
real dataset, with every count cross-checked against the live original.

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

## Not done — Wave 4

1. **`/data` table page.** `src/pages/DataTable.tsx` is still a route stub. Needs a searchable,
   sortable, paginated browser over the 655 rows plus CSV export. `src/lib/csv-export.ts`
   already exists, the `Table` primitives in `src/components/ui` already exist, and the full
   305-column CSV is already served at `public/data/polymer-electrolyte-dataset.csv`.
2. **Accessibility pass** across the finished pages.
3. **README polish** — attribution is written but the doc predates Waves 2–3.

Plotly lazy-loading, previously listed here, is already handled: route-level code splitting puts
it in its own `charts` chunk (386 KB gzip) that only loads on `/explore`, `/temperature` and
`/correlations`. A cold visit to `/` transfers ~138 KB gzipped.

**Never opened in a browser.** Everything is verified by tests, type-checking and numeric
cross-checks against the live original — which caught real bugs — but no one has actually looked
at the app. Do that before any new feature work.

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
