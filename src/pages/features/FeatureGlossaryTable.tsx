import { useId, useMemo, useState } from "react";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { FEATURE_GLOSSARY } from "./feature-glossary";
import { matchesQuery } from "./matches-query";

/**
 * The 36-row feature glossary with a search/filter box — the original was a
 * static wall of 36 rows with no way to jump to one feature.
 *
 * Small-screen treatment: below `sm`, the header row hides and each row
 * becomes a stacked card (flexbox column) instead of a fixed 3-column grid,
 * so long descriptions wrap naturally at full width — never a horizontal
 * scrollbar. The feature number moves into a small leading badge so it
 * reads naturally as "#7" above the name instead of an orphaned column.
 */
export function FeatureGlossaryTable() {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const statusId = useId();

  const filtered = useMemo(
    () => FEATURE_GLOSSARY.filter((entry) => matchesQuery(entry, query)),
    [query],
  );

  const trimmedQuery = query.trim();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 sm:max-w-sm">
        <label htmlFor={searchId} className="text-sm font-medium text-secondary">
          Search features
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, description, or column…"
          aria-describedby={statusId}
          className="h-9 w-full rounded-md border border-default bg-surface px-3 text-sm text-primary placeholder:text-muted"
        />
      </div>

      <p id={statusId} role="status" aria-live="polite" className="text-sm text-muted">
        Showing {filtered.length} of {FEATURE_GLOSSARY.length} features
        {trimmedQuery ? ` matching “${trimmedQuery}”` : ""}.
      </p>

      {filtered.length > 0 ? (
        <Table>
          <TableHeader className="hidden sm:table-header-group">
            <TableRow>
              <TableHead className="w-16">No.</TableHead>
              <TableHead>Feature</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((entry) => (
              <TableRow
                key={entry.number}
                className="flex flex-col gap-1.5 px-4 py-3 sm:table-row sm:gap-0 sm:px-0 sm:py-0"
              >
                <TableCell className="align-top sm:w-16 sm:text-secondary sm:tabular">
                  <Badge variant="outline" className="sm:hidden">
                    #{entry.number}
                  </Badge>
                  <span className="hidden sm:inline">{entry.number}</span>
                </TableCell>
                <TableCell className="align-top">
                  <div className="font-medium text-primary">{entry.feature}</div>
                  <div className="font-mono text-xs text-muted">{entry.mlColumn}</div>
                </TableCell>
                <TableCell className="align-top text-secondary">{entry.description}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="rounded-lg border border-subtle p-6 text-center text-sm text-muted">
          No features match “{trimmedQuery}”.{" "}
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-accent underline underline-offset-4 hover:text-accent-hover"
          >
            Clear search
          </button>
        </p>
      )}
    </div>
  );
}
