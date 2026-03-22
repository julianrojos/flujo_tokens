/**
 * Token Usage Section - displays component and CSS usage.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { fetchFileSnippet, type FileSnippetPayload } from "@/lib/api";
import type { TokenEntry } from "@/types/token-registry";
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
  token: TokenEntry;
  filteredComponentUsages: ComponentTokenUsage[];
  componentUsageSummary: { total: number; direct: number; viaAlias: number; occurrences: number };
  occurrencesByKind: Map<string, TokenUsageOccurrence[]>;
  filters: TokenUsageFilters;
  actions: TokenUsageActions;
}

function UsageGroup({
  kind,
  occurrences,
  token,
}: {
  kind: string;
  occurrences: TokenUsageOccurrence[];
  token: TokenEntry;
}) {
  const [snippets, setSnippets] = useState<Record<string, { open: boolean; loading?: boolean; payload?: FileSnippetPayload; error?: string }>>({});
  const [sort, setSort] = useState<{ field: "owner" | "file" | "line"; dir: "asc" | "desc" }>({ field: "owner", dir: "asc" });
  const autoExpanded = useRef(false);

  const queryHints = useMemo(() => {
    const hints = [token.slashPath, token.path].map((v) => String(v || "").trim());
    return hints.filter(Boolean).filter((v, i, all) => all.indexOf(v) === i);
  }, [token.path, token.slashPath]);

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

  const openSnippet = useCallback(async (key: string, occ: TokenUsageOccurrence) => {
    let shouldFetch = true;
    setSnippets((current) => {
      const prev = current[key];
      if (prev?.payload || prev?.loading) {
        shouldFetch = false;
        return current;
      }
      return { ...current, [key]: { open: true, loading: true } };
    });
    if (!shouldFetch) return;

    const file = String(occ.source || "").trim();
    const line = extractLineNumber(occ.detail || "");
    try {
      let payload: FileSnippetPayload | null = null;
      if (file && line) {
        payload = await fetchFileSnippet({ file, line, before: 2, after: 3 });
      } else if (file) {
        for (const q of queryHints) {
          try {
            payload = await fetchFileSnippet({ file, q, before: 2, after: 3 });
            break;
          } catch { /* try next */ }
        }
      }
      if (!payload) throw new Error("Snippet unavailable.");

      setSnippets((current) => ({ ...current, [key]: { open: true, payload } }));
    } catch (cause) {
      setSnippets((current) => ({
        ...current,
        [key]: { open: true, error: cause instanceof Error ? cause.message : String(cause) },
      }));
    }
  }, [queryHints]);

  useEffect(() => {
    if (autoExpanded.current || sortedOccurrences.length === 0) return;
    autoExpanded.current = true;
    const first = sortedOccurrences[0];
    const firstKey = buildOccurrenceKey(kind, first, 0);
    void openSnippet(firstKey, first);
  }, [kind, openSnippet, sortedOccurrences]);

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
            <TableHead className="w-28">Snippet</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedOccurrences.map((occ, i) => {
            const key = buildOccurrenceKey(kind, occ, i);
            const state = snippets[key];
            const file = String(occ.source || "").trim();
            const line = extractLineNumber(occ.detail || "");
            const fileLabel = file ? (line ? `${file}:${line}` : file) : "—";
            return (
              <Fragment key={key}>
                <TableRow>
                  <TableCell className="font-medium">{occ.owner || "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {file ? (
                      <Link to={{ pathname: "/file", search: new URLSearchParams({ path: file, ...(line ? { line: String(line) } : {}) }).toString() }} className="hover:text-primary hover:underline" title={fileLabel}>
                        {compactPathLabel(file)}
                      </Link>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{line ?? "—"}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => state?.open ? setSnippets((c) => ({ ...c, [key]: { ...c[key], open: false } })) : void openSnippet(key, occ)}>
                      {state?.open ? "Hide" : "Snippet"}
                    </Button>
                  </TableCell>
                </TableRow>
                {state?.open && (
                  <TableRow>
                    <TableCell colSpan={4} className="bg-muted/30">
                      {state.loading ? <div className="text-sm text-muted-foreground">Loading…</div> : state.error ? <div className="text-sm text-status-error">{state.error}</div> : state.payload ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="neutral">L{state.payload.line} ({state.payload.matchedBy})</Badge>
                            <Badge variant="neutral">{KIND_LABELS[kind] ?? kind}</Badge>
                            <span>lines {state.payload.startLine}–{state.payload.endLine}</span>
                            {occ.detail && <span>detail: {occ.detail}</span>}
                            <Link to={{ pathname: "/file", search: new URLSearchParams({ path: state.payload.file, line: String(state.payload.line) }).toString() }} className="hover:text-primary hover:underline">Open file</Link>
                          </div>
                          <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-background/60 p-3 text-xs"><code className="font-mono">{state.payload.snippet}</code></pre>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function TokenUsageSection({
  token,
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
                  <TableCell><Badge variant={usage.pipelineStage === "render" || usage.pipelineStage === "visual-proof" ? "success" : "neutral"}>{usage.pipelineStage ?? "—"}</Badge></TableCell>
                  <TableCell><Badge variant={usage.mode === "direct" ? "success" : "neutral"}>{usage.mode}</Badge></TableCell>
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
                <UsageGroup key={kind} kind={kind} occurrences={occs} token={token} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
