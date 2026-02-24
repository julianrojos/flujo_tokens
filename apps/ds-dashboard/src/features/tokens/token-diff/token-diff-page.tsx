import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown, RefreshCcw, X } from "lucide-react";

import { fetchTokenDiff, fetchTokenGraph, fetchTokenUsageIndex } from "@/lib/api";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";
import type { TokenDiffReport } from "@/types/token-diff";
import type { TokenGraphViz } from "@/types/token-graph";
import type { TokenUsageEntry, TokenUsageIndex, TokenUsageOccurrence } from "@/types/token-usage-index";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ApiErrorMessage } from "@/components/api-error-message";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ChangeKind = "added" | "removed" | "modified";

type SelectedChange = {
  kind: ChangeKind;
  key: string;
  identity: string;
  changeClass: "breaking" | "non-breaking";
  tokenPath: string;
  tokenCssVar?: string;
};

function parseTokenPathFromIdentity(identity: string) {
  const raw = String(identity || "").trim();
  const match = raw.match(/^path:(.+)$/);
  return match ? match[1] : null;
}

function tokenNodeIdForPath(tokenPath: string) {
  return `path:${tokenPath}`;
}

function formatImpactCount(value: number | null) {
  if (value === null) return "—";
  return String(value);
}

function buildUnresolvedImpact(unresolved: TokenUsageIndex["unresolved"], tokenPath: string, cssVar?: string) {
  const rows = Array.isArray(unresolved) ? unresolved : [];
  const hits: Array<{
    kind: string;
    source: string;
    owner: string;
    keyPath: string;
    tokenPath: string;
    reason: string;
    suggested?: string | null;
  }> = [];

  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const ref = String((item as any).tokenPath || "").trim();
    if (!ref) continue;
    if (ref === tokenPath || (cssVar && ref === cssVar)) {
      hits.push({
        kind: String((item as any).kind || ""),
        source: String((item as any).source || ""),
        owner: String((item as any).owner || ""),
        keyPath: String((item as any).keyPath || ""),
        tokenPath: ref,
        reason: String((item as any).reason || ""),
        suggested: (item as any).suggested ?? null,
      });
    }
  }

  hits.sort((a, b) => {
    const left = `${a.kind}|${a.source}|${a.owner}|${a.keyPath}`;
    const right = `${b.kind}|${b.source}|${b.owner}|${b.keyPath}`;
    return left.localeCompare(right, "en", { sensitivity: "base" });
  });

  return hits;
}

function buildGraphImpact(graph: TokenGraphViz | null, tokenPath: string) {
  if (!graph) return { dependents: [] as string[], dependencies: [] as string[] };
  const nodeId = tokenNodeIdForPath(tokenPath);
  const dependents: string[] = [];
  const dependencies: string[] = [];

  for (const edge of graph.edges || []) {
    if (edge.target === nodeId) dependents.push(edge.source);
    if (edge.source === nodeId) dependencies.push(edge.target);
  }

  const normalize = (id: string) => String(id || "").replace(/^path:/, "");

  return {
    dependents: dependents.map(normalize).sort((a, b) => a.localeCompare(b)),
    dependencies: dependencies.map(normalize).sort((a, b) => a.localeCompare(b)),
  };
}

function summarizeOwners(occurrences: TokenUsageOccurrence[], limit: number) {
  const counts = new Map<string, number>();
  for (const occ of occurrences) {
    const owner = String(occ.owner || "").trim();
    if (!owner) continue;
    counts.set(owner, (counts.get(owner) || 0) + 1);
  }
  const rows = Array.from(counts.entries())
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner));
  return rows.slice(0, limit);
}

function badgeForChange(kind: ChangeKind, changeClass: "breaking" | "non-breaking") {
  if (changeClass === "breaking") return "warning" as const;
  if (kind === "added") return "success" as const;
  if (kind === "removed") return "warning" as const;
  return "neutral" as const;
}

function rowTone(kind: ChangeKind, changeClass: "breaking" | "non-breaking") {
  if (kind === "removed") return "bg-red-500/5";
  if (kind === "added") return "bg-emerald-500/5";
  if (changeClass === "breaking") return "bg-amber-500/10";
  return "";
}

function isRiskyResolvedValueChange(change: { fields_changed?: string[] }, usageCount: number | null) {
  if (!usageCount || usageCount <= 0) return false;
  const fields = change.fields_changed || [];
  return fields.includes("resolvedValue");
}

function ImpactPanel(props: {
  selected: SelectedChange;
  usageEntry: TokenUsageEntry | null;
  unresolvedHits: ReturnType<typeof buildUnresolvedImpact>;
  graphImpact: ReturnType<typeof buildGraphImpact>;
  onClose: () => void;
}) {
  const owners = useMemo(() => {
    if (!props.usageEntry) return [];
    return summarizeOwners(props.usageEntry.usedIn || [], 8);
  }, [props.usageEntry]);

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[420px] max-w-[calc(100vw-2rem)] rounded-xl border border-border/70 bg-card/95 shadow-panel backdrop-blur-lg">
      <div className="flex items-start justify-between gap-3 border-b border-border/70 p-4">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Token impact
          </div>
          <div className="font-mono text-xs">{props.selected.tokenPath}</div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant={badgeForChange(props.selected.kind, props.selected.changeClass)}>
              {props.selected.kind} · {props.selected.changeClass}
            </Badge>
            {props.usageEntry ? (
              <Badge variant="neutral">{props.usageEntry.usageCount} uses</Badge>
            ) : (
              <Badge variant="neutral">usage unknown</Badge>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={props.onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/70 bg-background/60 p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Uses
            </div>
            <div className="mt-2 text-xl font-semibold">
              {formatImpactCount(props.usageEntry?.usageCount ?? null)}
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/60 p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Dependents
            </div>
            <div className="mt-2 text-xl font-semibold">
              {props.graphImpact.dependents.length}
            </div>
          </div>
        </div>

        {props.selected.kind === "removed" ? (
          <div className="rounded-lg border border-border/70 bg-background/60 p-3">
            <div className="text-sm font-semibold">Unresolved references</div>
            <div className="mt-2 text-xs text-muted-foreground">
              {props.unresolvedHits.length
                ? `${props.unresolvedHits.length} refs still pointing to this token/css var.`
                : "No unresolved references matched for this token in the current usage index."}
            </div>
          </div>
        ) : null}

        {owners.length ? (
          <div>
            <div className="mb-2 text-sm font-semibold">Top owners</div>
            <div className="flex flex-wrap gap-2">
              {owners.map((row) => (
                <Badge key={row.owner} variant="neutral">
                  {row.owner} · {row.count}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4">
          <div>
            <div className="mb-2 text-sm font-semibold">Dependents</div>
            {props.graphImpact.dependents.length ? (
              <div className="flex flex-wrap gap-2">
                {props.graphImpact.dependents.slice(0, 12).map((dep) => (
                  <Badge key={dep} variant="neutral">
                    {dep}
                  </Badge>
                ))}
                {props.graphImpact.dependents.length > 12 ? (
                  <Badge variant="neutral">
                    +{props.graphImpact.dependents.length - 12} more
                  </Badge>
                ) : null}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No dependents found.</div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Link
              className="text-sm font-semibold underline decoration-border/60 underline-offset-4"
              to={`/tokens/${encodeURIComponent(props.selected.tokenPath)}`}
            >
              Open token detail
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TokenDiffPage() {
  const [beforeRef, setBeforeRef] = useState("HEAD~1");
  const [report, setReport] = useState<TokenDiffReport | null>(null);
  const [usageIndex, setUsageIndex] = useState<TokenUsageIndex | null>(null);
  const [graph, setGraph] = useState<TokenGraphViz | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);
  const [showOnlyBreaking, setShowOnlyBreaking] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SelectedChange | null>(null);
  const [tableSort, setTableSort] = useState<{
    field: "token" | "status" | "uses" | "dependents" | "notes";
    dir: "asc" | "desc";
  }>({ field: "status", dir: "desc" });

  const presets = [
    { value: "HEAD~1", label: "HEAD~1" },
    { value: "HEAD~5", label: "HEAD~5" },
    { value: "HEAD~20", label: "HEAD~20" },
    { value: "main", label: "main" },
    { value: "origin/main", label: "origin/main" },
  ];

  const load = async (ref: string) => {
    setLoading(true);
    setError(null);
    try {
      const [diffPayload, usagePayload, graphPayload] = await Promise.all([
        fetchTokenDiff(ref),
        fetchTokenUsageIndex().catch(() => null),
        fetchTokenGraph().catch(() => null),
      ]);
      setReport(diffPayload);
      setUsageIndex(usagePayload);
      setGraph(graphPayload);
    } catch (cause) {
      setReport(null);
      setUsageIndex(null);
      setGraph(null);
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Token diff failed",
          fallbackMessage: "Unable to compute token diff for the selected reference.",
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(beforeRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    if (!report) return null;
    const total = report.summary.added + report.summary.removed + report.summary.modified;
    const breaking = report.summary.breaking_changes;
    return {
      total,
      added: report.summary.added,
      removed: report.summary.removed,
      modified: report.summary.modified,
      breaking,
    };
  }, [report]);

  const usageByPath = usageIndex?.byPath ?? {};
  const unresolved = usageIndex?.unresolved ?? [];

  const filtered = useMemo(() => {
    if (!report) {
      return { added: [], removed: [], modified: [] } as const;
    }

    const lowered = search.trim().toLowerCase();
    const matchesSearch = (value: string) => !lowered || value.toLowerCase().includes(lowered);
    const keepBreaking = (changeClass: string) => !showOnlyBreaking || changeClass === "breaking";

    const added = report.changes.added.filter((item) => {
      if (!keepBreaking(item.change_class)) return false;
      if (!matchesSearch(item.key)) return false;
      return true;
    });

    const removed = report.changes.removed.filter((item) => {
      if (!keepBreaking(item.change_class)) return false;
      if (!matchesSearch(item.key)) return false;
      return true;
    });

    const modified = report.changes.modified.filter((item) => {
      if (!keepBreaking(item.change_class)) return false;
      if (!matchesSearch(item.key)) return false;
      return true;
    });

    return { added, removed, modified } as const;
  }, [report, search, showOnlyBreaking]);

  const selectedUsageEntry = useMemo(() => {
    if (!selected) return null;
    return usageByPath[selected.tokenPath] ?? null;
  }, [selected, usageByPath]);

  const selectedUnresolvedHits = useMemo(() => {
    if (!selected) return [];
    return buildUnresolvedImpact(unresolved, selected.tokenPath, selected.tokenCssVar);
  }, [selected, unresolved]);

  const selectedGraphImpact = useMemo(() => {
    if (!selected) return { dependents: [], dependencies: [] };
    return buildGraphImpact(graph, selected.tokenPath);
  }, [graph, selected]);

  const renderSection = (
    kind: ChangeKind,
    title: string,
    rows: Array<{
      key: string;
      identity: string;
      change_class: "breaking" | "non-breaking";
      tokenPath: string;
      tokenCssVar?: string;
      fieldsChanged?: string[];
    }>,
  ) => {
    const sortedRows = rows.slice().sort((left, right) => {
      const valueFor = (row: (typeof rows)[number]) => {
        if (tableSort.field === "token") return row.tokenPath.toLowerCase();
        if (tableSort.field === "status") return row.change_class === "breaking" ? 1 : 0;
        if (tableSort.field === "uses") return usageByPath[row.tokenPath]?.usageCount ?? -1;
        if (tableSort.field === "dependents")
          return buildGraphImpact(graph, row.tokenPath).dependents.length;
        return (row.fieldsChanged || []).join(",").toLowerCase();
      };
      const aValue = valueFor(left);
      const bValue = valueFor(right);
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return tableSort.dir === "asc" ? comparison : comparison * -1;
    });

    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{rows.length} items</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead showSortIcon={false}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    onClick={() =>
                      setTableSort((current) =>
                        current.field === "token"
                          ? { field: "token", dir: current.dir === "asc" ? "desc" : "asc" }
                          : { field: "token", dir: "asc" },
                      )
                    }
                  >
                    Token <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead showSortIcon={false}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    onClick={() =>
                      setTableSort((current) =>
                        current.field === "status"
                          ? { field: "status", dir: current.dir === "asc" ? "desc" : "asc" }
                          : { field: "status", dir: "asc" },
                      )
                    }
                  >
                    Status <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead className="text-right" showSortIcon={false}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    onClick={() =>
                      setTableSort((current) =>
                        current.field === "uses"
                          ? { field: "uses", dir: current.dir === "asc" ? "desc" : "asc" }
                          : { field: "uses", dir: "asc" },
                      )
                    }
                  >
                    Uses <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead className="text-right" showSortIcon={false}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    onClick={() =>
                      setTableSort((current) =>
                        current.field === "dependents"
                          ? {
                              field: "dependents",
                              dir: current.dir === "asc" ? "desc" : "asc",
                            }
                          : { field: "dependents", dir: "asc" },
                      )
                    }
                  >
                    Dependents <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead showSortIcon={false}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    onClick={() =>
                      setTableSort((current) =>
                        current.field === "notes"
                          ? { field: "notes", dir: current.dir === "asc" ? "desc" : "asc" }
                          : { field: "notes", dir: "asc" },
                      )
                    }
                  >
                    Notes <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.length ? (
                sortedRows.map((row) => {
                  const usageCount = usageByPath[row.tokenPath]?.usageCount ?? null;
                  const impact = buildGraphImpact(graph, row.tokenPath);
                  const risky = row.fieldsChanged
                    ? isRiskyResolvedValueChange({ fields_changed: row.fieldsChanged }, usageCount)
                    : false;

                  return (
                    <TableRow
                      key={`${kind}:${row.identity}`}
                      className={`cursor-pointer ${rowTone(kind, row.change_class)}`}
                      onClick={() =>
                        setSelected({
                          kind,
                          key: row.key,
                          identity: row.identity,
                          changeClass: row.change_class,
                          tokenPath: row.tokenPath,
                          tokenCssVar: row.tokenCssVar,
                        })
                      }
                    >
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-mono text-xs font-semibold">
                            {row.tokenPath}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <Link
                              className="underline decoration-border/60 underline-offset-4"
                              to={`/tokens/${encodeURIComponent(row.tokenPath)}`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              Open detail
                            </Link>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={badgeForChange(kind, row.change_class)}>
                            {row.change_class}
                          </Badge>
                          {risky ? <Badge variant="warning">impact</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {formatImpactCount(usageCount)}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {impact.dependents.length}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.fieldsChanged?.length ? (
                          <span>
                            fields:{" "}
                            <span className="font-mono text-[11px]">
                              {row.fieldsChanged.join(", ")}
                            </span>
                          </span>
                        ) : (
                          <span>—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    No items.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };

  const addedRows = useMemo(() => {
    if (!report) return [];
    return filtered.added.map((change) => ({
      key: change.key,
      identity: change.identity,
      change_class: change.change_class,
      tokenPath: change.token.path,
      tokenCssVar: change.token.cssVar,
    }));
  }, [filtered.added, report]);

  const removedRows = useMemo(() => {
    if (!report) return [];
    return filtered.removed.map((change) => ({
      key: change.key,
      identity: change.identity,
      change_class: change.change_class,
      tokenPath: change.token.path,
      tokenCssVar: change.token.cssVar,
    }));
  }, [filtered.removed, report]);

  const modifiedRows = useMemo(() => {
    if (!report) return [];
    return filtered.modified.map((change) => ({
      key: change.key,
      identity: change.identity,
      change_class: change.change_class,
      tokenPath: parseTokenPathFromIdentity(change.identity) || change.key,
      fieldsChanged: change.fields_changed,
    }));
  }, [filtered.modified, report]);

  return (
    <div className="space-y-5 animate-fade-slide-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Token Diff</h2>
          <p className="text-sm text-muted-foreground">
            Comparación on-demand del token registry actual vs. un git ref anterior.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => load(beforeRef)}
          disabled={loading}
        >
          <RefreshCcw className="mr-2 h-4 w-4" />
          {loading ? "Comparing..." : "Compare"}
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>Controls</CardTitle>
            <CardDescription>
              beforeRef se pasa a <code>ds-token-diff</code> como <code>--before-ref</code>.
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <Select
              value={presets.some((p) => p.value === beforeRef) ? beforeRef : "custom"}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "custom") return;
                setBeforeRef(value);
              }}
            >
              {presets.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">custom</option>
            </Select>
            <Input
              value={beforeRef}
              onChange={(event) => setBeforeRef(event.target.value)}
              placeholder="HEAD~1, main, origin/main, <sha>"
              className="md:w-72"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showOnlyBreaking}
                  onChange={(event) => setShowOnlyBreaking(event.target.checked)}
                />
                Only breaking
              </label>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search token path"
                className="md:w-72"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {report?.sources?.before?.label ? (
                <span>
                  Before: <code>{report.sources.before.label}</code>
                </span>
              ) : null}
            </div>
          </div>

          {error ? (
            <ApiErrorMessage error={error} />
          ) : null}

          {report?.hint ? (
            <div className="rounded-md border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
              {report.hint}
            </div>
          ) : null}

          {stats ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Total changes
                </div>
                <div className="mt-2 text-2xl font-semibold">{stats.total}</div>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Added
                </div>
                <div className="mt-2 text-2xl font-semibold text-emerald-700">
                  +{stats.added}
                </div>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Removed
                </div>
                <div className="mt-2 text-2xl font-semibold text-red-700">
                  -{stats.removed}
                </div>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Modified
                </div>
                <div className="mt-2 text-2xl font-semibold text-amber-700">
                  ~{stats.modified}
                </div>
              </div>
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Breaking
                </div>
                <div className="mt-2 text-2xl font-semibold text-amber-800">
                  {stats.breaking}
                </div>
              </div>
            </div>
          ) : null}

          <div className="text-xs text-muted-foreground">
            {usageIndex ? null : (
              <span>
                Usage index not loaded (impact columns may be incomplete). Run{" "}
                <code>npm run ds:token-usage-index</code>.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-5">
        {renderSection("added", "Added", addedRows)}
        {renderSection("removed", "Removed", removedRows)}
        {renderSection("modified", "Modified", modifiedRows)}
      </section>

      {selected ? (
        <ImpactPanel
          selected={selected}
          usageEntry={selectedUsageEntry}
          unresolvedHits={selectedUnresolvedHits}
          graphImpact={selectedGraphImpact}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
