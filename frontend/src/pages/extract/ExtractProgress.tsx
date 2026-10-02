import { useEffect, useState, type SVGProps } from "react";
import { Button, Card, cn } from "@/components/ui";
import { formatElapsed } from "./format";

export interface ExtractProgressProps {
  fileName: string;
  features: readonly string[];
  /** When the extraction was started, for the elapsed-time readout. For a
   *  job reopened from the address, the server's record of when it started. */
  startedAt: number;
  onNewExtraction: () => void;
}

/** The current time, refreshed every `intervalMs` while mounted. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Shown while a job is starting and running. Only the one-line message is a
 * live region: the elapsed time sits outside it, or a screen reader would
 * read it out every second.
 */
export function ExtractProgress({
  fileName,
  features,
  startedAt,
  onNewExtraction,
}: ExtractProgressProps) {
  const now = useNow(1000);

  return (
    <Card className="max-w-2xl">
      <div className="flex flex-col gap-5 p-4 sm:p-6">
        <div className="flex items-start gap-4">
          <Spinner className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="flex min-w-0 flex-col gap-1">
            <p role="status" className="font-medium text-primary">
              Extracting data… this may take a few minutes
            </p>
            {/* Empty for a job reopened from the address until the server's
                first answer names it, a moment later. */}
            {fileName ? (
              <p className="break-words text-sm text-secondary">
                <span className="break-all text-primary">{fileName}</span> · {features.join(", ")}
              </p>
            ) : null}
            <p className="tabular text-sm text-muted">{formatElapsed(now - startedAt)} elapsed</p>
          </div>
        </div>

        <p className="text-sm text-secondary">
          A paper the server has seen before takes about 30 seconds to 2 minutes; a new one about 5
          minutes, because it's parsed first. The server runs one job at a time, so this also covers
          any wait for earlier ones.
        </p>

        <div className="flex flex-col-reverse gap-3 border-t border-subtle pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">
            Starting over doesn't stop this job on the server, and a new one waits for it to finish.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onNewExtraction}
            className="self-start sm:self-auto"
          >
            New extraction
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Spinner({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("motion-safe:animate-spin", className)}
      {...props}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity={0.25} strokeWidth={3} />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}
