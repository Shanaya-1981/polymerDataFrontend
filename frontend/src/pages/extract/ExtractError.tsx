import { Button, Notice } from "@/components/ui";
import type { ErrorDescription } from "./describe-error";

export interface ExtractErrorProps {
  description: ErrorDescription;
  /** False when retrying can't help — the server refused the input itself. */
  canRetry: boolean;
  onRetry: () => void;
  /** Back to the form with the same file and features, to change them. */
  onEditInputs: () => void;
  /** The back-to-the-form button's text; Discover has no file to change. */
  editLabel?: string;
}

export function ExtractError({
  description,
  canRetry,
  onRetry,
  onEditInputs,
  editLabel = "Change file or features",
}: ExtractErrorProps) {
  return (
    <Notice tone="danger" title={description.title} className="max-w-2xl">
      <div className="flex flex-col gap-3">
        <p>{description.message}</p>
        {description.detail ? (
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-subtle bg-surface px-3 py-2 font-mono text-xs text-primary">
            {description.detail}
          </pre>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {canRetry ? (
            <Button size="sm" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
          <Button size="sm" variant={canRetry ? "outline" : "secondary"} onClick={onEditInputs}>
            {editLabel}
          </Button>
        </div>
      </div>
    </Notice>
  );
}
