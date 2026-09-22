# Polymer Electrolyte Data Mining

A modern, fully client-side rebuild of [pedatamine.org](https://pedatamine.org) — the UC Santa
Barbara Polymer Electrolyte Data Mining site. The original is a Plotly Dash app that is slow,
visually dated, and effectively unusable on mobile. This project reimplements it as a fast,
responsive, static single-page app with the same underlying dataset, so researchers can explore
polymer-electrolyte conductivity data against material attributes without the baggage of a
server-rendered Dash backend.

All seven routes are built. See `HANDOFF.md` for current status and what is left.

**What it does that the original doesn't**

- **No server round-trip.** The whole dataset ships as a 76 kB gzipped static payload, so every
  axis change and filter is instant. The original POSTed to a Dash callback for each interaction
  and returned up to ~1 MB of JSON.
- **Filters combine.** Pick multiple values across multiple columns (OR within a column, AND
  across them). The original allowed exactly one column and one value.
- **Every view is a link.** All controls round-trip through the URL, so a configured plot can be
  pasted into a paper or a message. The original had no shareable state at all.
- **A data browser.** `/data` lets you search, sort, page and export the rows. The original gave
  no way to see the underlying data.
- **Responsive.** The original used fixed-width Bootstrap columns and a hard-coded figure size.
- **~8 traces instead of 655** on the temperature page, via null-separated trace batching.
- **Honest about its own limits.** A log axis on Tg hides 78% of the points and VFT/T-Tg can only
  plot the 351 samples that have a Tg; the app says so rather than quietly showing less data.

It also **fixes a bug in the original**: the correlation matrix was uniformly scaled by 271/270
(a population/sample standard-deviation mismatch), so its diagonal read 1.0037 instead of 1.

## Stack

- [Vite](https://vite.dev) + [React 19](https://react.dev) + TypeScript (strict)
- [Tailwind CSS v4](https://tailwindcss.com), CSS-first configuration (`@theme` in
  `src/styles/theme.css`, no `tailwind.config.js`)
- [react-router-dom v7](https://reactrouter.com) (`BrowserRouter`)
- [Vitest](https://vitest.dev) + Testing Library (jsdom environment)
- ESLint (flat config) + Prettier
- npm as the package manager; standalone Node scripts run with [`tsx`](https://github.com/privatenumber/tsx)

## Getting started

```bash
npm install
npm run dev       # start the dev server
npm run build     # typecheck + production build to dist/
npm run preview   # preview the production build locally
npm run typecheck # tsc --noEmit
npm run lint      # eslint .
npm run format    # prettier --write .
npm test          # vitest run (unit tests, jsdom)
npm run smoke     # load every route in real Chrome; fails on blank pages or console errors
npm run build:data # regenerate src/data/generated/ from data/raw/, asserting every invariant
```

**`npm test` passing does not mean the app renders.** jsdom has no canvas, so no unit test ever
mounts a real chart — we once shipped three blank pages with a fully green suite. Run
`npm run smoke` (against a running dev server) before trusting the suite on anything
chart-related.

## Directory layout

```
data/                     # source dataset + captured reference data — do not edit
  raw/                    # the two source CSVs + their MIT license
  reference/              # ground truth captured from the live site
src/
  main.tsx                # entry point (mounts <App/>, imports theme.css)
  App.tsx                 # BrowserRouter + route table
  styles/
    theme.css             # design tokens (Tailwind v4 @theme, light/dark, focus ring)
    chart-palette.ts       # typed mirror of the --chart-1..7 CSS variables
  components/
    theme/                # ThemeProvider, ThemeToggle, useTheme (light/dark/system)
    layout/                # AppShell, Header, Nav, NavDrawer, Footer, PageHeader
    ui/                    # shared primitives (Combobox, MultiSelect, Table, Sheet, Notice…)
    charts/                # slim Plotly bundle, PlotlyChart wrapper, trace builders
  lib/                     # transforms, filtering, log-axis guard, CSV export, URL state
  data/                    # typed accessors + generated/ (committed build output)
  pages/                   # one route per file, plus a directory of parts per page
scripts/
  build-data.ts            # CSVs -> typed JSON; asserts every verified invariant
  smoke.mjs                # browser smoke test
```

### Routes

| path            | file                         | nav label    |
| --------------- | ---------------------------- | ------------ |
| `/`             | `src/pages/Home.tsx`         | Home         |
| `/explore`      | `src/pages/Explore.tsx`      | Explore      |
| `/temperature`  | `src/pages/Temperature.tsx`  | Temperature  |
| `/correlations` | `src/pages/Correlations.tsx` | Correlations |
| `/data`         | `src/pages/DataTable.tsx`    | Data         |
| `/features`     | `src/pages/Features.tsx`     | Features     |
| `/about`        | `src/pages/About.tsx`        | About        |
| `*`             | `src/pages/NotFound.tsx`     | — (404)      |

All page components are code-split with `React.lazy` and rendered inside a single `<Suspense>`
boundary in `AppShell`, so only the routed content area shows a loading state — the header, nav,
and footer stay mounted across navigations.

## Design tokens

`src/styles/theme.css` defines a semantic token contract that all UI should be built from instead
of raw Tailwind palette colors (no `bg-slate-100` in app code): surfaces (`bg-canvas`,
`bg-surface`, `bg-surface-raised`, `bg-muted`), text (`text-primary`, `text-secondary`,
`text-muted`), borders (`border-subtle`, `border-default`, `border-strong`), a single accent
(`bg-accent` / `text-accent` / `border-accent` / `text-on-accent`, plus a `bg-accent-hover` step),
restrained status colors (`text-danger`, `text-success`), a `.tabular` / `.font-tabular` utility
for aligning numeric columns, and a `--ring` focus color used by a global `:focus-visible` style.
Dark mode is a `.dark` class on `<html>`, applied before first paint by an inline script in
`index.html` (no flash of the wrong theme) and kept in sync afterwards by `ThemeProvider`
(light / dark / system, persisted to `localStorage`, respects `prefers-color-scheme` when set to
"system").

A 7-slot categorical chart palette (`--chart-1` … `--chart-7` plus a reserved recessive
`--chart-other` in `theme.css`, typed and documented in `src/styles/chart-palette.ts`) is
_computed_, not eyeballed: the hues were found by searching the OKLCH gamut and scoring against
the dataviz skill's `validate_palette.js` (OKLab ΔE with Machado-Oliveira-Fernandes CVD
simulation). They pass every hard check under the strict `--pairs all` criterion in **both**
light and dark — the criterion this app needs, since the primary view is a scatter plot where
any two categories can land side by side.

Seven is the computed maximum, not a preference: joint light+dark margins are 1.29 at six hues,
1.03 at seven, and 0.96 at eight (≥ 1.0 passes). Dark mode binds, because its lightness band
(L ∈ [0.48, 0.67]) is much narrower than light's.

The dataset exceeds seven categories in several columns (12 anions, 14 solvents, 24 polymer
families, 65 DOIs, 78 polymers), so the rule is **fold, never cycle**: the seven most frequent
categories — ranked once over the full dataset, never over the filtered view, so filtering never
repaints surviving series — take the hue slots, and the rest render as a desaturated "Other".
Scatter marks additionally vary marker symbol per slot, so identity never rests on color alone.
Full derivation and the per-column coverage numbers are in `data/reference/CHART-PALETTE.md`.

## Static hosting (SPA fallback)

This is a client-side-routed SPA (`BrowserRouter`), so a static host must serve `index.html` for
any unknown path instead of a bare 404, or deep links (e.g. `/explore`) and refreshes will break:

- **Netlify** — a `public/_redirects` file is already included (`/* /index.html 200`).
- **GitHub Pages** — copy the built `dist/index.html` to `dist/404.html` as a post-build step;
  GitHub Pages serves `404.html` for unknown paths, and it will boot the app and let
  `react-router` take over.
- **Vercel** — rewrites are configured by default for Vite SPA output; if you add a
  `vercel.json`, rewrite everything to `/index.html`.

## Data & attribution

Data from Nicole Schauser et al., UC Santa Barbara / NSF MRSEC DMR 1720256. MIT licensed —
[github.com/nschauser/PolymerElectrolyte](https://github.com/nschauser/PolymerElectrolyte). The
source CSVs and their license live untouched in `data/raw/`; `data/reference/` holds ground truth
captured from the live site used to verify this rebuild's behavior against the original.
