import { useCallback, useEffect, useState } from "react";
import {
  ExtractApiError,
  fetchJobStatus,
  isAbortError,
  startExtraction,
  type JobInfo,
  type JobProgress,
  type Samples,
} from "./api";
import { EXTRACT_API_URL } from "./config";
import { retryActionFor, type ExtractStage } from "./describe-error";

/** How long to wait between status checks. */
export const POLL_INTERVAL_MS = 3000;

/**
 * Status checks in a row that may fail — no answer, an unreadable one, or a
 * server error — before the page stops and says so. A dev server restarting
 * or a laptop waking up shouldn't end a five-minute extraction. A job the
 * server has forgotten (404) or reports as failed ends it at once.
 */
export const MAX_FAILED_POLLS = 3;

export interface ExtractionRequest {
  readonly file: File;
  readonly features: readonly string[];
}

/** What the page shows about the extraction it's on. `file` is there only
 *  when this page sent the PDF: a job reopened from the page's address
 *  (`?job=<id>`) has just the name the server gives, so it can be checked
 *  on but not sent again. */
export interface ExtractionDetails {
  readonly file?: File;
  readonly fileName: string;
  readonly features: readonly string[];
}

export type ExtractionState =
  | { readonly phase: "idle" }
  | {
      readonly phase: "submitting";
      readonly request: ExtractionDetails;
      readonly startedAt: number;
    }
  | {
      readonly phase: "running";
      readonly request: ExtractionDetails;
      readonly startedAt: number;
      readonly job: string;
      /** Status checks so far. Each new value schedules the next check. */
      readonly polls: number;
      /** Failed checks in a row; any answer that reads resets it. */
      readonly failedPolls: number;
      /** Where the job is, from the latest answer that said: absent until
       *  the first one, or from a server that doesn't report it. */
      readonly progress?: JobProgress;
    }
  | {
      readonly phase: "done";
      readonly request: ExtractionDetails;
      readonly job: string;
      readonly samples: Samples;
    }
  | {
      readonly phase: "failed";
      readonly request: ExtractionDetails;
      readonly startedAt: number;
      readonly error: ExtractApiError;
      readonly stage: ExtractStage;
      /** The job, when one was started — what a "resume" retry checks on. */
      readonly job?: string;
    };

const IDLE: ExtractionState = { phase: "idle" };

/** The job the page is showing, if any: what its address names. */
export function jobOf(state: ExtractionState): string | null {
  return state.phase === "running" || state.phase === "done" || state.phase === "failed"
    ? (state.job ?? null)
    : null;
}

/** Fill in what the server says about the job: for a job reopened from the
 *  address, this is the only place its file name and features come from. */
function withServerInfo(request: ExtractionDetails, info: JobInfo): ExtractionDetails {
  return {
    ...request,
    fileName: info.fileName ?? request.fileName,
    features: info.features ?? request.features,
  };
}

/** What "Try again" would do now, or `null` when it can't help. Starting
 *  over needs the PDF itself, which a reopened job doesn't have. */
export function retryActionOf(state: ExtractionState) {
  if (state.phase !== "failed") return null;
  const action = retryActionFor(state.error, state.stage);
  if (action === "resume" && !state.job) return "resubmit";
  if (action === "resubmit" && !state.request.file) return null;
  return action;
}

function asApiError(error: unknown): ExtractApiError {
  return error instanceof ExtractApiError
    ? error
    : new ExtractApiError("bad-response", error instanceof Error ? error.message : String(error));
}

/**
 * Runs one extraction at a time: start a job, check on it every
 * `POLL_INTERVAL_MS`, and end in `done` or `failed`.
 *
 * The async work lives in effects keyed on the state, so leaving a phase —
 * `reset()` for "New extraction", or the page unmounting — cancels that
 * phase's timer and in-flight request through the effect's cleanup, and an
 * answer that arrives late can't overwrite what came after it. Checks never
 * overlap: the next wait starts only once the last answer is in.
 *
 * `job` reopens a job the page was showing before, from its address: the
 * first check on it goes out at once, and its file name, features and start
 * time come from the server. The server has no way to cancel a job, so one
 * left running still finishes there, and its address shows the result.
 */
export function useExtraction(apiUrl: string = EXTRACT_API_URL, job: string | null = null) {
  const [state, setState] = useState<ExtractionState>(() =>
    job
      ? {
          phase: "running",
          request: { fileName: "", features: [] },
          startedAt: Date.now(),
          job,
          polls: 0,
          failedPolls: 0,
        }
      : IDLE,
  );

  useEffect(() => {
    if (state.phase !== "submitting") return;
    const { request, startedAt } = state;
    const file = request.file;
    if (!file) return; // never: only `start` and a retry with the file in hand get here
    const controller = new AbortController();
    startExtraction(apiUrl, file, request.features, controller.signal).then(
      (job) => {
        if (controller.signal.aborted) return;
        setState({ phase: "running", request, startedAt, job, polls: 0, failedPolls: 0 });
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setState({
          phase: "failed",
          request,
          startedAt,
          error: asApiError(error),
          stage: "submit",
        });
      },
    );
    return () => controller.abort();
  }, [state, apiUrl]);

  useEffect(() => {
    if (state.phase !== "running") return;
    const current = state;
    const controller = new AbortController();
    const fail = (error: ExtractApiError) =>
      setState({
        phase: "failed",
        request: current.request,
        startedAt: current.startedAt,
        job: current.job,
        stage: "poll",
        error,
      });

    // A job reopened from the address is checked at once, so the page
    // doesn't sit on an empty progress card before showing its results.
    const reopened = current.polls === 0 && !current.request.file;
    const timer = window.setTimeout(
      () => {
        fetchJobStatus(apiUrl, current.job, controller.signal).then(
          (status) => {
            if (controller.signal.aborted) return;
            const request = withServerInfo(current.request, status);
            const startedAt = status.startedAt ?? current.startedAt;
            if (status.status === "running") {
              setState({
                ...current,
                request,
                startedAt,
                polls: current.polls + 1,
                failedPolls: 0,
                progress: status.progress,
              });
            } else if (status.status === "done") {
              setState({ phase: "done", request, job: current.job, samples: status.samples });
            } else {
              setState({
                phase: "failed",
                request,
                startedAt,
                job: current.job,
                stage: "poll",
                error: new ExtractApiError("failed", status.error),
              });
            }
          },
          (error: unknown) => {
            if (controller.signal.aborted || isAbortError(error)) return;
            const apiError = asApiError(error);
            const failedPolls = current.failedPolls + 1;
            // Only the errors a later check could get past are retried quietly.
            if (retryActionFor(apiError, "poll") === "resume" && failedPolls < MAX_FAILED_POLLS) {
              setState({ ...current, polls: current.polls + 1, failedPolls });
            } else {
              fail(apiError);
            }
          },
        );
      },
      reopened ? 0 : POLL_INTERVAL_MS,
    );

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [state, apiUrl]);

  const start = useCallback(({ file, features }: ExtractionRequest) => {
    setState({
      phase: "submitting",
      request: { file, fileName: file.name, features },
      startedAt: Date.now(),
    });
  }, []);

  /** "Try again": check on the same job, or start it over — whichever
   *  `retryActionOf` says. */
  const retry = useCallback(() => {
    setState((current): ExtractionState => {
      if (current.phase !== "failed") return current;
      const action = retryActionOf(current);
      if (action === "resume" && current.job) {
        return {
          phase: "running",
          request: current.request,
          startedAt: current.startedAt,
          job: current.job,
          polls: 0,
          failedPolls: 0,
        };
      }
      if (action === null) return current;
      return { phase: "submitting", request: current.request, startedAt: Date.now() };
    });
  }, []);

  const reset = useCallback(() => setState(IDLE), []);

  return { state, start, retry, reset };
}
