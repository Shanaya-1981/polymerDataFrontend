import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * A page's control state, expressed as URL search params so any plot can be
 * linked — pasted into a paper, a Slack thread, or a lab notebook — and come
 * back exactly as it was. The original site had no shareable state at all:
 * every view was a dead end you had to describe in prose.
 *
 * Values are either a single string or a list (for multi-select filters).
 * `null` means "not set".
 */
export type UrlStateValue = string | readonly string[] | null;
export type UrlState = Record<string, UrlStateValue>;

/**
 * Two-way bind a page's control state to the query string.
 *
 * Anything equal to its default is omitted from the URL, so the common case
 * stays a clean `/explore` rather than a wall of redundant params, and the
 * defaults can be changed later without stale links silently pinning the old
 * ones. Updates use `replace` so dragging a slider or flipping an axis does
 * not bury the back button under a hundred history entries.
 *
 * @param defaults the state shape and its default values
 * @returns `[state, patch]` — `patch` merges, so callers set one key at a time
 */
export function useUrlState<T extends UrlState>(defaults: T): [T, (patch: Partial<T>) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  // Call sites pass an object literal, so a new identity arrives on every
  // render. Key off its contents instead: `stableDefaults` only changes when
  // a default actually changes, which keeps both memos below honest without
  // reaching for a ref (refs must not be written during render).
  const defaultsKey = JSON.stringify(defaults);
  const stableDefaults = useMemo(() => JSON.parse(defaultsKey) as T, [defaultsKey]);

  const state = useMemo(() => {
    const next = {} as Record<string, UrlStateValue>;
    for (const [key, fallback] of Object.entries(stableDefaults)) {
      if (Array.isArray(fallback)) {
        const all = searchParams.getAll(key);
        next[key] = searchParams.has(key) ? all : fallback;
      } else {
        const raw = searchParams.get(key);
        next[key] = raw ?? fallback;
      }
    }
    return next as T;
  }, [searchParams, stableDefaults]);

  const patch = useCallback(
    (changes: Partial<T>) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            const fallback = stableDefaults[key];
            next.delete(key);
            if (value == null || isDefault(value, fallback)) continue;
            if (Array.isArray(value)) {
              // An explicitly-empty list is still a choice ("filter on, but
              // nothing selected"), so record it rather than dropping it.
              if (value.length === 0) next.set(key, "");
              else for (const v of value) next.append(key, v);
            } else {
              next.set(key, String(value));
            }
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, stableDefaults],
  );

  return [state, patch];
}

function isDefault(value: UrlStateValue, fallback: UrlStateValue): boolean {
  if (Array.isArray(value) && Array.isArray(fallback)) {
    return value.length === fallback.length && value.every((v, i) => v === fallback[i]);
  }
  return value === fallback;
}
