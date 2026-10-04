import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Notice } from "@/components/ui";
import { downloadCsv } from "../data/csv";
import type { DiscoveredPaper } from "./api";
import { formatAuthors, papersCsv } from "./format";

/** Papers shown at first, and added by each "Show more". */
export const PAGE_SIZE = 50;

export interface DiscoverResultsProps {
  papers: readonly DiscoveredPaper[];
  keywords: string;
  features: readonly string[];
  onNewSearch: () => void;
}

/**
 * The papers found, best first: most likely to report the data, then those
 * linked from more of the other likely papers. Shown a page at a time,
 * since a search often finds thousands.
 */
export function DiscoverResults({ papers, keywords, features, onNewSearch }: DiscoverResultsProps) {
  const openOnlyId = useId();
  const [openOnly, setOpenOnly] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);

  const listed = openOnly ? papers.filter((p) => p.pdf) : papers;
  const openCount = papers.filter((p) => p.pdf).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="text-secondary">
          <span className="font-medium text-primary">{papers.length.toLocaleString()}</span>{" "}
          {papers.length === 1 ? "paper" : "papers"} likely to report the data ·{" "}
          {openCount.toLocaleString()} with an open-access PDF
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv("discovered-papers.csv", papersCsv(papers))}
            disabled={papers.length === 0}
          >
            Download CSV
          </Button>
          <Button size="sm" onClick={onNewSearch}>
            New search
          </Button>
        </div>
      </div>

      {papers.length === 0 ? (
        <Notice tone="info" title="No papers found">
          Nothing turned up that looks likely to report this data. Try broader keywords, or add a
          paper you already have.
        </Notice>
      ) : (
        <>
          <div className="flex flex-col gap-2 text-sm text-secondary sm:flex-row sm:items-center sm:justify-between">
            <label htmlFor={openOnlyId} className="flex items-center gap-2">
              <input
                id={openOnlyId}
                type="checkbox"
                checked={openOnly}
                onChange={(event) => {
                  setOpenOnly(event.target.checked);
                  setShown(PAGE_SIZE);
                }}
              />
              Only papers with an open-access PDF
            </label>
            <p>
              Got a PDF?{" "}
              <Link
                to="/extract"
                state={{ features: features.join(", ") }}
                className="font-medium text-accent underline-offset-2 hover:underline"
              >
                Extract its data
              </Link>
              {features.length > 0 ? " with these features" : ""}.
            </p>
          </div>

          <ol aria-label={`Papers found for ${keywords}`} className="flex flex-col gap-3">
            {listed.slice(0, shown).map((paper) => (
              <PaperItem key={paper.openalex} paper={paper} />
            ))}
          </ol>

          {shown < listed.length ? (
            <Button
              variant="outline"
              onClick={() => setShown(shown + PAGE_SIZE)}
              className="self-center"
            >
              Show {Math.min(PAGE_SIZE, listed.length - shown)} more (
              {(listed.length - shown).toLocaleString()} left)
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

function PaperItem({ paper }: { paper: DiscoveredPaper }) {
  const link = paper.doi ?? paper.openalex;
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-subtle bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 font-medium text-primary underline-offset-2 hover:underline"
        >
          {paper.title}
        </a>
        <Badge variant={paper.score >= 3 ? "accent" : "outline"}>
          {paper.score >= 3 ? "Very likely" : "Likely"}
        </Badge>
      </div>
      <p className="text-sm text-secondary">
        {formatAuthors(paper.authors)} · {paper.year ?? "year unknown"}
        {paper.journal ? ` · ${paper.journal}` : ""}
      </p>
      {paper.description ? <p className="text-sm text-primary">{paper.description}</p> : null}
      <p className="text-sm text-muted">Why: {paper.reason}</p>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {paper.doi ? (
          <a
            href={paper.doi}
            target="_blank"
            rel="noreferrer"
            className="break-all text-accent hover:underline"
          >
            {paper.doi.replace("https://doi.org/", "doi:")}
          </a>
        ) : null}
        {paper.pdf ? (
          <a
            href={paper.pdf}
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            Open-access PDF
          </a>
        ) : null}
      </p>
    </li>
  );
}
