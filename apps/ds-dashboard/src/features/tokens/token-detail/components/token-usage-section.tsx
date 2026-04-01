/**
 * Token Usage Section - displays component and CSS usage.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import type { TokenUsageOccurrence } from "@/types/token-usage-index";
import {
  extractLineNumber,
  compactPathLabel,
  buildOccurrenceKey,
  KIND_LABELS,
} from "../lib/token-detail-transforms";
import type { ComponentTokenUsage } from "../hooks/use-token-detail";

interface TokenUsageFilters {
  componentMode: string;
  componentQuery: string;
}

interface TokenUsageActions {
  setComponentFilter: (key: "cmode" | "cq", value: string) => void;
}

interface TokenUsageSectionProps {
  filteredComponentUsages: ComponentTokenUsage[];
  componentUsageSummary: { total: number; direct: number; viaAlias: number; occurrences: number };
  occurrencesByKind: Map<string, TokenUsageOccurrence[]>;
  filters: TokenUsageFilters;
  actions: TokenUsageActions;
}

type UsageSortField = "owner" | "file" | "line";
type UsageSortDirection = "asc" | "desc";
type UsageSortState = { field: UsageSortField; dir: UsageSortDirection };

/**
 * Renders non-component token occurrences grouped by kind (for example
 * css-alias, alias-chain, and figma-alias).
 */
function UsageGroup({
  kind,
  occurrences,
}: {
  kind: string;
  occurrences: TokenUsageOccurrence[];
}) {
  const [sort, setSort] = useState<UsageSortState>({ field: "owner", dir: "asc" });

  const sortedOccurrences = useMemo(() => {
    const rows = occurrences.slice();
    rows.sort((left, right) => {
      const lineLeft = extractLineNumber(left.detail || "") ?? 0;
      const lineRight = extractLineNumber(right.detail || "") ?? 0;
      const valueFor = (row: TokenUsageOccurrence, line: number) => {
        if (sort.field === "owner") return String(row.owner || "").toLowerCase();
        if (sort.field === "file") return String(row.source || "").toLowerCase();
        return line;
      };
      const aValue = valueFor(left, lineLeft);
      const bValue = valueFor(right, lineRight);
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sort.dir === "asc" ? comparison : comparison * -1;
    });
    return rows;
  }, [occurrences, sort]);

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {KIND_LABELS[kind] ?? kind} <span className="font-normal normal-case">({occurrences.length})</span>
      </h4>
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead label="Owner" onSort={() => setSort((c) => c.field === "owner" ? { field: "owner", dir: c.dir === "asc" ? "desc" : "asc" } : { field: "owner", dir: "asc" })} />
            <SortableTableHead label="File" onSort={() => setSort((c) => c.field === "file" ? { field: "file", dir: c.dir === "asc" ? "desc" : "asc" } : { field: "file", dir: "asc" })} />
            <SortableTableHead label="Line" onSort={() => setSort((c) => c.field === "line" ? { field: "line", dir: c.dir === "asc" ? "desc" : "asc" } : { field: "line", dir: "asc" })} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedOccurrences.map((occ, i) => {
            const key = buildOccurrenceKey(kind, occ, i);
            const file = String(occ.source || "").trim();
            const line = extractLineNumber(occ.detail || "");
            const fileLabel = file ? (line ? `${file}:${line}` : file) : "—";
            return (
              <TableRow key={key}>
                <TableCell className="font-medium">{occ.owner || "—"}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {file ? (
                    <Link to={{ pathname: "/file", search: new URLSearchParams({ path: file, ...(line ? { line: String(line) } : {}) }).toString() }} className="hover:text-primary hover:underline" title={fileLabel}>
                      {compactPathLabel(file)}
                    </Link>
                  ) : "—"}
                </TableCell>
                <TableCell className="font-mono text-xs">{line ?? "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function TokenUsageSection({
  filteredComponentUsages,
  componentUsageSummary,
  occurrencesByKind,
  filters,
  actions,
}: TokenUsageSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Component Usage</CardTitle>
        <CardDescription>
          {componentUsageSummary.total} components · {componentUsageSummary.occurrences} occurrences
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filters.componentMode} onChange={(e) => actions.setComponentFilter("cmode", e.target.value)}>
            <option value="all">All modes</option>
            <option value="direct">Direct</option>
            <option value="via_alias">Via alias</option>
          </Select>
          <Input placeholder="Filter by slot, condition, alias…" value={filters.componentQuery} onChange={(e) => actions.setComponentFilter("cq", e.target.value)} className="w-64" />
        </div>

        {filteredComponentUsages.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Occurrences</TableHead>
                <TableHead>Slots</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredComponentUsages.map((usage) => (
                <TableRow key={usage.slug}>
                  <TableCell className="font-medium">{usage.displayName}</TableCell>
                  <TableCell><Badge variant={usage.pipelineStage === "visual-proof" ? "success" : "neutral"}>{usage.pipelineStage ?? "—"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      {(usage.mode === "direct" || usage.mode === "both") && (
                        <Badge variant="success">direct ({usage.directOccurrences})</Badge>
                      )}
                      {(usage.mode === "via_alias" || usage.mode === "both") && (
                        <Badge variant="neutral">via_alias ({usage.viaAliasOccurrences})</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{usage.occurrences}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs">{usage.slots.join(", ") || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-sm text-muted-foreground">No component usages match the filters.</div>
        )}

        {occurrencesByKind.size > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Other Usages</h4>
            <div className="space-y-4">
              {Array.from(occurrencesByKind.entries()).map(([kind, occs]) => (
                <UsageGroup key={kind} kind={kind} occurrences={occs} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
