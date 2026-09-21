import { PageHeader } from "@/components/layout/PageHeader";

export default function Home() {
  return (
    <>
      <PageHeader
        title="Polymer Electrolyte Data Mining"
        description="An interactive explorer for polymer-electrolyte conductivity data — a modern rebuild of pedatamine.org."
      />
      <p className="text-secondary">Coming soon.</p>
    </>
  );
}
