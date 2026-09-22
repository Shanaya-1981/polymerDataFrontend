/**
 * Pure pagination maths shared by the page-size selector, the Prev/Next
 * controls, and the "Showing X–Y of N" summary.
 */
export interface PageInfo {
  /** 1-based, clamped into `[1, totalPages]`. */
  readonly page: number;
  readonly totalPages: number;
  /** 0-based, inclusive — index into the full filtered+sorted list. */
  readonly startIndex: number;
  /** 0-based, exclusive. */
  readonly endIndex: number;
  /** 1-based "showing N" numbers for display; both 0 when `totalItems` is 0. */
  readonly startDisplay: number;
  readonly endDisplay: number;
}

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE: (typeof PAGE_SIZE_OPTIONS)[number] = 25;

export function isValidPageSize(n: number): n is (typeof PAGE_SIZE_OPTIONS)[number] {
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n);
}

/**
 * A requested page outside `[1, totalPages]` is clamped rather than treated
 * as an error — the common way to land there is a filter or search narrowing
 * the result set out from under a page number already sitting in the URL.
 * `totalPages` is always at least 1, even for zero items, so "Page 1 of 1"
 * is well-defined for an empty result set.
 */
export function paginate(totalItems: number, page: number, pageSize: number): PageInfo {
  const size = Math.max(1, Math.floor(pageSize) || 1);
  const totalPages = Math.max(1, Math.ceil(totalItems / size));
  const clampedPage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const startIndex = (clampedPage - 1) * size;
  const endIndex = Math.min(startIndex + size, totalItems);

  return {
    page: clampedPage,
    totalPages,
    startIndex,
    endIndex,
    startDisplay: totalItems === 0 ? 0 : startIndex + 1,
    endDisplay: endIndex,
  };
}
