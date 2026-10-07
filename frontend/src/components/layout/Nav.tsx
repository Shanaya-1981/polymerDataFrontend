import { NavLink, useLocation } from "react-router-dom";
import { rememberedPath } from "@/lib/route-memory";
import { NAV_ITEMS } from "./nav-items";

interface NavProps {
  /** Called after a link is activated (used to close the mobile drawer). */
  onNavigate?: () => void;
  orientation?: "horizontal" | "vertical";
  "aria-label"?: string;
  className?: string;
}

/** The primary nav link list. Reused by both the desktop header bar and the
 *  mobile drawer — only the layout (orientation) differs between the two. */
export function Nav({
  onNavigate,
  orientation = "horizontal",
  "aria-label": ariaLabel = "Primary",
  className = "",
}: NavProps) {
  // `rememberedPath` reads sessionStorage directly during render rather
  // than through a hook, so nothing here would otherwise tie a re-render of
  // *this* component to navigation. Subscribing to the location is what
  // makes each link's `to` pick up a just-recorded search, instead of
  // freezing at whatever was remembered when Nav last happened to render.
  const location = useLocation();

  // The route we are *on* is a special case: its remembered value is always
  // one step behind, because the recorder writes it in an effect that runs
  // after this render. Reading storage for it would hand the active link a
  // stale search, and clicking the tab you are already on right after
  // changing a control would then silently reset the page. Use the live
  // location for the active route and storage only for the others.
  const hrefFor = (path: string) =>
    path === location.pathname ? path + location.search : rememberedPath(path);

  return (
    <nav aria-label={ariaLabel} className={className}>
      <ul
        className={orientation === "horizontal" ? "flex items-center gap-1" : "flex flex-col gap-1"}
      >
        {NAV_ITEMS.map((item) => (
          <li key={item.path}>
            <NavLink
              // Carries the route's query string — live for the active
              // route, remembered for the rest — so following this link
              // restores the view left there instead of resetting it.
              // `NavLink` matches active/`aria-current`
              // purely on the resolved *pathname* (react-router splits
              // `to` into pathname/search/hash before comparing), so
              // appending a search string here does not affect matching.
              to={hrefFor(item.path)}
              end={item.path === "/"}
              onClick={onNavigate}
              className={({ isActive }) =>
                "block rounded-md px-3 py-2 text-sm font-medium transition-colors " +
                (isActive
                  ? "bg-muted text-primary"
                  : "text-secondary hover:bg-muted hover:text-primary")
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
