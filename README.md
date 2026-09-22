# Polymer Electrolyte Data Mining

An interactive explorer for the UC Santa Barbara polymer-electrolyte dataset — a rebuilt
front-end for [pedatamine.org](https://pedatamine.org).

Solid polymer electrolytes are a candidate for safer lithium batteries, and the open question is
which material properties actually drive ionic conductivity. This site lets you plot that
dataset's measurements against each other and see for yourself.

## Credit where it belongs

The dataset is the real work here, and it isn't ours. **Nicole Schauser, Gabrielle Kliegle, Piper
Cooke, Rachel Segalman and Ram Seshadri** hand-curated 655 polymer-electrolyte samples from 65
published papers, computed molecular descriptors for every one, and published all of it openly
under the MIT license alongside a Plotly Dash app for exploring it. That curation is the part
that can't be automated, and everything here rests on it.

Their data and original application:
[github.com/nschauser/PolymerElectrolyte](https://github.com/nschauser/PolymerElectrolyte) ·
UC Santa Barbara / NSF MRSEC DMR 1720256.

This is an independent rebuild of the interface only, not affiliated with or endorsed by them.

---

## What you can do here

| Page             | What it's for                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Explore**      | Plot any two of 41 measured and computed properties against each other, coloured by a third. Linear or log on either axis.      |
| **Temperature**  | Conductivity against temperature for every sample, in the four scalings the literature uses: Arrhenius, VFT, plain T, and T/Tg. |
| **Correlations** | How the 36 machine-learning features relate to one another, as a colour-coded matrix.                                           |
| **Data**         | Browse, search, sort and export every row. Choose which columns to show; download the current view or the whole dataset as CSV. |
| **Features**     | A searchable, plain-language glossary of what each of the 36 features actually means.                                           |
| **About**        | Who built the database, how it was funded, and how to get in touch.                                                             |

Click a point on any plot to see which polymer it is and which paper it came from, with a direct
link to the DOI.

## What's different from the original site

Nothing about the data has changed — it's the same 655 samples. What changed is the experience of
using it:

- **Nothing to wait for.** Changing an axis or a filter updates the plot immediately, rather than
  asking a server and waiting for a reply.
- **It works on a phone or tablet.** The original was built for a desktop window and didn't
  adapt.
- **Filters combine.** Narrow to exactly the subset you care about — say, three specific anions
  _and_ two solvents at once — instead of one choice at a time.
- **Every view is a link.** Configure a plot, copy the URL, and it opens the same way for whoever
  you send it to. Useful for pointing at a specific view in a paper or an email.
- **You can see the actual numbers.** The data browser and CSV export are new; previously there
  was no way to inspect or download the underlying rows.
- **It tells you when a plot is hiding something.** A log axis can't show zero or negative
  numbers, and glass-transition temperatures are mostly negative in °C — so switching a Tg axis to
  log quietly drops most of the data. Here you're told how many points were left out. Same for the
  VFT and T/Tg views, which can only include the 351 samples that have a recorded
  glass-transition temperature.
- **The colours are readable.** The palette is checked to stay distinguishable for the common
  forms of colour blindness, and each category also gets its own marker shape — so the plots still
  work in greyscale print. Where a property has more categories than there are safe colours, the
  rarest fold into a single grey "Other" rather than being given confusable colours.
- **Light and dark mode.**
- **One number is corrected.** The original's correlation matrix was scaled by a constant factor
  (271/270) from a statistics subtlety, making its diagonal read 1.0037 instead of 1. This version
  computes it directly. Because the factor was the same everywhere it didn't change the
  relationships in the matrix — any comparison drawn from the original plot still holds.

## Running it yourself

There's no hosted deployment yet. To run it locally you'll need [Node.js](https://nodejs.org):

```bash
npm install
npm run dev     # then open the URL it prints, usually http://localhost:5173
```

---

# For developers

Everything below is implementation detail.

📖 **[Architecture wiki](https://deepwiki.com/merlinymy/polymerDataFrontend/2-data-layer)** — a
generated walkthrough of the codebase, starting at the data layer.

Project status, known gotchas and candidate next steps live in **[`HANDOFF.md`](HANDOFF.md)**.

## Stack

- [Vite](https://vite.dev) + [React 19](https://react.dev) + TypeScript (strict)
- [Tailwind CSS v4](https://tailwindcss.com), CSS-first configuration (`@theme` in
  `src/styles/theme.css`, no `tailwind.config.js`)
- [react-router-dom v7](https://reactrouter.com) (`BrowserRouter`)
- [Plotly.js](https://plotly.com/javascript/) as a slim custom bundle (`scatter` + `heatmap` only)
- [Radix UI](https://www.radix-ui.com) primitives + [cmdk](https://cmdk.paco.me) for the
  searchable selects
- [Vitest](https://vitest.dev) + Testing Library (jsdom); [Playwright](https://playwright.dev) for
  the browser smoke test
- ESLint (flat config) + Prettier
- npm; standalone Node scripts run with [`tsx`](https://github.com/privatenumber/tsx)

No backend. The dataset is small enough (655 rows) to ship as a static payload — 76 kB gzipped —
so all filtering, sorting and plotting happens in the browser and the whole app can be hosted as
files.

## Commands

```bash
npm install
npm run dev        # start the dev server
npm run build      # typecheck + production build to dist/
npm run preview    # preview the production build locally
npm run typecheck  # tsc --noEmit
npm run lint       # eslint .
npm run format     # prettier --write .
npm test           # vitest run (unit tests, jsdom)
npm run smoke      # load every route in real Chrome; fails on blank pages or console errors
npm run build:data # regenerate src/data/generated/ from data/raw/, asserting every invariant
```

### `npm test` passing does not mean the app renders

jsdom has no canvas, so no unit test ever mounts a real chart. Three of six pages once rendered
blank white while typecheck, lint and 236 tests were all green — and that particular bug _could
not_ have been unit-tested, because it was a missing Node-only global that exists under Vitest and
not in a browser. Run `npm run smoke` against a running dev server before trusting the suite on
anything chart-related.

## Directory layout

```
HANDOFF.md                 # project status, gotchas, candidate next steps
data/                      # source dataset + captured reference data — do not edit
  raw/                     # the two source CSVs + their MIT license
  reference/               # ground truth captured from the live original + specs
src/
  main.tsx                 # entry point (mounts <App/>, imports theme.css)
  App.tsx                  # BrowserRouter + route table
  styles/
    theme.css              # design tokens (Tailwind v4 @theme, light/dark, focus ring)
    chart-palette.ts       # typed mirror of the --chart-1..7 CSS variables
  components/
    theme/                 # ThemeProvider, ThemeToggle, useTheme (light/dark/system)
    layout/                # AppShell, Header, Nav, NavDrawer, Footer, PageHeader
    ui/                    # primitives (Combobox, MultiSelect, Table, Sheet, Notice…)
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

Pages are code-split with `React.lazy` inside a single `<Suspense>` boundary in `AppShell`, so
only the routed content area shows a loading state. Plotly and the dataset land in their own
chunks, loaded only by the routes that need them — a cold visit to `/` transfers ~137 kB gzipped.

## Data pipeline

`npm run build:data` reads the two CSVs in `data/raw/` and emits typed, columnar JSON plus a
generated column registry into `src/data/generated/` (committed, so the app builds without running
the script). Columnar rather than array-of-objects: it maps straight onto Plotly's `x`/`y` arrays
and gzips far better.

**The assertions are the point of that script.** It fails the build unless the regenerated data
still matches the counts verified against the live original: 655 rows, 5225 non-null conductivity
measurements, 368 samples with a Tg, 441 with `approxTg`, the six category cardinalities, and a
36×36 correlation matrix with a diagonal of exactly 1. Ground truth:
[`data/reference/DATA-SPEC.md`](data/reference/DATA-SPEC.md).

Three data-quality repairs happen here:

- **Encoding.** The main CSV is not valid UTF-8 — 37 stray `0xA0` bytes and 2 `0x96` bytes sit
  inside pasted citation text. Decoded as Windows-1252 rather than Latin-1, so a page range reads
  `104–109` instead of an invisible control character.
- **Zero-width characters.** 40 cells carry a `U+FEFF` _inside_ the value, including three polymer
  names. Invisible in any editor, but enough to break exact matching and search. Stripped at parse
  time; the downloadable CSV gets the same treatment plus a leading BOM so Excel reads it as UTF-8.
- **Correlation matrix.** Recomputed as plain pairwise-complete Pearson. A test asserts that ours
  × 271/270 reproduces the original's, which both explains the discrepancy and pins the
  computation.

## Charts

One `PlotlyChart` wrapper calls `Plotly.react()` against a ref rather than using
`react-plotly.js`, with a `ResizeObserver` for responsiveness and concrete theme colours resolved
from CSS custom properties (Plotly can't read `var()` inside SVG attributes).

**Trace batching.** The temperature page draws up to 619 sample curves. Rather than one trace each
— which is what the original did, at roughly 1 MB of JSON per interaction — samples sharing a
colour are concatenated into a single trace separated by `null`s, giving ≤ 8 traces. A parallel
`customdata` array of equal length carries each point's source row index, so a click still
resolves to the right sample. See `src/components/charts/series.ts`; the index mapping has its own
test, because an off-by-one there would silently attribute a measurement to the wrong paper.

**`scattergl` is deliberately not registered.** It measured 143 kB gzipped extra for a dataset
whose largest plot is 5225 points, comfortably inside SVG's range, and SVG exports crisp PNGs at
any scale. Read the note in `src/components/charts/plotly.ts` before adding it back.

## Design tokens

`src/styles/theme.css` defines a semantic token contract that all UI is built from instead of raw
Tailwind palette colours (no `bg-slate-100` in app code): surfaces (`bg-canvas`, `bg-surface`,
`bg-surface-raised`, `bg-muted`), text (`text-primary`, `text-secondary`, `text-muted`), borders
(`border-subtle`, `border-default`, `border-strong`), a single accent (`bg-accent` / `text-accent`
/ `border-accent` / `text-on-accent`, plus `bg-accent-hover`), restrained status colours
(`text-danger`, `text-success`), a `.tabular` utility for aligning numeric columns, and a `--ring`
focus colour used by a global `:focus-visible` style.

Dark mode is a `.dark` class on `<html>`, applied before first paint by an inline script in
`index.html` (no flash of the wrong theme) and kept in sync afterwards by `ThemeProvider`
(light / dark / system, persisted to `localStorage`).

### The chart palette is computed, not chosen

The 7-slot categorical palette (`--chart-1` … `--chart-7` plus a reserved recessive
`--chart-other`, typed in `src/styles/chart-palette.ts`) was derived by searching the OKLCH gamut
and scoring candidates with `validate_palette.js` (OKLab ΔE under Machado-Oliveira-Fernandes CVD
simulation). It passes every hard check under the strict `--pairs all` criterion in **both** light
and dark — the criterion this app needs, since the primary view is a scatter plot where any two
categories can land side by side.

Seven is the measured maximum, not a preference: joint light+dark margins are 1.29 at six hues,
1.03 at seven and 0.96 at eight (≥ 1.0 passes). Dark mode binds, because its lightness band
(L ∈ [0.48, 0.67]) is much narrower than light's.

Several columns exceed seven categories (12 anions, 14 solvents, 24 polymer families, 65 DOIs, 78
polymers), so the rule is **fold, never cycle**: the seven most frequent categories — ranked once
over the full dataset, never over the filtered view, so filtering never repaints surviving series
— take the hue slots, and the rest render as a desaturated "Other". Scatter marks additionally
vary marker symbol per slot. Full derivation and per-column coverage:
[`data/reference/CHART-PALETTE.md`](data/reference/CHART-PALETTE.md).

## Accessibility

Keyboard reachable throughout with visible focus, semantic landmarks, a skip link, a
focus-trapped mobile nav drawer, `aria-sort` on sortable headers, and live regions for result
counts. axe reports no violations across all 7 routes at desktop and mobile widths. The `/data`
table doubles as the non-colour view of the plotted data.

## Static hosting (SPA fallback)

Client-side-routed (`BrowserRouter`), so a static host must serve `index.html` for unknown paths
or deep links and refreshes will 404:

- **Netlify** — `public/_redirects` is already included (`/* /index.html 200`).
- **GitHub Pages** — copy the built `dist/index.html` to `dist/404.html` as a post-build step.
- **Vercel** — rewrites are configured by default for Vite SPA output.

## Data & attribution

Data from Nicole Schauser et al., UC Santa Barbara / NSF MRSEC DMR 1720256. MIT licensed —
[github.com/nschauser/PolymerElectrolyte](https://github.com/nschauser/PolymerElectrolyte). The
source CSVs and their license live untouched in `data/raw/`; `data/reference/` holds ground truth
captured from the original, used to verify this rebuild against it.
