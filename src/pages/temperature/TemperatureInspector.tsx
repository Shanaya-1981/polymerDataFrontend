import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, cn } from "@/components/ui";
import { formatConductivity, type TemperatureInspectorData } from "./traces";

export interface TemperatureInspectorProps {
  selected: TemperatureInspectorData | null;
}

function isDoiLink(doi: string | null): doi is string {
  return !!doi && /^https?:\/\//i.test(doi);
}

/**
 * Click-to-inspect readout for the Temperature plot, rendered in
 * `ChartPageLayout`'s `inspector` slot below the chart on every breakpoint.
 * Shows the clicked point's Polymer, its own temperature and conductivity,
 * and the source DOI as a real link — resolved via `resolveClickedPoint` +
 * `buildInspectorData` in `traces.ts` (never a trace/point index, since
 * `buildTemperatureLineTraces` concatenates many rows into one trace).
 */
export function TemperatureInspector({ selected }: TemperatureInspectorProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Selected sample</CardTitle>
        {!selected ? (
          <p className="text-sm text-secondary">
            Click a point on the plot to see its details here.
          </p>
        ) : null}
      </CardHeader>

      {selected ? (
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
            <InspectorField label="Polymer" value={selected.polymer ?? "Unknown"} />
            <InspectorField label="Temperature" value={`${selected.temperatureC} °C`} tabular />
            <InspectorField
              label="Conductivity"
              value={<Conductivity value={selected.conductivity} />}
              tabular
            />
            <div className="sm:col-span-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted">Source</dt>
              <dd className="mt-0.5 break-all text-sm">
                {isDoiLink(selected.doi) ? (
                  <a
                    href={selected.doi}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline underline-offset-4 hover:text-accent-hover"
                  >
                    {selected.doi}
                  </a>
                ) : (
                  <span className="text-primary">{selected.doi ?? "Unknown"}</span>
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      ) : null}
    </Card>
  );
}

function Conductivity({ value }: { value: number }) {
  const { mantissa, exponent } = formatConductivity(value);
  return (
    <>
      {mantissa} &times; 10<sup>{exponent}</sup> S cm<sup>-1</sup>
    </>
  );
}

function InspectorField({
  label,
  value,
  tabular,
}: {
  label: string;
  value: ReactNode;
  tabular?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className={cn("mt-0.5 text-sm text-primary", tabular && "tabular")}>{value}</dd>
    </div>
  );
}
