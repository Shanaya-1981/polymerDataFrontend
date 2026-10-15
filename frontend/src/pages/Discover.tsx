import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { describeDiscoverError } from "./discover/describe-error";
import { DiscoverForm } from "./discover/DiscoverForm";
import { parseSeeds } from "./discover/format";
import { DiscoverProgress } from "./discover/DiscoverProgress";
import { DiscoverResults } from "./discover/DiscoverResults";
import { jobOf, retryActionOf, useDiscovery } from "./discover/useDiscovery";
import { EXTRACT_API_URL } from "./extract/config";
import { ExtractError } from "./extract/ExtractError";
import { parseFeatureNames } from "./extract/format";

/**
 * Find papers likely to report the data you want (issue #7): keywords in,
 * a ranked list out, from the same server as Extract (`extraction/api.py`,
 * `discover.py`).
 *
 * Once a search starts, its id goes in the address (`/discover?job=<id>`),
 * as on Extract (issue #18), so a refresh, a bookmark, or the menu's link
 * back here shows that search again. The server keeps finished searches on
 * disk, so the address keeps working after it restarts.
 */
export default function Discover() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Read once: after that the address follows the page, never the reverse.
  const [openedJob] = useState(() => searchParams.get("job"));
  const { state, start, retry, reset } = useDiscovery(EXTRACT_API_URL, openedJob);

  const job = jobOf(state);
  const addressJob = searchParams.get("job");
  useEffect(() => {
    if (job === addressJob) return;
    // `replace`, so starting a search doesn't add a step for the back button.
    setSearchParams(job ? { job } : {}, { replace: true });
  }, [job, addressJob, setSearchParams]);

  const [keywords, setKeywords] = useState("");
  const [seedsText, setSeedsText] = useState("");
  const [featuresText, setFeaturesText] = useState("");

  const panelRef = useRef<HTMLDivElement | null>(null);
  const shownPhase = useRef(state.phase);
  useEffect(() => {
    if (shownPhase.current === state.phase) return;
    shownPhase.current = state.phase;
    panelRef.current?.focus();
  }, [state.phase]);

  function handleSubmit() {
    const trimmed = keywords.trim();
    if (!trimmed) return;
    start({
      keywords: trimmed,
      seeds: parseSeeds(seedsText),
      features: parseFeatureNames(featuresText),
    });
  }

  return (
    <>
      <PageHeader
        title="Discover"
        description="Describe the papers you're after and get a list of ones likely to report that data, to extract it from."
      />

      <div ref={panelRef} tabIndex={-1} className="outline-none">
        {state.phase === "idle" ? (
          <DiscoverForm
            keywords={keywords}
            onKeywordsChange={setKeywords}
            seedsText={seedsText}
            onSeedsTextChange={setSeedsText}
            featuresText={featuresText}
            onFeaturesTextChange={setFeaturesText}
            onSubmit={handleSubmit}
            apiUrl={EXTRACT_API_URL}
          />
        ) : null}

        {state.phase === "submitting" || state.phase === "running" ? (
          <DiscoverProgress
            keywords={state.request.keywords}
            startedAt={state.startedAt}
            progress={state.phase === "running" ? state.progress : null}
            onNewSearch={reset}
          />
        ) : null}

        {state.phase === "done" ? (
          <DiscoverResults
            papers={state.papers}
            keywords={state.request.keywords}
            features={state.request.features}
            onNewSearch={reset}
          />
        ) : null}

        {state.phase === "failed" ? (
          <ExtractError
            description={describeDiscoverError(state.error, state.stage, EXTRACT_API_URL)}
            canRetry={retryActionOf(state) !== null}
            onRetry={retry}
            onEditInputs={reset}
            editLabel="Change the search"
          />
        ) : null}
      </div>
    </>
  );
}
