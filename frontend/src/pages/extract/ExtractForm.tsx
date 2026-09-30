import { useId, useRef, type ChangeEvent, type FormEvent } from "react";
import { Badge, Button, Card, Label, cn } from "@/components/ui";
import { formatFileSize, parseFeatureNames } from "./format";

export interface ExtractFormProps {
  file: File | null;
  onFileChange: (file: File) => void;
  featuresText: string;
  onFeaturesTextChange: (text: string) => void;
  onSubmit: () => void;
  /** Named under the form, so it's clear where the paper is sent. */
  apiUrl: string;
}

/**
 * The PDF and feature names. Fully controlled — the page owns both values,
 * so they are still there when "Change file or features" brings the form
 * back after an error. The file input itself stays hidden behind a button
 * (as in `ImportButtons`) so the chosen file's name comes from that state
 * rather than from a native input that can't be refilled.
 */
export function ExtractForm({
  file,
  onFileChange,
  featuresText,
  onFeaturesTextChange,
  onSubmit,
  apiUrl,
}: ExtractFormProps) {
  const fileLabelId = useId();
  const fileNameId = useId();
  const featuresId = useId();
  const featuresHelpId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const features = parseFeatureNames(featuresText);
  const canSubmit = file !== null && features.length > 0;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    // Reset so choosing the same file again still fires a change.
    event.target.value = "";
    if (picked) onFileChange(picked);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) onSubmit();
  }

  return (
    <Card className="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6 p-4 sm:p-6">
        <div role="group" aria-labelledby={fileLabelId} className="flex flex-col gap-2">
          <span id={fileLabelId} className="text-sm font-medium leading-none text-secondary">
            Paper
          </span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              aria-describedby={fileNameId}
            >
              {file ? "Choose another PDF" : "Choose PDF"}
            </Button>
            <span
              id={fileNameId}
              className={cn("min-w-0 break-all text-sm", file ? "text-primary" : "text-muted")}
            >
              {file ? `${file.name} (${formatFileSize(file.size)})` : "No file chosen"}
            </span>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            aria-label="PDF file"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={featuresId}>Features</Label>
          <input
            id={featuresId}
            type="text"
            value={featuresText}
            onChange={(event) => onFeaturesTextChange(event.target.value)}
            placeholder="Temperature (°C), Conductivity (S/cm)"
            aria-describedby={featuresHelpId}
            autoComplete="off"
            spellCheck={false}
            className="h-9 w-full rounded-md border border-default bg-surface px-3 text-sm text-primary placeholder:text-muted"
          />
          <p id={featuresHelpId} className="text-xs text-muted">
            Separate names with commas. A unit in a name, like (S/cm), gets the values in that unit.
          </p>
          {features.length > 0 ? (
            <ul aria-label="Features to extract" className="flex flex-wrap gap-1.5">
              {features.map((feature, index) => (
                <li key={index}>
                  <Badge variant="outline">{feature}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-subtle pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">
            The PDF is sent to the extraction server at <span className="break-all">{apiUrl}</span>.
          </p>
          <Button type="submit" disabled={!canSubmit} className="self-start sm:self-auto">
            Extract data
          </Button>
        </div>
      </form>
    </Card>
  );
}
