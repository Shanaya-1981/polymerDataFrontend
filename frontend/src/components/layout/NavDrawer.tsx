import { useEffect, useRef, type SVGProps } from "react";
import { Nav } from "./Nav";

interface NavDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Element to return focus to on close (typically the hamburger button). */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Mobile slide-over nav: focus trap, Escape to close, body scroll lock, and
 * closes automatically when a link is activated. Only rendered below `md`
 * (the trigger button that opens it lives in Header and is itself hidden at
 * `md` and up).
 */
export function NavDrawer({ open, onClose, triggerRef }: NavDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Read onClose through a ref so the effect below depends only on `open`.
  // Otherwise an unmemoized handler re-runs the whole effect on every parent
  // render, which would restore focus to the trigger and then re-focus the
  // first link — yanking focus out from under anyone mid-tab.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    const getFocusable = () =>
      panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];

    (getFocusable()[0] ?? panel)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = getFocusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    const trigger = triggerRef.current;

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open, triggerRef]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        id="mobile-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        tabIndex={-1}
        className="fixed inset-y-0 right-0 flex w-full max-w-xs flex-col bg-surface-raised p-6 outline-none"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-primary">Menu</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="-m-2 rounded-md p-2 text-secondary hover:bg-muted hover:text-primary"
          >
            <CloseIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <Nav orientation="vertical" onNavigate={onClose} className="mt-6" />
      </div>
    </div>
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
