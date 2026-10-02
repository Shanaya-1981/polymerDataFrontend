import { useId } from "react";
import {
  Badge,
  Button,
  Notice,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@/components/ui";
import { downloadCsv } from "@/lib/csv-export";
import type { Samples } from "./api";
import {
  countPoints,
  extractionCsv,
  extractionCsvName,
  formatExtractedValue,
  isNumericColumn,
  MISSING_VALUE_TEXT,
  tableColumns,
} from "./format";

export interface ExtractResultsProps {
  samples: Samples;
  fileName: string;
  onNewExtraction: () => void;
}

/**
 * One labelled group per sample, each a table of its data points with a
 * column per feature. Every table shares the same columns, in the order the
 * features were asked for, so groups read the same way down the page.
 */
export function ExtractResults({ samples, fileName, onNewExtraction }: ExtractResultsProps) {
  const idPrefix = useId();
  const entries = Object.entries(samples);
  const columns = tableColumns(samples);
  const numericColumns = new Set(columns.filter((column) => isNumericColumn(samples, column)));
  const pointCount = countPoints(samples);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="text-secondary">
          <span className="font-medium text-primary">{entries.length}</span>{" "}
          {entries.length === 1 ? "sample" : "samples"} ·{" "}
          <span className="font-medium text-primary">{pointCount}</span>{" "}
          {pointCount === 1 ? "data point" : "data points"} from{" "}
          <span className="break-all font-medium text-primary">{fileName}</span>
        </p>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          {pointCount > 0 ? (
            <Button
              variant="outline"
              onClick={() => downloadCsv(extractionCsvName(fileName), extractionCsv(samples))}
            >
              Download CSV
            </Button>
          ) : null}
          <Button onClick={onNewExtraction}>New extraction</Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <Notice tone="info" title="No samples found">
          The paper doesn&apos;t seem to give these features, or the model couldn&apos;t find them.
          Try other feature names, or another paper.
        </Notice>
      ) : null}

      {entries.map(([name, points], index) => {
        const headingId = `${idPrefix}-sample-${index}`;
        return (
          <section key={name} aria-labelledby={headingId} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 id={headingId} className="text-base font-semibold text-primary">
                {name}
              </h2>
              <Badge>
                {points.length} {points.length === 1 ? "point" : "points"}
              </Badge>
            </div>

            {points.length === 0 ? (
              <p className="text-sm text-secondary">
                The paper gives no data points for this sample.
              </p>
            ) : (
              // Sized to its columns, not the page: a few numeric columns
              // stretched across 1,000px strand each number far from its
              // header. Still scrolls inside its own box when there are many.
              <Table className="w-fit max-w-full">
                <caption className="sr-only">Data points for {name}</caption>
                <TableHeader>
                  <TableRow>
                    {columns.map((column) => (
                      // Feature names carry units ("S/cm"), so no uppercasing.
                      <TableHead
                        key={column}
                        className={cn(
                          "min-w-28 normal-case tracking-normal",
                          numericColumns.has(column) && "text-right",
                        )}
                      >
                        {column}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {points.map((point, row) => (
                    <TableRow key={row}>
                      {columns.map((column) => {
                        const value = point[column] ?? null;
                        return (
                          <TableCell
                            key={column}
                            className={cn(numericColumns.has(column) && "tabular text-right")}
                          >
                            {value === null ? (
                              <>
                                <span aria-hidden="true" className="text-muted">
                                  {MISSING_VALUE_TEXT}
                                </span>
                                <span className="sr-only">not given</span>
                              </>
                            ) : (
                              formatExtractedValue(value)
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        );
      })}
    </div>
  );
}
