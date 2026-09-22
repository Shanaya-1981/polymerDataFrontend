import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ReactNode, SVGProps } from "react";
import { cn } from "./cn";

/**
 * Mobile slide-over panel — e.g. a charts page's filter/control panel below
 * `md`. Built on Radix Dialog rather than hand-rolled (compare
 * `src/components/layout/NavDrawer.tsx`, which predates this kit and rolls
 * its own focus trap): Radix gives focus trapping, scroll lock, Escape /
 * outside-click dismissal, and focus restore to the trigger for free.
 *
 * Composition mirrors Radix's own Dialog:
 *   <Sheet open={open} onOpenChange={setOpen}>
 *     <SheetTrigger asChild><Button>Filters</Button></SheetTrigger>
 *     <SheetContent title="Filters">...</SheetContent>
 *   </Sheet>
 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export type SheetSide = "left" | "right" | "bottom";

export interface SheetContentProps {
  /** @default "right" */
  side?: SheetSide;
  /** Rendered as the panel's visible heading and its accessible name. */
  title: string;
  /** Rendered under the title. If omitted, a visually-hidden copy of
   *  `title` is used as the Dialog's accessible description instead, so
   *  Radix never has to warn about a missing one. */
  description?: string;
  children: ReactNode;
  className?: string;
}

const SIDE_CLASSES: Record<SheetSide, string> = {
  right: "inset-y-0 right-0 h-full w-full max-w-sm border-l",
  left: "inset-y-0 left-0 h-full w-full max-w-sm border-r",
  bottom: "inset-x-0 bottom-0 max-h-[85vh] w-full rounded-t-xl border-t",
};

export function SheetContent({
  side = "right",
  title,
  description,
  children,
  className,
}: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col gap-4 border-subtle bg-surface-raised p-6 outline-none",
          SIDE_CLASSES[side],
          className,
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <DialogPrimitive.Title className="text-sm font-semibold text-primary">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close
            aria-label="Close"
            className="-m-2 rounded-md p-2 text-secondary hover:bg-muted hover:text-primary"
          >
            <CloseIcon className="h-5 w-5" aria-hidden="true" />
          </DialogPrimitive.Close>
        </div>
        {description ? (
          <DialogPrimitive.Description className="-mt-2 text-sm text-secondary">
            {description}
          </DialogPrimitive.Description>
        ) : (
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      {...props}
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
