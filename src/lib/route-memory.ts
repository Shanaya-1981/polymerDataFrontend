/**
 * Remembers each route's last-seen query string, keyed by pathname, so a
 * nav link can carry a visitor back to the view they left instead of a
 * bare default. This is what fixes the "navigate away and back loses my
 * state" bug: `useUrlState` (`@/lib/url-state`) already puts every page
 * setting in the URL, but a nav link has always pointed at the bare
 * pathname, so clicking to another tab and back landed on a fresh,
 * default `?`-less URL — even though the configured view was still sitting
 * in browser history the whole time (back-back would have found it).
 *
 * Backed by `sessionStorage` — scoped to this browser tab and surviving a
 * reload, unlike an in-memory-only store, but (unlike `localStorage`)
 * never leaking into another tab or outliving the session. `sessionStorage`
 * access can throw — Safari private browsing has historically thrown on
 * `setItem` (quota reported as 0), and a sufficiently locked-down browser
 * can throw on merely reading the property — so every access is guarded
 * and falls back to an in-memory `Map` for the rest of the session:
 * degraded (won't survive a reload), but never a crash. Mirrors the same
 * try/catch-and-fall-back shape `theme-context.ts` already uses for
 * `localStorage`.
 *
 * ---
 *
 * IMPORTANT — why this module never *restores* state on its own:
 *
 * The URL is the single source of truth for what a page renders; that is
 * the whole point of `useUrlState`. This module is only a source of truth
 * for what a *nav link* points at, and the only reader is `Nav`, which uses
 * it to build each link's `href`. Nothing here re-injects a remembered
 * search into the current URL on mount, and nothing here should ever be
 * changed to do so.
 *
 * If a page auto-restored from this store when it mounted, opening a
 * shared link to a bare `/explore` would silently get overwritten by
 * whatever the previous visitor in this tab had last configured — the
 * address bar would say one thing and the page would show another, with
 * two competing sources of truth for the same state. Restoration must
 * happen *only* because the user clicked a nav link whose `href` already
 * carries the remembered query string — an explicit navigation the user
 * chose, never a side effect of a page mounting.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_PREFIX = "pe-dm-route:";

// Used whenever sessionStorage is unavailable or a call throws — keeps the
// feature working (for the rest of this session) instead of breaking
// navigation.
const memoryFallback = new Map<string, string>();

function storageKey(pathname: string): string {
  return `${STORAGE_PREFIX}${pathname}`;
}

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorage(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Record `search` (as `location.search` gives it — `""`, or a
 *  leading-`?` query string) as the last-seen search for `pathname`. */
function rememberRoute(pathname: string, search: string): void {
  const key = storageKey(pathname);
  if (writeStorage(key, search)) {
    // Drop any stale fallback entry so a since-recovered sessionStorage
    // (quota freed up, private mode toggled off, ...) isn't shadowed by it.
    memoryFallback.delete(key);
  } else {
    memoryFallback.set(key, search);
  }
}

/** The last-remembered query string for `pathname` (`""` if nothing has
 *  been recorded for it yet, including when storage never accepted a
 *  write). */
function rememberedSearch(pathname: string): string {
  const key = storageKey(pathname);
  const stored = readStorage(key);
  if (stored !== null) return stored;
  return memoryFallback.get(key) ?? "";
}

/**
 * `pathname` with its remembered query string appended — what a nav link
 * should point at instead of the bare pathname, so following it restores
 * the view the user last had open on that route. Returns `pathname`
 * unchanged when nothing is remembered for it.
 */
export function rememberedPath(pathname: string): string {
  const search = rememberedSearch(pathname);
  return search ? `${pathname}${search}` : pathname;
}

/**
 * Forget `pathname`'s remembered query string. Used by each stateful
 * page's "Reset to defaults" control: clearing the URL alone isn't
 * enough, because the next click on that page's own nav link would
 * otherwise read the still-remembered (pre-reset) search back out of
 * storage and carry the old state right back in.
 */
export function clearRememberedRoute(pathname: string): void {
  const key = storageKey(pathname);
  removeStorage(key);
  memoryFallback.delete(key);
}

/**
 * Mount once, in `AppShell`: records the current location's query string
 * under its pathname every time either changes, including on first mount.
 * Recording on mount matters as much as recording on navigation — without
 * it, a visitor who opens a shared `/explore?y=...` link and immediately
 * clicks to another tab (without touching a control first) would have
 * nothing remembered for `/explore` at all, since a change is what would
 * normally trigger the record.
 */
export function useRouteMemoryRecorder(): void {
  const location = useLocation();
  useEffect(() => {
    rememberRoute(location.pathname, location.search);
  }, [location.pathname, location.search]);
}
