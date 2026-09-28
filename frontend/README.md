# Polymer Electrolyte Data Mining

A rebuilt front end for [pedatamine.org](https://pedatamine.org), the polymer electrolyte
database from Schauser et al. 655 samples pulled from 65 papers, conductivity at 22 temperatures
between 0 and 125 °C, and MORDRED descriptors for the comonomers and the anion.

## Credits

The database is the real work here and it isn't ours. Nicole Schauser, Gabrielle Kliegle, Piper
Cooke, Rachel Segalman and Ram Seshadri did the literature curation, computed the descriptors,
and put all of it online under MIT along with a Plotly Dash app to explore it. We only rebuilt
the interface.

Their data and original app:
[github.com/nschauser/PolymerElectrolyte](https://github.com/nschauser/PolymerElectrolyte).
UC Santa Barbara / NSF MRSEC DMR 1720256.

We aren't affiliated with them and they haven't endorsed this. The data is unchanged. It's their
`6_2_2020` snapshot and we haven't added anything to it.

---

## What you can do

| Page             | What it's for                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------ |
| **Explore**      | Any of 41 properties against any other, coloured by a third. Linear or log on either axis. |
| **Temperature**  | σ(T) per sample, under Arrhenius, VFT, T, or T/T<sub>g</sub> scaling.                      |
| **Correlations** | The 36-feature Pearson matrix, or a ranked list of what correlates with conductivity.      |
| **Data**         | Every sample as a row. Search, sort, choose columns, export to CSV.                        |
| **Features**     | What each of the 36 features means, including the MORDRED descriptors.                     |
| **About**        | Contributors, funding, contact.                                                            |

Click a point on any plot and it tells you the polymer and links the DOI.

## How complete the data is

Some properties are only recorded for a handful of samples. If a sample doesn't have a value for
what you're plotting, it just won't show up, so it's worth checking this before you go looking
for a trend and find almost nothing there.

| Property                | Samples with a value |
| ----------------------- | -------------------- |
| Li:functional group     | 655 / 655            |
| M<sub>w</sub>           | 528 / 655            |
| VFT E<sub>a</sub>       | 426 / 655            |
| Arrhenius E<sub>a</sub> | 424 / 655            |
| T<sub>g</sub>           | 368 / 655            |
| M<sub>n</sub>           | 325 / 655            |
| PDI                     | 265 / 655            |
| % crystallinity         | 137 / 655            |
| T<sub>m</sub>           | 82 / 655             |
| Transference number     | 80 / 655             |
| D<sub>Li</sub>          | 29 / 655             |
| Storage modulus         | 4 / 655              |

Conductivity is 5225 measurements in total, but they aren't spread evenly. Most of them sit
between 30 and 90 °C. There are 78 polymers across 24 families, 12 anions and 14 casting
solvents.

## What's new compared to the old site

- **Nothing waits on a server.** Changing an axis or a filter updates the plot right away.
- **It works on a phone or a tablet.** The old one was desktop-only.
- **Filters stack.** You can ask for PEO-family samples with TFSI or ClO₄, cast from
  acetonitrile, all at once. The old site let you filter on one property at a time, with one
  value.
- **Any view is a link.** Whatever you change on the page goes into the URL, so you can copy it
  and it reopens exactly the same for whoever you send it to. Handy for an SI figure or a referee
  response. Only the things you've actually changed get added, so if the URL still looks plain it
  means everything is sitting at its default. This works when you run it locally too, you'll just
  see it on a `localhost` address.
- **You can see the measurements themselves.** The Data page lists every sample as a row, so you
  can search, sort and download them. The old site only ever gave you plots.
- **You can ask what correlates with conductivity.** The old correlation matrix only compared the
  36 features against each other — conductivity wasn't in it at all, so the question most people
  arrive with had no answer. You can now rank every feature against conductivity at any of the 22
  measured temperatures. At 60 °C the strongest are lower T<sub>g</sub> (r = −0.39) and lower
  molecular weight (−0.32), then more charge-delocalised anions — higher electronegativity index,
  more oxygens, more hydrogen-bond acceptors. Each row shows its own `n`, because coverage varies
  a lot between properties.
- **Your view survives switching pages.** Set up a plot, go and look at something else, come back
  and it's still how you left it. There's a "Reset to defaults" button for when you want a clean
  slate.
- **It tells you when points are left out.** A log axis can't show zero or negative values, so
  instead of quietly dropping them it says how many it dropped. T<sub>g</sub> in °C is where
  you'll notice this most. Same idea on the VFT and T/T<sub>g</sub> views, which can only use the
  351 samples that have both a T<sub>g</sub> and conductivity data.
- **The colours work for colour-blind readers**, and every series gets its own marker shape too,
  so the plots survive greyscale printing. If a property has more categories than we have safe
  colours for, the rarest ones go into a single grey "Other" instead of getting colours you can't
  tell apart.
- **Light and dark mode.**
- **The correlation matrix is recomputed.** The old one was multiplied by 271/270 throughout,
  which is a population-vs-sample standard deviation mix-up, so its diagonal came out at 1.0037.
  The factor was the same for every cell, so nothing about the relative structure changed and
  anything you concluded from the old plot still stands. This version just reports r directly.

## Running it locally

It isn't hosted anywhere yet. Install [Node.js](https://nodejs.org) (LTS is fine), then from this
directory:

```bash
npm install
npm run dev     # then open the URL it prints, usually http://localhost:5173
```

---

# For developers

Everything below is implementation detail.

📖 **[Architecture wiki](https://deepwiki.com/merlinymy/polymerDataFrontend/2-data-layer)** — a
generated walkthrough of the codebase, starting at the data layer.

Status, known gotchas and possible next steps are in **[`HANDOFF.md`](HANDOFF.md)**.

## Stack

- [Vite](https://vite.dev) + [React 19](https://react.dev) + TypeScript (strict)
- [Tailwind CSS v4](https://tailwindcss.com), CSS-first config (`@theme` in
  `src/styles/theme.css`, no `tailwind.config.js`)
- [react-router-dom v7](https://reactrouter.com) (`BrowserRouter`)
- [Plotly.js](https://plotly.com/javascript/) as a slim custom bundle (`scatter` + `heatmap` only)
- [Radix UI](https://www.radix-ui.com) primitives + [cmdk](https://cmdk.paco.me) for the
  searchable selects
- [Vitest](https://vitest.dev) + Testing Library (jsdom), [Playwright](https://playwright.dev) for
  the browser smoke test
- ESLint (flat config) + Prettier
- npm. Standalone Node scripts run with [`tsx`](https://github.com/privatenumber/tsx)

There's no backend. 655 rows is small enough to ship as a static file (76 kB gzipped), so all the
filtering, sorting and plotting happens in the browser and the whole thing can be hosted as
static files.

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

### A green test suite doesn't mean the app renders

jsdom has no canvas, so no unit test ever mounts a real chart. Three of the six pages once came
up blank white while typecheck, lint and 236 tests were all passing. That particular bug couldn't
have been caught by a unit test either, because it was a missing Node-only global that exists
under Vitest but not in a browser. Run `npm run smoke` against a running dev server before you
trust the suite on anything chart-related.

## Directory layout

```
HANDOFF.md                 # status, gotchas, possible next steps
data/                      # source dataset + captured reference data — don't edit
  raw/                     # the two source CSVs + their MIT license
  reference/               # ground truth captured from the original site, plus specs
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
  lib/                     # transforms, filtering, log-axis guard, CSV export, URL +
                           #   route state, correlation ranking
  data/                    # typed accessors + generated/ (committed build output)
  pages/                   # one route per file, plus a directory of parts per page
scripts/
  build-data.ts            # CSVs -> typed JSON, asserts every invariant
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

Pages are code-split with `React.lazy` inside one `<Suspense>` boundary in `AppShell`, so only
the routed content area shows a loading state. Plotly and the dataset get their own chunks and
only load on the routes that need them, so a cold visit to `/` is about 137 kB gzipped.

## Data pipeline

`npm run build:data` reads the two CSVs in `data/raw/` and writes typed, columnar JSON plus a
generated column registry into `src/data/generated/`. That output is committed, so the app builds
without running the script. Columnar rather than array-of-objects because it maps straight onto
Plotly's `x`/`y` arrays and gzips much better.

It also emits a feature-vs-conductivity correlation table: for each of the 22 temperatures, the
correlation of log σ against each feature, with the pair count. Two encoding decisions are
recorded in the data rather than guessed — `crystalline?` is coded no/yes with the 19 `na` rows
dropped, and `drying vacuum` is excluded outright, because its ordinal encoding in the forML CSV
isn't recoverable with confidence. The reason is written into the generated JSON.

The assertions are the main point of that script. It fails the build unless the regenerated data
still matches the counts we verified against the original site: 655 rows, 5225 non-null
conductivity measurements, 368 samples with a T<sub>g</sub>, 441 with `approxTg`, the six
category cardinalities, and a 36×36 correlation matrix with a diagonal of exactly 1. The ground
truth is in [`data/reference/DATA-SPEC.md`](data/reference/DATA-SPEC.md).

Three data-quality fixes happen here:

- **Encoding.** The main CSV isn't valid UTF-8. There are 37 stray `0xA0` bytes and 2 `0x96`
  bytes sitting inside pasted citation text. We decode as Windows-1252 rather than Latin-1, so a
  page range reads `104–109` instead of an invisible control character.
- **Zero-width characters.** 40 cells have a `U+FEFF` inside the value, including three polymer
  names. It's invisible in any editor but it breaks exact matching and search, so we strip it at
  parse time. The downloadable CSV gets the same treatment plus a leading BOM so Excel reads it
  as UTF-8.
- **Correlation matrix.** Recomputed as plain pairwise-complete Pearson. There's a test asserting
  that ours × 271/270 reproduces the original's, which both explains the difference and pins the
  computation down.

## Charts

One `PlotlyChart` wrapper calls `Plotly.react()` against a ref instead of using
`react-plotly.js`. It uses a `ResizeObserver` for responsiveness and resolves theme colours from
CSS custom properties into concrete values, because Plotly can't read `var()` inside SVG
attributes.

**Trace batching.** The temperature page draws up to 619 sample curves. One trace each is what
the original did, and it cost roughly 1 MB of JSON per interaction. Instead, samples that share a
colour get concatenated into a single trace separated by `null`s, which gets it down to 8 traces
or fewer. A parallel `customdata` array of the same length carries each point's source row index
so a click still resolves to the right sample. That's in `src/components/charts/series.ts`, and
the index mapping has its own test, because an off-by-one there would quietly credit a
measurement to the wrong paper.

**`scattergl` is deliberately not registered.** It measured 143 kB gzipped extra, and the largest
plot here is 5225 points, which SVG handles fine. SVG also exports crisp PNGs at any scale. Read
the note in `src/components/charts/plotly.ts` before adding it back.

## Design tokens

`src/styles/theme.css` defines a semantic token contract that all the UI is built from, instead
of raw Tailwind palette colours (no `bg-slate-100` in app code): surfaces (`bg-canvas`,
`bg-surface`, `bg-surface-raised`, `bg-muted`), text (`text-primary`, `text-secondary`,
`text-muted`), borders (`border-subtle`, `border-default`, `border-strong`), one accent
(`bg-accent` / `text-accent` / `border-accent` / `text-on-accent`, plus `bg-accent-hover`),
restrained status colours (`text-danger`, `text-success`), a `.tabular` utility for lining up
numeric columns, and a `--ring` focus colour used by a global `:focus-visible` style.

Dark mode is a `.dark` class on `<html>`, applied before first paint by an inline script in
`index.html` so there's no flash of the wrong theme, then kept in sync by `ThemeProvider`
(light / dark / system, persisted to `localStorage`).

### How the chart palette was picked

The 7-slot categorical palette (`--chart-1` … `--chart-7` plus a reserved grey `--chart-other`,
typed in `src/styles/chart-palette.ts`) was found by searching the OKLCH gamut and scoring
candidates with `validate_palette.js` (OKLab ΔE under Machado-Oliveira-Fernandes CVD simulation).
It passes every hard check under the strict `--pairs all` criterion in both light and dark, which
is the criterion this app needs since the main view is a scatter plot where any two categories can
end up side by side.

Seven is the measured ceiling, not a preference. Joint light+dark margins come out at 1.29 for
six hues, 1.03 for seven and 0.96 for eight, where 1.0 is the pass mark. Dark mode is what binds,
because its lightness band (L ∈ [0.48, 0.67]) is a lot narrower than light's.

Several columns have more than seven categories (12 anions, 14 solvents, 24 polymer families, 65
DOIs, 78 polymers), so the rule is fold, never cycle. The seven most frequent categories take the
hue slots and everything else renders as a desaturated "Other". The ranking is computed once over
the whole dataset rather than the filtered view, so filtering never repaints the series that
survive. Scatter marks also vary marker symbol per slot. Full derivation and the per-column
coverage numbers are in [`data/reference/CHART-PALETTE.md`](data/reference/CHART-PALETTE.md).

## Accessibility

Keyboard reachable throughout with visible focus, semantic landmarks, a skip link, a
focus-trapped mobile nav drawer, `aria-sort` on sortable headers and live regions for result
counts. axe reports no violations across all 7 routes at desktop and mobile widths. The `/data`
table also serves as the non-colour way to read the plotted data.

## Static hosting (SPA fallback)

Routing is client-side (`BrowserRouter`), so a static host has to serve `index.html` for unknown
paths or deep links and refreshes will 404:

- **Netlify** — `public/_redirects` is already there (`/* /index.html 200`).
- **GitHub Pages** — copy the built `dist/index.html` to `dist/404.html` as a post-build step.
- **Vercel** — rewrites are configured by default for Vite SPA output.

## Data & attribution

Data from Nicole Schauser et al., UC Santa Barbara / NSF MRSEC DMR 1720256. MIT licensed:
[github.com/nschauser/PolymerElectrolyte](https://github.com/nschauser/PolymerElectrolyte). The
source CSVs and their license sit untouched in `data/raw/`. `data/reference/` holds the ground
truth we captured from the original site and used to check this rebuild against it.
