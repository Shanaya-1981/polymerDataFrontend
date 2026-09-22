# Where this stands

Rebuild of [pedatamine.org](https://pedatamine.org) — see `README.md` for what the project is
and `data/reference/` for the verified specs.

**Status: paused after Wave 3. Wave 4 was never started.**

## Read these first when resuming

Everything worth knowing about the original site and its data is already written down. Don't
re-derive it:

| File | What it holds |
|---|---|
| `data/reference/DATA-SPEC.md` | Every data invariant, cross-checked against the live server |
| `data/reference/CHART-PALETTE.md` | The computed 7-hue palette and why it is exactly 7 |
| `data/reference/feature-glossary.json` | The 36-row feature table, extracted |
| `data/reference/ui-controls.json` | The original's exact control options and defaults |
| `data/reference/live-figure-fixtures.json` | Captured live output, used as test ground truth |
| `~/.claude/plans/take-a-look-at-magical-pebble.md` | The full plan and wave breakdown |

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

## Not done — Wave 4

1. **`/data` table page.** `src/pages/DataTable.tsx` is still a route stub. Needs a searchable,
   sortable, paginated browser over the 655 rows plus CSV export. `src/lib/csv-export.ts`
   already exists, the `Table` primitives in `src/components/ui` already exist, and the full
   305-column CSV is already served at `public/data/polymer-electrolyte-dataset.csv`.
2. **Accessibility pass** across the finished pages.
3. **Bundle/perf check.** Plotly is ~436 KB gzipped and dominates the bundle — it should be
   lazy-loaded so `/`, `/features` and `/about` don't pay for it.
4. **README polish** — attribution is written but the doc predates Waves 2–3.

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
