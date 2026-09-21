# Polymer Electrolyte Data Mining

A modern, fully client-side rebuild of [pedatamine.org](https://pedatamine.org) — the UC Santa
Barbara Polymer Electrolyte Data Mining site. The original is a Plotly Dash app that is slow,
visually dated, and effectively unusable on mobile. This project reimplements it as a fast,
responsive, static single-page app with the same underlying dataset, so researchers can explore
polymer-electrolyte conductivity data against material attributes without the baggage of a
server-rendered Dash backend.

This repository currently contains the **foundation**: tooling, design tokens, theming, the app
shell, and routed page stubs. Page bodies (charts, tables, filters) are built in later work on top
of this base.

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
npm test          # vitest run
```

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
    chart-palette.ts       # typed mirror of the --chart-1..12 CSS variables
  components/
    theme/                # ThemeProvider, ThemeToggle, useTheme (light/dark/system)
    layout/                # AppShell, Header, Nav, NavDrawer, Footer, PageHeader
    ui/                    # (later work) shared UI primitives
    charts/                # (later work) chart components
  lib/                     # (later work) data loading/parsing utilities
  data/                    # (later work) processed/typed dataset access
  pages/                   # one route per file (see table below)
scripts/                   # (later work) Node scripts, run with tsx
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

A 12-slot categorical chart palette (`--chart-1` … `--chart-12` in `theme.css`, typed and
documented in `src/styles/chart-palette.ts`) is validated with the project's dataviz-skill method
(OKLab CVD simulation, not eyeballed): all 12 slots pass for _adjacent_ use (legends, bars,
stacked lines); the first 4 additionally pass the stricter _all-pairs_ check needed for
scatter/bubble charts. `chart-palette.ts` documents the fallback strategy for the dataset's larger
categorical columns (up to 24 polymer families): fold the long tail into an "Other" bucket rather
than minting unvalidated hues, and add a secondary encoding (marker shape, dash pattern) if every
category must stay individually addressable.

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
