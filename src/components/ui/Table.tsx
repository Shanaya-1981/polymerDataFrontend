import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  type ThHTMLAttributes,
  type TdHTMLAttributes,
} from "react";
import { cn } from "./cn";

/**
 * Semantic `<table>` primitives with a sticky header and a sortable-header
 * affordance, used as the base for the `/data` route.
 *
 * The root wraps the table in a scrollable container so the sticky header
 * has something to stick against — give it a bounded height for that to be
 * visible, e.g. `<Table className="max-h-[32rem]">`. Without a bounded
 * height the container simply grows to fit its content (harmless, just no
 * internal scrolling).
 */
export const Table = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Table(
  { className, children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn("relative w-full overflow-auto rounded-lg border border-subtle", className)}
      {...props}
    >
      <table className="w-full caption-bottom text-sm">{children}</table>
    </div>
  );
});

export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function TableHeader({ className, ...props }, ref) {
  return (
    <thead
      ref={ref}
      className={cn("sticky top-0 z-10 bg-surface-raised text-left", className)}
      {...props}
    />
  );
});

export const TableBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function TableBody({ className, ...props }, ref) {
  return <tbody ref={ref} className={cn("divide-y divide-subtle", className)} {...props} />;
});

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  function TableRow({ className, ...props }, ref) {
    return (
      <tr ref={ref} className={cn("transition-colors hover:bg-muted/60", className)} {...props} />
    );
  },
);

export interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** `false` (not sortable), or the column's current sort direction. */
  sortDirection?: "asc" | "desc" | false;
  /** Presence makes the header interactive (rendered as a button). */
  onSort?: () => void;
  /** Rendered as a sibling after the sort button rather than inside it —
   *  for interactive content (e.g. an `InfoTooltip`) that would otherwise
   *  end up as an invalid nested `<button>` inside the sort button. */
  endAdornment?: ReactNode;
}

export const TableHead = forwardRef<HTMLTableCellElement, TableHeadProps>(function TableHead(
  { className, children, sortDirection = false, onSort, endAdornment, ...props },
  ref,
) {
  return (
    <th
      ref={ref}
      scope="col"
      aria-sort={
        sortDirection === "asc" ? "ascending" : sortDirection === "desc" ? "descending" : "none"
      }
      className={cn(
        "whitespace-nowrap border-b border-subtle px-3 py-2 text-xs font-semibold uppercase tracking-wide text-secondary",
        className,
      )}
      {...props}
    >
      <span className="inline-flex items-center gap-1.5">
        {onSort ? (
          <button
            type="button"
            onClick={onSort}
            className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-primary"
          >
            {children}
            <SortIcon direction={sortDirection} />
          </button>
        ) : (
          children
        )}
        {endAdornment}
      </span>
    </th>
  );
});

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  function TableCell({ className, ...props }, ref) {
    return <td ref={ref} className={cn("px-3 py-2 text-primary", className)} {...props} />;
  },
);

function SortIcon({ direction }: { direction: "asc" | "desc" | false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("h-3 w-3 shrink-0 transition-transform", direction === "desc" && "rotate-180")}
    >
      <path d={direction ? "M12 19V5M5 12l7-7 7 7" : "M8 9l4-4 4 4M8 15l4 4 4-4"} />
    </svg>
  );
}
