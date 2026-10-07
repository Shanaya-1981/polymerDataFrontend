import { useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { EXTRACT_API_URL } from "./extract/config";
import { describeExtractError } from "./extract/describe-error";
import { ExtractError } from "./extract/ExtractError";
import { ExtractForm } from "./extract/ExtractForm";
import { ExtractProgress } from "./extract/ExtractProgress";
import { ExtractResults } from "./extract/ExtractResults";
import { parseFeatureNames } from "./extract/format";
import { jobOf, retryActionOf, useExtraction } from "./extract/useExtraction";

/**
 * Upload a paper, name features, get the data back from the extraction API
 * (`extraction/api.py`), grouped by sample. Standalone: nothing here touches
 * the dataset or the CSV import.
 *
 * Once a job starts, its id goes in the address (`/extract?job=<id>`), so a
 * refresh, a bookmark, or the menu's link back here (which remembers the
 * address) shows that job again. The server keeps finished jobs on disk, so
 * the address keeps working after it restarts.
 */
export default function Extract() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Read once: after that the address follows the page, never the reverse.
  const [openedJob] = useState(() => searchParams.get("job"));
  const { state, start, retry, reset } = useExtraction(EXTRACT_API_URL, openedJob);

  const job = jobOf(state);
  const addressJob = searchParams.get("job");
  useEffect(() => {
    if (job === addressJob) return;
    // `replace`, so starting a job doesn't add a step for the back button.
    setSearchParams(job ? { job } : {}, { replace: true });
  }, [job, addressJob, setSearchParams]);

  // Held here rather than in the form, which unmounts while a job runs, so
  // "Change file or features" after an error brings both back.
  const [file, setFile] = useState<File | null>(null);
  // Discover links here with the features it searched for already filled in.
  const location = useLocation();
  const [featuresText, setFeaturesText] = useState(() => {
    const handed = (location.state as { features?: unknown } | null)?.features;
    return typeof handed === "string" ? handed : "";
  });

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

  /** Back to the form after an error. A job reopened from the address brings
   *  its features from the server; its file the browser can't give back. */
  function handleEditInputs() {
    if (state.phase === "failed" && featuresText.trim() === "") {
      setFeaturesText(state.request.features.join(", "));
    }
    reset();
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
            fileName={state.request.fileName}
            features={state.request.features}
            startedAt={state.startedAt}
            progress={state.phase === "running" ? state.progress : undefined}
            onNewExtraction={handleNewExtraction}
          />
        ) : null}

        {state.phase === "done" ? (
          <ExtractResults
            samples={state.samples}
            fileName={state.request.fileName}
            onNewExtraction={handleNewExtraction}
          />
        ) : null}

        {state.phase === "failed" ? (
          <ExtractError
            description={describeExtractError(state.error, state.stage, EXTRACT_API_URL)}
            canRetry={retryActionOf(state) !== null}
            onRetry={retry}
            onEditInputs={handleEditInputs}
          />
        ) : null}
      </div>
    </>
  );
}
