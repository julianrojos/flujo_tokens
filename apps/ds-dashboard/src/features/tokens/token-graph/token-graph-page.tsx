import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, RefreshCcw } from "lucide-react";

import { fetchTokenGraph, refreshTokenGraph } from "@/lib/api";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";
import type { TokenGraphViz } from "@/types/token-graph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { ApiErrorMessage } from "@/components/api-error-message";
import { PageHeader } from "@/components/composites";
import { cn } from "@/lib/utils";
import {
  buildGraphIndexes,
  buildSubgraph,
  getNodeDisplayKey,
  GraphDirection,
  layoutSubgraph,
  resolveNodeIdFromQuery,
} from "./graph-utils";
import { TokenGraphViewer } from "./token-graph-viewer";

function toSafeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTokenGraphPayload(rawPayload: TokenGraphViz): TokenGraphViz {
  const raw = rawPayload as unknown as Record<string, unknown>;
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
  const rawCycles = Array.isArray(raw.cycles) ? raw.cycles : [];
  const rawCycleNodeIds = Array.isArray(raw.cycle_node_ids) ? raw.cycle_node_ids : [];
  const rawSource =
    raw.source && typeof raw.source === "object"
      ? (raw.source as Record<string, unknown>)
      : {};
  const rawSummary =
    raw.summary && typeof raw.summary === "object"
      ? (raw.summary as Record<string, unknown>)
      : {};

  const nodes = rawNodes
    .map((node) => {
      if (!node || typeof node !== "object") return null;
      const entry = node as Record<string, unknown>;
      const nodeId = String(entry.id ?? "").trim();
      const path = String(
        entry.path ?? entry.displayKey ?? entry.cssVar ?? nodeId,
      ).trim();
      const slashPath = String(entry.slashPath ?? path.replace(/\./g, "/")).trim();
      const cssVar = String(entry.cssVar ?? "").trim();
      const displayKey = String(
        entry.displayKey ?? (path || cssVar || nodeId),
      ).trim();
      if (!nodeId) return null;
      return {
        id: nodeId,
        path,
        slashPath,
        cssVar,
        type: String(entry.type ?? "").trim(),
        collection: String(entry.collection ?? "").trim(),
        resolvedValue: String(entry.resolvedValue ?? "").trim(),
        displayKey: displayKey || nodeId,
        inDegree: toSafeNumber(entry.inDegree, 0),
        outDegree: toSafeNumber(entry.outDegree, 0),
        isCycleMember: Boolean(entry.isCycleMember),
      };
    })
    .filter((node): node is TokenGraphViz["nodes"][number] => node !== null);

  const edges = rawEdges
    .map((edge) => {
      if (!edge || typeof edge !== "object") return null;
      const entry = edge as Record<string, unknown>;
      const source = String(entry.source ?? "").trim();
      const target = String(entry.target ?? "").trim();
      if (!source || !target) return null;
      return { source, target };
    })
    .filter((edge): edge is TokenGraphViz["edges"][number] => edge !== null);

  const cycles = rawCycles.filter(Boolean) as TokenGraphViz["cycles"];
  const cycleNodeIds = rawCycleNodeIds.map((id) => String(id || "").trim()).filter(Boolean);

  return {
    ok: raw.ok !== false,
    source: {
      registry_path: String(rawSource.registry_path ?? "").trim(),
      graph_viz_path: rawSource.graph_viz_path
        ? String(rawSource.graph_viz_path).trim()
        : undefined,
    },
    summary: {
      nodes: toSafeNumber(rawSummary.nodes, nodes.length),
      edges: toSafeNumber(rawSummary.edges, edges.length),
      cycles: toSafeNumber(rawSummary.cycles, cycles.length),
      cycle_nodes: toSafeNumber(rawSummary.cycle_nodes, cycleNodeIds.length),
      unresolved_css_var_refs_total: toSafeNumber(
        rawSummary.unresolved_css_var_refs_total,
        0,
      ),
      ambiguous_css_vars_total: toSafeNumber(rawSummary.ambiguous_css_vars_total, 0),
      graph_collisions: toSafeNumber(rawSummary.graph_collisions, 0),
    },
    nodes,
    edges,
    cycles,
    cycle_node_ids: cycleNodeIds,
    fingerprint: String(raw.fingerprint ?? "").trim(),
  };
}

function normalizeDirection(raw: string | null): GraphDirection {
  const value = String(raw || "").trim();
  if (value === "dependents") return "dependents";
  if (value === "both") return "both";
  return "dependencies";
}

function normalizeDepth(raw: string | null) {
  const parsed = Number.parseInt(String(raw || ""), 10);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(0, Math.min(8, parsed));
}

export function TokenGraphPage() {
  const { tokenPath } = useParams<{ tokenPath: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const direction = normalizeDirection(searchParams.get("dir"));
  const depth = normalizeDepth(searchParams.get("depth"));

  const [graph, setGraph] = useState<TokenGraphViz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchTokenGraph();
      setGraph(normalizeTokenGraphPayload(payload));
    } catch (cause) {
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Token graph unavailable",
          fallbackMessage: "Unable to load token graph.",
        }),
      );
      setGraph(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onGraphRefreshed = () => {
      setRefreshNotice("Token graph actualizado automáticamente.");
      void load();
    };
    window.addEventListener("ds:token-graph-refreshed", onGraphRefreshed);
    return () => {
      window.removeEventListener("ds:token-graph-refreshed", onGraphRefreshed);
    };
  }, [load]);

  useEffect(() => {
    if (!refreshNotice) return;
    const timeoutId = window.setTimeout(() => {
      setRefreshNotice(null);
    }, 3200);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [refreshNotice]);

  useEffect(() => {
    if (!graph || !tokenPath) return;
    const resolved = resolveNodeIdFromQuery(graph, tokenPath);
    if (resolved) {
      setSelectedId(resolved);
      return;
    }
    setSelectedId(null);
  }, [graph, tokenPath]);

  const indexes = useMemo(() => (graph ? buildGraphIndexes(graph) : null), [graph]);

  const positioned = useMemo(() => {
    if (!graph || !selectedId) return null;
    const sub = buildSubgraph({ graph, rootId: selectedId, depth, direction });
    return layoutSubgraph(sub);
  }, [depth, direction, graph, selectedId]);

  const selectedNode = useMemo(() => {
    if (!selectedId || !indexes) return null;
    return indexes.nodeById.get(selectedId) ?? null;
  }, [indexes, selectedId]);
  const resolvedRootLabel = tokenPath ?? "";

  const onRefresh = async () => {
    setSyncing(true);
    setError(null);
    try {
      await refreshTokenGraph();
      await load();
    } catch (cause) {
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Graph refresh failed",
          fallbackMessage: "Unable to refresh token graph.",
        }),
      );
    } finally {
      setSyncing(false);
    }
  };

  const cyclesCount = graph?.summary?.cycles ?? 0;
  const cycleNodesCount = graph?.summary?.cycle_nodes ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dependency Graph"
        description={
          resolvedRootLabel
            ? `Root: ${resolvedRootLabel}`
            : "No token specified"
        }
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/tokens/${encodeURIComponent(tokenPath ?? "")}`}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to token
            </Link>
            {graph ? <Badge variant="neutral">{graph.summary.nodes} nodes</Badge> : null}
            {graph ? <Badge variant="neutral">{graph.summary.edges} edges</Badge> : null}
            {graph ? (
              <Badge variant={cyclesCount > 0 ? "warning" : "success"}>
                {cyclesCount} cycles · {cycleNodesCount} nodes
              </Badge>
            ) : null}
            <Button variant="outline" onClick={onRefresh} disabled={syncing}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {syncing ? "Refreshing…" : "Refresh Graph"}
            </Button>
          </div>
        )}
      />

      {refreshNotice ? (
        <p className="text-sm text-status-success">
          {refreshNotice}
        </p>
      ) : null}

      <Card>
        <CardContent className="space-y-4">
          {error ? (
            <ApiErrorMessage error={error} />
          ) : null}

          {loading ? (
            <div className="text-sm text-muted-foreground">Loading token graph…</div>
          ) : graph ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Direction
                </label>
                <Select
                  className="mt-2 w-full"
                  value={direction}
                  onChange={(e) =>
                    setSearchParams({ dir: e.target.value, depth: String(depth) })
                  }
                >
                  <option value="dependencies">dependencies</option>
                  <option value="dependents">dependents</option>
                  <option value="both">both</option>
                </Select>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Depth
                </label>
                <Select
                  className="mt-2 w-full"
                  value={String(depth)}
                  onChange={(e) =>
                    setSearchParams({ dir: direction, depth: e.target.value })
                  }
                >
                  {Array.from({ length: 7 }).map((_, i) => {
                    const value = i + 1;
                    return (
                      <option key={value} value={String(value)}>
                        {value}
                      </option>
                    );
                  })}
                </Select>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Graph not available. Run{" "}
              <span className="font-mono">npm run ds:token-graph</span> or click{" "}
              <span className="font-semibold">Refresh Graph</span>.
            </div>
          )}
        </CardContent>
      </Card>

      {graph && !selectedNode && resolvedRootLabel ? (
        <Card>
          <CardHeader>
            <CardTitle>Token not found in graph</CardTitle>
            <CardDescription>
              The current graph does not contain a node for{" "}
              <span className="font-mono text-foreground">{resolvedRootLabel}</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Refresh the token graph if the token was added recently, or return to the token detail page to confirm the token path.
          </CardContent>
        </Card>
      ) : null}

      {graph && selectedNode ? (
        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-9">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span>Graph</span>
                <span className="font-mono text-xs text-muted-foreground">{selectedNode.path}</span>
              </CardTitle>
              <CardDescription>
                {direction} · depth {depth} ·{" "}
                <span className={cn(selectedNode.isCycleMember ? "text-status-error" : "")}>
                  {selectedNode.isCycleMember ? "cycle member" : "no cycle"}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {positioned ? (
                <TokenGraphViewer
                  graph={positioned}
                  selectedId={selectedId}
                  onSelect={(id) => setSelectedId(id)}
                  graphFilePath={graph?.source?.graph_viz_path}
                />
              ) : (
                <div className="text-sm text-muted-foreground">
                  Select a token to render the graph.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Selected</CardTitle>
              <CardDescription>Token metadata</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Display</div>
                <div className="font-mono text-xs">{selectedNode.displayKey}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">CSS Var</div>
                <div className="font-mono text-xs">{selectedNode.cssVar || "—"}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="neutral">{selectedNode.collection}</Badge>
                <Badge variant="neutral">{selectedNode.type}</Badge>
                <Badge variant="neutral">in {selectedNode.inDegree}</Badge>
                <Badge variant="neutral">out {selectedNode.outDegree}</Badge>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Resolved</div>
                <div className="font-mono text-xs break-all">
                  {selectedNode.resolvedValue || "—"}
                </div>
              </div>

              <div className="pt-2">
                <Link
                  to={`/tokens/${encodeURIComponent(selectedNode.path)}`}
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  Open token detail →
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
