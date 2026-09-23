import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { InfoIcon } from "./icons";

export interface InfoTooltipProps {
  /** The explanation shown in the tooltip bubble. */
  content: ReactNode;
  /** Accessible name for the trigger button — defaults to a generic "More
   *  information", but pass something specific ("What is Tg?") where the
   *  surrounding context doesn't already say what's being explained. */
  label?: string;
  className?: string;
}

/**
 * A small "i" glyph that reveals `content` on hover or keyboard focus.
 * Built for glossary-style asides (a jargon term, a column description)
 * rather than for anything the user must read to complete a task — Radix's
 * `Tooltip` is deliberately non-modal and closes on Escape/blur, so never
 * put content here that isn't also available elsewhere for a mouse-less or
 * touch-only reader (a `title`, the Features glossary page, etc.).
 *
 * Bundles its own `Tooltip.Provider` (Radix requires one as an ancestor)
 * rather than relying on one mounted at the app root, so this works
 * standalone in component tests that render a page in isolation. The
 * tradeoff is that adjacent `InfoTooltip`s don't share a hover-delay group —
 * a non-issue at the density this is actually used.
 */
export function InfoTooltip({ content, label = "More information", className }: InfoTooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={300} skipDelayDuration={100}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted transition-colors",
              "hover:text-secondary focus-visible:text-secondary",
              className,
            )}
          >
            <InfoIcon className="h-full w-full" aria-hidden="true" />
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side="top"
            align="center"
            sideOffset={6}
            className={cn(
              "z-50 max-w-64 rounded-md border border-subtle bg-surface-raised px-2.5 py-1.5 text-xs text-secondary shadow-lg",
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-surface-raised" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
