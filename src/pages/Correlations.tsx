import { PageHeader } from "@/components/layout/PageHeader";
import { CorrelationExplorer } from "./correlations/CorrelationExplorer";

export default function Correlations() {
  return (
    <>
      <PageHeader
        title="Correlations"
        description="What relates to what across the dataset's 36 machine-learning features, and — for any of the 22 measured temperatures — what correlates with conductivity itself."
      />
      <CorrelationExplorer />
    </>
  );
}
