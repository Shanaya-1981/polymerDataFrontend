import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EXTRACT_API_URL } from "./extract/config";
import { describeExtractError, retryActionFor } from "./extract/describe-error";
import { ExtractError } from "./extract/ExtractError";
import { ExtractForm } from "./extract/ExtractForm";
import { ExtractProgress } from "./extract/ExtractProgress";
import { ExtractResults } from "./extract/ExtractResults";
import { parseFeatureNames } from "./extract/format";
import { useExtraction } from "./extract/useExtraction";

/**
 * Upload a paper, name features, get the data back from the extraction API
 * (`extraction/api.py`), grouped by sample. Standalone: nothing here touches
 * the dataset or the CSV import, and nothing outlives the page.
 */
export default function Extract() {
  const { state, start, retry, reset } = useExtraction(EXTRACT_API_URL);

  // Held here rather than in the form, which unmounts while a job runs, so
  // "Change file or features" after an error brings both back.
  const [file, setFile] = useState<File | null>(null);
  const [featuresText, setFeaturesText] = useState("");

  // When the phase changes, the button that caused it is usually gone, so
  // move focus to the new content instead of dropping it on the body.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const shownPhase = useRef(state.phase);
  useEffect(() => {
    if (shownPhase.current === state.phase) return;
    shownPhase.current = state.phase;
    panelRef.current?.focus();
  }, [state.phase]);

  function handleSubmit() {
    const features = parseFeatureNames(featuresText);
    if (file && features.length > 0) start({ file, features });
  }

  /** Back to the form for the next paper, which usually wants the same
   *  features — so only the file is cleared. */
  function handleNewExtraction() {
    reset();
    setFile(null);
  }

  return (
    <>
      <PageHeader
        title="Extract"
        description="Upload a paper as a PDF, name the features you want, and get its data back, grouped by sample."
      />

      <div ref={panelRef} tabIndex={-1} className="outline-none">
        {state.phase === "idle" ? (
          <ExtractForm
            file={file}
            onFileChange={setFile}
            featuresText={featuresText}
            onFeaturesTextChange={setFeaturesText}
            onSubmit={handleSubmit}
            apiUrl={EXTRACT_API_URL}
          />
        ) : null}

        {state.phase === "submitting" || state.phase === "running" ? (
          <ExtractProgress
            fileName={state.request.file.name}
            features={state.request.features}
            startedAt={state.startedAt}
            onNewExtraction={handleNewExtraction}
          />
        ) : null}

        {state.phase === "done" ? (
          <ExtractResults
            samples={state.samples}
            fileName={state.request.file.name}
            onNewExtraction={handleNewExtraction}
          />
        ) : null}

        {state.phase === "failed" ? (
          <ExtractError
            description={describeExtractError(state.error, state.stage, EXTRACT_API_URL)}
            canRetry={retryActionFor(state.error, state.stage) !== null}
            onRetry={retry}
            onEditInputs={reset}
          />
        ) : null}
      </div>
    </>
  );
}
