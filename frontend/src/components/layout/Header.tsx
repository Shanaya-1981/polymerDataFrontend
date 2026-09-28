import { useCallback, useRef, useState, type SVGProps } from "react";
import { Link } from "react-router-dom";
import { ThemeToggle } from "@/components/theme";
import { Nav } from "./Nav";
import { NavDrawer } from "./NavDrawer";

export function Header() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Stable identity: NavDrawer's focus-trap effect keys off this, and a new
  // closure each render would tear the trap down and re-steal focus.
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <header className="sticky top-0 z-40 border-b border-subtle bg-surface">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="shrink-0 rounded-md text-base font-semibold tracking-tight text-primary"
        >
          <span className="hidden md:inline">Polymer Electrolyte Data Mining</span>
          <span className="md:hidden">PE Data Mining</span>
        </Link>

        <Nav orientation="horizontal" className="ml-4 hidden md:block" />

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            aria-controls="mobile-nav-drawer"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-secondary hover:bg-muted hover:text-primary md:hidden"
          >
            <MenuIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <NavDrawer open={drawerOpen} onClose={closeDrawer} triggerRef={triggerRef} />
    </header>
  );
}

function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      {...props}
    >
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}
