import { Button, Label } from "@/components/ui";
import { PAGE_SIZE_OPTIONS } from "./pagination";

export interface PaginationControlsProps {
  page: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

/**
 * Prev/Next paging plus a page-size selector. Deliberately not a full
 * numbered pager (1 2 3 … 27) — 655 rows tops out at 27 pages of 25, and
 * Prev/Next plus "Page X of Y" covers that without the extra complexity of
 * an ellipsized page-number strip.
 */
export function PaginationControls({
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle pt-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="data-page-size">Rows per page</Label>
        <select
          id="data-page-size"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="h-9 rounded-md border border-default bg-surface px-2 text-sm text-primary"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </Button>
        <span className="tabular text-sm text-secondary">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
