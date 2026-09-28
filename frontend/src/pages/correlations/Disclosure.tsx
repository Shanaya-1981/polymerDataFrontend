import { useId, useState, type ReactNode, type SVGProps } from "react";
import { cn } from "@/components/ui";

export interface DisclosureProps {
  summary: string;
  children: ReactNode;
  /** @default false */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * A collapsed-by-default explanatory block, so prose never pushes the chart
 * below the fold — this page used to lead with three paragraphs before
 * showing anything. Built from a plain `aria-expanded`/`aria-controls`
 * button rather than `<details>`, matching this app's existing disclosure
 * (`/data`'s "Filters" toggle) instead of introducing a second pattern.
 *
 * The content stays mounted while closed (`hidden`, not removed) so
 * `aria-controls` always resolves to a real element.
 */
export function Disclosure({ summary, children, defaultOpen = false, className }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1.5 rounded px-1 py-0.5 text-sm font-medium text-secondary hover:text-primary"
      >
        <ChevronIcon
          className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
        {summary}
      </button>
      {/* Native `hidden` (not a Tailwind class) so visibility is a real DOM
          attribute: it needs no stylesheet to take effect, which is what
          makes it observable from a jsdom unit test as well as a browser. */}
      <div id={contentId} hidden={!open} className="mt-3 max-w-3xl space-y-3 text-secondary">
        {children}
      </div>
    </div>
  );
}

function ChevronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
