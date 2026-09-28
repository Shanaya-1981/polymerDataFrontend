import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { FeatureGlossaryTable } from "./features/FeatureGlossaryTable";

export default function Features() {
  return (
    <>
      <PageHeader
        title="Features"
        description="A glossary of the 36 machine-learning features used to model conductivity."
      />

      <div className="flex flex-col gap-6">
        <div className="max-w-3xl space-y-2 text-secondary">
          <p>
            These 36 features are the ones identified as important by Random Forest recursive
            feature elimination. Features 1–6 are experimental and processing variables; features
            7–36 are molecular descriptors computed with the Mordred library.
          </p>
          <p className="text-sm">
            Moriwaki, H.; Tian, Y.-S.; Kawashita, N.; Takagi, T.{" "}
            <em>Mordred: a Molecular Descriptor Calculator.</em> J. Cheminform. 2018, 10, 4.{" "}
            <a
              href="https://doi.org/10.1186/s13321-018-0258-y"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-4 hover:text-accent-hover"
            >
              doi.org/10.1186/s13321-018-0258-y
            </a>
          </p>
          <p className="text-sm">
            See how these features relate to each other on the{" "}
            <Link
              to="/correlations"
              className="text-accent underline underline-offset-4 hover:text-accent-hover"
            >
              correlations
            </Link>{" "}
            page.
          </p>
        </div>

        <FeatureGlossaryTable />
      </div>
    </>
  );
}
