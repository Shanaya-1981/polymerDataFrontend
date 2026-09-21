import { NavLink } from "react-router-dom";
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
  return (
    <nav aria-label={ariaLabel} className={className}>
      <ul
        className={orientation === "horizontal" ? "flex items-center gap-1" : "flex flex-col gap-1"}
      >
        {NAV_ITEMS.map((item) => (
          <li key={item.path}>
            <NavLink
              to={item.path}
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
