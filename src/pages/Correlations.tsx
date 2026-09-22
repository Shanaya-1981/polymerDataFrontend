import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Notice } from "@/components/ui";
import { CorrelationHeatmap } from "./correlations/CorrelationHeatmap";

export default function Correlations() {
  return (
    <>
      <PageHeader
        title="Correlations"
        description="How the 36 machine-learning features relate to each other across the dataset."
      />

      <div className="flex flex-col gap-6">
        <p className="max-w-3xl text-secondary">
          Each cell is the Pearson correlation coefficient (r) between one pair of the 36 features
          used to model ionic conductivity, computed across every sample with data for both.
          Blue means the two features move in opposite directions (r near −1), gray means they are
          essentially unrelated (r near 0), and pink-red means they move together (r near +1). The
          diagonal is always exactly 1 — every feature correlates perfectly with itself. Hover any
          cell for the exact pair and r value.
        </p>
        <p className="max-w-3xl text-secondary">
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

        <CorrelationHeatmap />

        <Notice tone="info" title="A note on this matrix">
          Recomputed as plain Pearson correlation. The original site&rsquo;s matrix multiplied
          every entry by a constant 271/270 — a population/sample standard-deviation mismatch — so
          its diagonal read 1.0037 instead of 1.0. This version&rsquo;s diagonal is exactly 1.
        </Notice>
      </div>
    </>
  );
}
