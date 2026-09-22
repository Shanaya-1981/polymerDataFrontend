import { PageHeader } from "@/components/layout/PageHeader";
import { Notice } from "@/components/ui";

/**
 * Faithful port of the original Dash app's About page content
 * (`data/reference/page_about.json`) — this is other people's credit and
 * must stay intact. The only intentional omission is the original's ~64 KB
 * base64-embedded UCSB/MRSEC logo image; the textual credit it accompanied
 * (the funding line below) is kept in full. See the wave hand-off report
 * for a note on re-adding a proper logo asset later.
 *
 * The contact email is kept obfuscated exactly as the original wrote it
 * (`seshadri[at]mrl.ucsb.edu`, plain text, never a `mailto:` link) — that
 * was a deliberate anti-spam choice, not an oversight.
 */
export default function About() {
  return (
    <>
      <PageHeader
        title="About"
        description="Project background, data provenance, and licensing for Polymer Electrolyte Data Mining."
      />

      <div className="flex max-w-3xl flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-primary">
            About the polymer electrolyte database
          </h2>
          <p className="text-secondary">
            The polymer electrolyte database provides an opportunity to visualize possible
            correlations between some of the many factors that are hypothesized to impact
            electrolyte conductivity. The database was curated manually from previously published
            literature data.
          </p>
          <p className="text-secondary">
            Data and code can be accessed at{" "}
            <a
              href="https://github.com/nschauser/PolymerElectrolyte"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-4 hover:text-accent-hover"
            >
              github.com/nschauser/PolymerElectrolyte
            </a>{" "}
            (MIT licensed).
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-primary">Funding</h2>
          <p className="text-secondary">
            This work was supported by the Materials Research Science and Engineering Program
            (MRSEC) of the National Science Foundation (NSF) under DMR 1720256 (IRG-2).
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-primary">Contributors</h2>
          <ul className="list-disc space-y-1 pl-5 text-secondary">
            <li>Nicole Schauser</li>
            <li>Gabrielle Kliegle</li>
            <li>Piper Cooke</li>
            <li>Rachel Segalman</li>
            <li>Ram Seshadri</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-primary">Contact</h2>
          <p className="text-secondary">
            Ram Seshadri
            <br />
            Email: seshadri[at]mrl.ucsb.edu
          </p>
        </section>

        <Notice tone="info" title="About this rebuild">
          <p>
            This site is an independent, modernized rebuild of the original{" "}
            <a
              href="https://pedatamine.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-4 hover:text-accent-hover"
            >
              pedatamine.org
            </a>{" "}
            Dash application. The database, the literature curation behind it, and the original
            application are the work of the contributors named above; this site only rebuilds the
            interface, using their openly published data. It is not affiliated with or endorsed by
            them. The dataset and the original code remain licensed under the MIT License — see the
            GitHub repository above for the license text and the original data.
          </p>
        </Notice>
      </div>
    </>
  );
}
