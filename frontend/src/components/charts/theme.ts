import { useSyncExternalStore } from "react";

/**
 * Resolved light/dark mode. The chart layer defines its own copy of this
 * (rather than importing `ResolvedTheme` from `@/components/theme`) so it
 * has zero dependency on how — or whether — the app manages theme state: it
 * only ever looks at the one DOM signal that actually drives the CSS
 * tokens, the `.dark` class on `<html>` (see `ThemeProvider.tsx`). That
 * keeps this module usable (and testable) standalone.
 */
export type ChartThemeMode = "light" | "dark";

/** Concrete (non-`var()`) values for the tokens `PlotlyChart`'s default
 *  layout needs. Plotly renders outside the CSS cascade (SVG presentation
 *  attributes, WebGL/canvas fills), so `var(--color-surface)` etc. does not
 *  resolve there — see `PlotlyChart.tsx`. */
export interface ChartThemeTokens {
  surface: string;
  textPrimary: string;
  textSecondary: string;
  borderDefault: string;
  borderSubtle: string;
}

/**
 * Mirrors the *light*-mode values in `src/styles/theme.css`. Used only as a
 * last-resort default if a variable isn't resolvable yet (e.g. read before
 * `theme.css` has been parsed, or in an environment with no stylesheet at
 * all, such as a unit test). Not a substitute for the token system —
 * `readChartThemeTokens` always prefers the live computed value.
 */
const FALLBACK_TOKENS: ChartThemeTokens = {
  surface: "#ffffff",
  textPrimary: "#18181b",
  textSecondary: "#52525b",
  borderDefault: "#8c8c95",
  borderSubtle: "#e7e7ea",
};

function readCssVar(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name).trim();
  return value.length > 0 ? value : fallback;
}

/** Read the resolved theme mode directly from the DOM. Safe to call outside
 *  React (e.g. from a `series.ts` call site). */
export function readChartThemeMode(): ChartThemeMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Read the resolved token values directly from the DOM. */
export function readChartThemeTokens(): ChartThemeTokens {
  if (typeof window === "undefined") return FALLBACK_TOKENS;
  const styles = getComputedStyle(document.documentElement);
  return {
    surface: readCssVar(styles, "--color-surface", FALLBACK_TOKENS.surface),
    textPrimary: readCssVar(styles, "--color-primary", FALLBACK_TOKENS.textPrimary),
    textSecondary: readCssVar(styles, "--color-secondary", FALLBACK_TOKENS.textSecondary),
    borderDefault: readCssVar(styles, "--color-default", FALLBACK_TOKENS.borderDefault),
    borderSubtle: readCssVar(styles, "--color-subtle", FALLBACK_TOKENS.borderSubtle),
  };
}

/**
 * Notifies `onStoreChange` whenever `<html class="...">` mutates — the one
 * DOM signal `ThemeProvider` uses to apply a theme. Shared subscribe
 * function for both hooks below, per the `useSyncExternalStore` contract.
 */
function subscribeToThemeClass(onStoreChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** `ChartThemeMode`, kept in sync with the `.dark` class via
 *  `useSyncExternalStore` (the string result is a primitive, so no
 *  memoization is needed for `Object.is` snapshot comparison). Pass the
 *  result to `series.ts`'s trace builders so trace colors repaint on theme
 *  change. */
export function useChartThemeMode(): ChartThemeMode {
  return useSyncExternalStore(subscribeToThemeClass, readChartThemeMode, () => "light");
}

// `useSyncExternalStore` requires `getSnapshot` to return a referentially
// stable value when nothing has changed (otherwise React sees "the store
// changed" on every render and can loop). `readChartThemeTokens` allocates a
// fresh object every call, so this caches the last snapshot and only
// replaces it when a resolved value actually differs.
let lastTokensSnapshot = FALLBACK_TOKENS;

function getChartThemeTokensSnapshot(): ChartThemeTokens {
  const next = readChartThemeTokens();
  const prev = lastTokensSnapshot;
  if (
    next.surface === prev.surface &&
    next.textPrimary === prev.textPrimary &&
    next.textSecondary === prev.textSecondary &&
    next.borderDefault === prev.borderDefault &&
    next.borderSubtle === prev.borderSubtle
  ) {
    return prev;
  }
  lastTokensSnapshot = next;
  return next;
}

/** `ChartThemeTokens`, kept in sync with the `.dark` class. Used internally
 *  by `PlotlyChart`'s default layout. */
export function useChartThemeTokens(): ChartThemeTokens {
  return useSyncExternalStore(
    subscribeToThemeClass,
    getChartThemeTokensSnapshot,
    () => FALLBACK_TOKENS,
  );
}
