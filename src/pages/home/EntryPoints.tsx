import { Link } from "react-router-dom";

interface EntryPoint {
  readonly to: string;
  readonly label: string;
  readonly description: string;
}

const ENTRY_POINTS: readonly EntryPoint[] = [
  {
    to: "/explore",
    label: "Explore",
    description: "Plot any two material attributes against each other, colored by category.",
  },
  {
    to: "/temperature",
    label: "Temperature",
    description: "Conductivity vs. temperature — Arrhenius, VFT, and T/Tg views.",
  },
  {
    to: "/correlations",
    label: "Correlations",
    description: "A 36×36 correlation heatmap over the machine-learning feature set.",
  },
  {
    to: "/data",
    label: "Data",
    description: "Browse, search, and export the full 655-row dataset.",
  },
];

/** The landing page's primary navigation: four plain, bordered entry points
 *  — no imagery or gradients, just a label and a one-line description. */
export function EntryPoints() {
  return (
    <nav aria-label="Primary sections">
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ENTRY_POINTS.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              className="group block h-full rounded-lg border border-subtle p-4 transition-colors hover:border-accent hover:bg-muted/60"
            >
              <span className="text-base font-semibold text-primary group-hover:text-accent">
                {item.label}
              </span>
              <p className="mt-1 text-sm text-secondary">{item.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
