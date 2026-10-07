import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "bg-muted text-primary hover:bg-surface-raised border border-subtle",
  outline: "border border-default bg-transparent text-primary hover:bg-muted",
  ghost: "bg-transparent text-secondary hover:bg-muted hover:text-primary",
  danger: "bg-transparent text-danger border border-danger/40 hover:bg-danger/10",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-10 px-5 text-base gap-2",
  icon: "h-9 w-9 p-0",
};

/**
 * Base button. Plain native `<button>` under the hood (no built-in `asChild`
 * polymorphism) — compose it with a Radix `Trigger`/`Close` primitive's own
 * `asChild` prop when a trigger needs to look like a button, e.g.
 * `<PopoverTrigger asChild><Button>Filters</Button></PopoverTrigger>`.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  );
});
