import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "./cn";

export type BadgeVariant = "default" | "accent" | "outline";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-muted text-secondary",
  accent: "bg-accent text-on-accent",
  outline: "border border-default text-secondary",
};

/** Small inline status/count pill, e.g. "Other", a filter count, or "New". */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant = "default", ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
});
