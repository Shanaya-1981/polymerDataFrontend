import { useId, type FormEvent } from "react";
import { Button, Card, Label } from "@/components/ui";

export interface DiscoverFormProps {
  keywords: string;
  onKeywordsChange: (text: string) => void;
  seedsText: string;
  onSeedsTextChange: (text: string) => void;
  featuresText: string;
  onFeaturesTextChange: (text: string) => void;
  onSubmit: () => void;
  apiUrl: string;
}

const INPUT_CLASS =
  "w-full rounded-md border border-default bg-surface px-3 text-sm text-primary placeholder:text-muted";

/** Keywords, and optionally papers the user has and the data they want. Fully controlled. */
export function DiscoverForm({
  keywords,
  onKeywordsChange,
  seedsText,
  onSeedsTextChange,
  featuresText,
  onFeaturesTextChange,
  onSubmit,
  apiUrl,
}: DiscoverFormProps) {
  const keywordsId = useId();
  const seedsId = useId();
  const seedsHelpId = useId();
  const featuresId = useId();
  const featuresHelpId = useId();

  const canSubmit = keywords.trim() !== "";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) onSubmit();
  }

  return (
    <Card className="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor={keywordsId}>Keywords</Label>
          <input
            id={keywordsId}
            type="text"
            value={keywords}
            onChange={(event) => onKeywordsChange(event.target.value)}
            placeholder="solid polymer electrolyte, PEO, LiTFSI"
            autoComplete="off"
            className={`h-9 ${INPUT_CLASS}`}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={seedsId}>
            Papers you already have <span className="font-normal text-muted">(optional)</span>
          </Label>
          <textarea
            id={seedsId}
            value={seedsText}
            onChange={(event) => onSeedsTextChange(event.target.value)}
            placeholder={
              "10.1021/ma00103a034\nPhysical properties of solid polymer electrolyte PEO(LiTFSI) complexes"
            }
            aria-describedby={seedsHelpId}
            rows={3}
            spellCheck={false}
            className={`py-2 ${INPUT_CLASS}`}
          />
          <p id={seedsHelpId} className="text-xs text-muted">
            One per line, as a DOI or a title. The search follows what they cite and what cites
            them; they aren&apos;t listed in the results.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={featuresId}>
            Data you want <span className="font-normal text-muted">(optional)</span>
          </Label>
          <input
            id={featuresId}
            type="text"
            value={featuresText}
            onChange={(event) => onFeaturesTextChange(event.target.value)}
            placeholder="Tg, ionic conductivity, transference number"
            aria-describedby={featuresHelpId}
            autoComplete="off"
            spellCheck={false}
            className={`h-9 ${INPUT_CLASS}`}
          />
          <p id={featuresHelpId} className="text-xs text-muted">
            Separate names with commas. Papers are judged on whether they likely report these; they
            also carry over to the Extract page.
          </p>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-subtle pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">
            A search takes about 5 minutes on the server at{" "}
            <span className="break-all">{apiUrl}</span>.
          </p>
          <Button type="submit" disabled={!canSubmit} className="self-start sm:self-auto">
            Find papers
          </Button>
        </div>
      </form>
    </Card>
  );
}
