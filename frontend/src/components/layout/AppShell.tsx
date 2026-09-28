import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { useRouteMemoryRecorder } from "@/lib/route-memory";
import { Header } from "./Header";
import { Footer } from "./Footer";

function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[40vh] items-center justify-center text-secondary"
    >
      Loading…
    </div>
  );
}

/** Top-level page frame: skip link, header/nav, routed page content, footer.
 *  Rendered once as a layout route; `<Outlet />` swaps in the active page. */
export function AppShell() {
  // Mounted once here, since this component renders exactly once as the
  // layout route wrapping every page — see `route-memory.ts` for what this
  // records and, importantly, why it never restores state on its own.
  useRouteMemoryRecorder();

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Skip to content
      </a>

      <Header />

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none sm:px-6 lg:px-8"
      >
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>

      <Footer />
    </div>
  );
}
