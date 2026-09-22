import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Notice } from "@/components/ui";
import { CorrelationHeatmap } from "./CorrelationHeatmap";
import { Disclosure } from "./Disclosure";
import { RankedCorrelationView } from "./RankedCorrelationView";
import { resolveTargetRanking, DEFAULT_TARGET, type CorrelationTarget } from "./targets";
import { TargetPicker } from "./TargetPicker";
import { ViewToggle, type CorrelationViewMode } from "./ViewToggle";

const WIDE_SCREEN_QUERY = "(min-width: 1024px)"; // Tailwind's `lg` breakpoint

/**
 * The view mode's *initial* value only — matrix on a screen already wide
 * enough to show it comfortably, the ranked list otherwise. Computed once
 * at mount, not kept in sync with later resizes: after that, `viewMode` is
 * an ordinary piece of toggle state, and a live-resizing default would
 * fight a user who just chose the other view on purpose. `matchMedia` isn't
 * implemented in jsdom, so the guard also keeps this safe under the unit
 * test environment (falls back to "matrix").
 */
function initialViewMode(): CorrelationViewMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "matrix";
  return window.matchMedia(WIDE_SCREEN_QUERY).matches ? "matrix" : "ranked";
}

/**
 * `/correlations`'s body: a target picker and a Matrix/Ranked-list toggle
 * above whichever view is active, with the explanatory prose collapsed
 * behind a disclosure so the chart is the first thing on screen.
 *
 * Both views stay mounted; only visibility (a `hidden`/`block` class, not
 * conditional rendering) is toggle-driven, so a phone user who explicitly
 * asks for the 36x36 matrix still gets it — horizontal scroll and all —
 * and a desktop user can just as easily switch to the ranked list.
 */
export function CorrelationExplorer() {
  const [viewMode, setViewMode] = useState<CorrelationViewMode>(initialViewMode);
  const [target, setTarget] = useState<CorrelationTarget>(DEFAULT_TARGET);

  const ranking = useMemo(() => resolveTargetRanking(target), [target]);

  return (
    <div className="flex flex-col gap-6">
      <Disclosure summary="What am I looking at?">
        <p>
          Each cell of the matrix is the Pearson correlation coefficient (r) between one pair of
          the 36 features used to model ionic conductivity, computed across every sample with data
          for both. Blue means the two features move in opposite directions (r near −1), gray means
          they are essentially unrelated (r near 0), and pink-red means they move together (r near
          +1). The diagonal is always exactly 1 — every feature correlates perfectly with itself.
          Hover any cell for the exact pair and r value.
        </p>
        <p>
          The ranked list turns either the matrix or a feature-vs-conductivity table into one
          sorted list against whatever target you pick: the strongest relationships first,
          regardless of sign, with the sample size (n) each one is based on shown alongside — a
          correlation over a handful of samples is not as trustworthy as one over hundreds, so bars
          built on less data are rendered lighter, not just labeled differently.
        </p>
        <p>
          Not sure what a feature like{" "}
          <span className="font-mono text-sm">Comonomer1 AETA_eta_BR</span> means? See the{" "}
          <Link
            to="/features"
            className="text-accent underline underline-offset-4 hover:text-accent-hover"
          >
            feature glossary
          </Link>{" "}
          for a plain-language description of all 36.
        </p>
        <Notice tone="info" title="A note on the matrix">
          Recomputed as plain Pearson correlation, so the diagonal here is exactly 1. The original
          site&rsquo;s matrix was scaled by a constant 271/270 — a population/sample
          standard-deviation mismatch — which made its diagonal read 1.0037. Because the factor is
          the same for every entry, it left the relative structure untouched: any comparison drawn
          from the original plot still holds.
        </Notice>
      </Disclosure>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {viewMode === "ranked" ? <TargetPicker value={target} onChange={setTarget} /> : null}
        </div>
        <ViewToggle value={viewMode} onChange={setViewMode} className="self-start sm:self-auto" />
      </div>

      <div className={viewMode === "matrix" ? "block" : "hidden"}>
        <CorrelationHeatmap />
      </div>
      <div className={viewMode === "ranked" ? "block" : "hidden"}>
        <RankedCorrelationView target={target} ranking={ranking} />
      </div>
    </div>
  );
}
