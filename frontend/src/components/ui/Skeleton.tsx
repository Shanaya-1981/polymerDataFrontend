import { cn } from "./cn";
import type { HTMLAttributes } from "react";

/**
 * Generic loading placeholder block. Size it with `className`
 * (e.g. `className="h-4 w-32"` for a text line, `className="h-64 w-full"`
 * for a chart-sized area).
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
