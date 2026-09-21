export interface NavItem {
  path: string;
  label: string;
}

/** Single source of truth for the primary nav — used by both the desktop
 *  header bar and the mobile drawer. */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: "/", label: "Home" },
  { path: "/explore", label: "Explore" },
  { path: "/temperature", label: "Temperature" },
  { path: "/correlations", label: "Correlations" },
  { path: "/data", label: "Data" },
  { path: "/features", label: "Features" },
  { path: "/about", label: "About" },
];
