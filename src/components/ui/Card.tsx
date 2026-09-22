import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "./cn";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn("rounded-lg border border-subtle bg-surface", className)}
      {...props}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return (
      <div ref={ref} className={cn("flex flex-col gap-1.5 p-4 sm:p-5", className)} {...props} />
    );
  },
);

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  /**
   * Heading level. Defaults to `h3`, which suits a card nested under a
   * section heading — but a card sitting directly under the page `h1` needs
   * `h2`, or the document skips a level. Card cannot infer its own depth,
   * and on responsive pages the depth genuinely changes: a sidebar `h2` that
   * is `display:none` at narrow widths leaves the card's title as the first
   * heading after the `h1`.
   */
  as?: "h2" | "h3" | "h4";
}

export const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(function CardTitle(
  { className, as: Heading = "h3", ...props },
  ref,
) {
  return (
    <Heading
      ref={ref}
      className={cn("text-base font-semibold leading-none text-primary", className)}
      {...props}
    />
  );
});

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return <p ref={ref} className={cn("text-sm text-secondary", className)} {...props} />;
});

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn("p-4 pt-0 sm:p-5 sm:pt-0", className)} {...props} />;
  },
);

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn("flex items-center gap-2 border-t border-subtle p-4 sm:p-5", className)}
        {...props}
      />
    );
  },
);
