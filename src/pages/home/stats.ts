/**
 * Real dataset statistics for the landing page, derived live from the data
 * layer (`@/data`) rather than hard-coded — see DATA-SPEC.md §5/§9 for the
 * ground-truth numbers these are expected to reproduce (655 rows, 65 DOIs,
 * 78 polymers, 12 anions, 24 polymer families, 22 measured temperatures).
 * Kept as a plain function (no React) so it's trivial to unit test.
 */
import { ROW_COUNT, TEMPERATURES_C, categoryOrder } from "@/data";

export interface LandingStat {
  readonly label: string;
  readonly value: number;
}

/** One stat per headline number on `/`, in display order. */
export function landingStats(): readonly LandingStat[] {
  return [
    { label: "Samples", value: ROW_COUNT },
    { label: "Source papers", value: categoryOrder("doi").length },
    { label: "Polymers", value: categoryOrder("polymer").length },
    { label: "Anions", value: categoryOrder("anion").length },
    { label: "Polymer families", value: categoryOrder("polymerFamily").length },
    { label: "Measured temperatures", value: TEMPERATURES_C.length },
  ];
}
