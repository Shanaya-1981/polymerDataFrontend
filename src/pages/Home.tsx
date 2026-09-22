import { PageHeader } from "@/components/layout/PageHeader";
import { EntryPoints } from "./home/EntryPoints";
import { StatsRow } from "./home/StatsRow";

export default function Home() {
  return (
    <>
      <PageHeader
        title="Polymer Electrolyte Data Mining"
        description="A literature-curated dataset of polymer electrolyte formulations, built to visualize what actually correlates with ionic conductivity."
      />

      <div className="flex flex-col gap-10">
        <section aria-label="Dataset statistics">
          <StatsRow />
        </section>

        <section aria-labelledby="landing-explore-heading">
          <h2 id="landing-explore-heading" className="mb-4 text-lg font-semibold text-primary">
            Explore the data
          </h2>
          <EntryPoints />
        </section>
      </div>
    </>
  );
}
