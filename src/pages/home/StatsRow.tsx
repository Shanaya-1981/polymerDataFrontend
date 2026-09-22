import { landingStats } from "./stats";

/**
 * Headline dataset numbers, pulled live from `@/data` (see `stats.ts`) —
 * never hard-coded, so a future data refresh updates this automatically.
 * Plain `<dl>` + hairline rule instead of a card grid: this is a scientific
 * instrument, not a marketing page, so the numbers get typography, not
 * chrome.
 */
export function StatsRow() {
  const stats = landingStats();

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((stat) => (
        <div key={stat.label} className="border-t border-subtle pt-3">
          <dt className="text-sm text-secondary">{stat.label}</dt>
          <dd className="mt-1 font-tabular text-2xl font-semibold text-primary">
            {stat.value.toLocaleString()}
          </dd>
        </div>
      ))}
    </dl>
  );
}
