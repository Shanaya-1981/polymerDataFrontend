import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { describeDiscoverError } from "./discover/describe-error";
import { DiscoverForm } from "./discover/DiscoverForm";
import { parseSeeds } from "./discover/format";
import { DiscoverProgress } from "./discover/DiscoverProgress";
import { DiscoverResults } from "./discover/DiscoverResults";
import { useDiscovery } from "./discover/useDiscovery";
import { EXTRACT_API_URL } from "./extract/config";
import { retryActionFor } from "./extract/describe-error";
import { ExtractError } from "./extract/ExtractError";
import { parseFeatureNames } from "./extract/format";

/**
 * Find papers likely to report the data you want (issue #7): keywords in,
 * a ranked list out, from the same server as Extract (`extraction/api.py`,
 * `discover.py`). Nothing outlives the page.
 */
export default function Discover() {
  const { state, start, retry, reset } = useDiscovery(EXTRACT_API_URL);

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
            canRetry={retryActionFor(state.error, state.stage) !== null}
            onRetry={retry}
            onEditInputs={reset}
            editLabel="Change the search"
          />
        ) : null}
      </div>
    </>
  );
}
