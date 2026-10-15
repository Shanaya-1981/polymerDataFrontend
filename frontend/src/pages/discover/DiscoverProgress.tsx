import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { Spinner } from "../extract/ExtractProgress";
import { formatElapsed } from "../extract/format";
import type { DiscoverProgress as Counts } from "./api";

export interface DiscoverProgressProps {
  keywords: string;
  startedAt: number;
  progress: Counts | null;
  onNewSearch: () => void;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Shown while a search runs, with the server's counts so far. */
export function DiscoverProgress({
  keywords,
  startedAt,
  progress,
  onNewSearch,
}: DiscoverProgressProps) {
  const now = useNow(1000);

  return (
    <Card className="max-w-2xl">
      <div className="flex flex-col gap-5 p-4 sm:p-6">
        <div className="flex items-start gap-4">
          <Spinner className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="flex min-w-0 flex-col gap-1">
            <p role="status" className="font-medium text-primary">
              Finding papers… this takes about 5 minutes
            </p>
            <p className="break-words text-sm text-secondary">{keywords}</p>
            <p className="tabular text-sm text-muted">{formatElapsed(now - startedAt)} elapsed</p>
          </div>
        </div>

        {progress ? (
          <dl className="grid grid-cols-3 gap-3 text-sm">
            {(
              [
                ["Candidates", progress.candidates],
                ["Judged", progress.judged],
                ["Likely so far", progress.likely],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <dt className="text-muted">{label}</dt>
                <dd className="tabular font-medium text-primary">{value.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <p className="text-sm text-secondary">
          The search looks up the keywords, has a model judge each paper by its title and abstract,
          and follows the citations of the papers judged likely.
        </p>

        <div className="flex flex-col-reverse gap-3 border-t border-subtle pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">
            Starting over doesn&apos;t stop this search on the server, and a new one waits for it.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onNewSearch}
            className="self-start sm:self-auto"
          >
            New search
          </Button>
        </div>
      </div>
    </Card>
  );
}
