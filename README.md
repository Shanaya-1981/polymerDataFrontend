# Polymer Electrolyte Data Mining

An interactive explorer for the UC Santa Barbara polymer-electrolyte dataset — a rebuilt
front-end for [pedatamine.org](https://pedatamine.org).

The dataset behind this is the real work, and it isn't ours. Nicole Schauser, Gabrielle Kliegle,
Piper Cooke, Rachel Segalman and Ram Seshadri hand-curated 655 polymer-electrolyte samples from
65 published papers, computed molecular descriptors for every one, and published the whole thing
openly under MIT alongside a Plotly Dash app for exploring it. That curation is the part that
can't be automated, and everything here rests on it.

This project is a fresh front-end over that same dataset. The original app dates from early 2021
and Dash was a sensible choice for a research group shipping a working tool quickly — it puts a
usable interface in front of a pandas DataFrame with very little code. Five years on, the browser
can do more of that work directly: the dataset is only 655 rows, so it fits comfortably in a
static payload, which means the interactions can be instant and the whole thing can be hosted as
files. That shift is what this rebuild is about, plus room to add the affordances the original
didn't reach for.

All seven routes are built. See `HANDOFF.md` for current status.

## What's new here

**Exploring the data**

- **Instant interactions.** The whole dataset ships as a 76 kB gzipped static payload and all
  filtering happens in the browser, so changing an axis or a filter is immediate. The original
  round-tripped to a Dash callback per interaction, returning up to ~1 MB of JSON for the
  temperature view.
- **Filters that combine.** Select multiple values across multiple columns at once — OR within a
  column, AND across columns. The original offered one column and one value at a time.
- **Every view is a link.** All controls round-trip through the URL, so a configured plot can be
  pasted into a paper, an issue, or a message and come back exactly as it was.
- **A data browser** (`/data`, new): search across text columns, sort any column with nulls
  ordered last in both directions, a column picker over all 69 typed columns, pagination, and CSV
  export of either the current filtered view or the full 305-column dataset.
- **A searchable feature glossary** rather than a static 36-row table, and a landing page whose
  dataset statistics are derived from the data at build time instead of hard-coded.

**Charts**

- **Colour that survives colourblindness.** The categorical palette was derived by searching the
  OKLCH gamut and validated programmatically for CVD separation and contrast in both light and
  dark mode. Seven hues is the measured maximum that passes; beyond that categories fold into a
  recessive "Other" rather than recycling hues. Scatter marks also vary marker shape, so identity
  never rests on colour alone. See `data/reference/CHART-PALETTE.md` for the derivation.
- **A diverging scale for diverging data.** The correlation matrix spans −1…+1, so it gets two
  hues with a neutral midpoint pinned at 0 instead of a sequential ramp.
- **Readable heatmap labels.** The 36 feature names share long prefixes and differ at the end, so
  they're abbreviated at the front (`C1`/`C2`) rather than truncated at the back, which keeps all
  36 distinguishable.
- **8 traces instead of 655** on the temperature page. Each sample's curve is concatenated into a
  per-colour trace separated by nulls, with a parallel index array so clicking a point still
  resolves to the right sample.
- **It tells you what it's hiding.** A log axis can't show non-positive values, and Tg is in °C —
  so plotting Tg on a log axis silently drops 78% of the points. Here the count of hidden points
  is stated. Likewise, VFT and T/Tg require a glass-transition temperature and can only plot the
  351 samples that have one; the page says so rather than quietly showing less data.

**Data quality**

- **Correlation matrix recomputed.** The original's was uniformly scaled by 271/270 — a
  population/sample standard-deviation mismatch — so its diagonal read 1.0037 instead of 1.
- **Source encoding repaired.** The CSV isn't valid UTF-8: 37 stray `0xA0` bytes and 2 `0x96`
  bytes sit inside citation text. Decoded as Windows-1252 so a page range reads `104–109` rather
  than a replacement glyph.
- **Invisible characters stripped.** 40 cells carry a zero-width no-break space _inside_ the
  value, including three polymer names — invisible in any editor, but enough to break exact
  matching and search. The downloadable CSV gets the same treatment plus a BOM so Excel reads it
  as UTF-8.
- **Every invariant asserted at build time.** `npm run build:data` fails the build unless the
  regenerated data still matches the counts verified against the live original: 655 rows, 5225
  conductivity measurements, 368 samples with a Tg, the category cardinalities, and a correlation
  diagonal of exactly 1.

**Platform**

- **Responsive.** Navigation collapses into a drawer and chart controls into a bottom sheet, so
  the plot stays visible while you adjust it. The original used fixed-width columns and a
  hard-coded figure size.
- **Light and dark mode**, applied before first paint so there's no flash, with charts repainting
  to match.
- **Accessible.** Keyboard reachable throughout with visible focus, semantic landmarks, a skip
  link, `aria-sort` on sortable headers, live regions for result counts, and a clean axe audit
  across all 7 routes at desktop and mobile widths.
- **Lazy-loaded charts.** A cold visit to the landing page transfers ~137 kB gzipped; Plotly and
  the dataset load only on the routes that need them.

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
