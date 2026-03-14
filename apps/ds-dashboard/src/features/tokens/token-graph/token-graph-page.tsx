import { useEffect, useMemo, useState } from "react";
import { createSearchParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, RefreshCcw } from "lucide-react";

import { fetchTokenGraph, refreshTokenGraph } from "@/lib/api";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";
import type { TokenGraphViz } from "@/types/token-graph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ApiErrorMessage } from "@/components/api-error-message";
import { cn } from "@/lib/utils";
import {
  buildGraphIndexes,
  buildSubgraph,
  GraphDirection,
  layoutSubgraph,
  resolveNodeIdFromQuery,
} from "./graph-utils";
import { TokenGraphViewer } from "./token-graph-viewer";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const tokenQuery = searchParams.get("token") ?? "";
  const direction = normalizeDirection(searchParams.get("dir"));
  const depth = normalizeDepth(searchParams.get("depth"));

  const [graph, setGraph] = useState<TokenGraphViz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [tokenInput, setTokenInput] = useState(tokenQuery);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setTokenInput(tokenQuery);
  }, [tokenQuery]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchTokenGraph();
      setGraph(payload);
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
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!graph) return;
    const resolved = resolveNodeIdFromQuery(graph, tokenQuery);
    if (resolved) {
      setSelectedId(resolved);
      return;
    }
    setSelectedId(null);
  }, [graph, tokenQuery]);

  const indexes = useMemo(() => (graph ? buildGraphIndexes(graph) : null), [graph]);

  const tokenOptions = useMemo(() => {
    if (!graph) return [];
    return graph.nodes
      .slice()
      .sort((a, b) => a.displayKey.localeCompare(b.displayKey, "en", { sensitivity: "base" }))
      .slice(0, 2500);
  }, [graph]);

  const positioned = useMemo(() => {
    if (!graph || !selectedId) return null;
    const sub = buildSubgraph({ graph, rootId: selectedId, depth, direction });
    return layoutSubgraph(sub);
  }, [depth, direction, graph, selectedId]);

  const selectedNode = useMemo(() => {
    if (!selectedId || !indexes) return null;
    return indexes.nodeById.get(selectedId) ?? null;
  }, [indexes, selectedId]);

  const onSubmitToken = () => {
    const q = tokenInput.trim();
    setSearchParams(
      createSearchParams({
        ...(q ? { token: q } : {}),
        dir: direction,
        depth: String(depth),
      }),
    );
  };

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
    <div className="space-y-5 animate-fade-slide-in">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => {
          if (window.history.length > 1) {
            navigate(-1);
          } else {
            navigate("/tokens");
          }
        }}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        {graph ? <Badge variant="neutral">{graph.summary.nodes} nodes</Badge> : null}
        {graph ? <Badge variant="neutral">{graph.summary.edges} edges</Badge> : null}
        {graph ? (
          <Badge variant={cyclesCount > 0 ? "warning" : "success"}>
            {cyclesCount} cycles · {cycleNodesCount} nodes
          </Badge>
        ) : null}
      </div>

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>Token Graph</CardTitle>
            <CardDescription>
              Visualiza dependencias (referencias <span className="font-mono">var(--…)</span>) entre tokens.
            </CardDescription>
          </div>

          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-end">
            <Button variant="outline" onClick={onRefresh} disabled={syncing}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {syncing ? "Refreshing…" : "Refresh Graph"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <ApiErrorMessage error={error} />
          ) : null}

          {loading ? (
            <div className="text-sm text-muted-foreground">Loading token graph…</div>
          ) : graph ? (
            <div className="grid gap-3 md:grid-cols-12">
              <div className="md:col-span-8">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Token
                </label>
                <div className="mt-2 flex flex-col gap-2 md:flex-row">
                  <div className="flex-1">
                    <Input
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="Token path / slashPath / cssVar (ej: Semantic.Color… o --color-…)"
                      list="token-graph-options"
                    />
                    <datalist id="token-graph-options">
                      {tokenOptions.map((node) => (
                        <option key={node.id} value={node.path || node.displayKey} />
                      ))}
                    </datalist>
                  </div>
                  <Button onClick={onSubmitToken}>Go</Button>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Direction
                </label>
                <Select
                  className="mt-2 w-full"
                  value={direction}
                  onChange={(e) =>
                    setSearchParams(
                      createSearchParams({
                        ...(tokenQuery ? { token: tokenQuery } : {}),
                        dir: e.target.value,
                        depth: String(depth),
                      }),
                    )
                  }
                >
                  <option value="dependencies">dependencies</option>
                  <option value="dependents">dependents</option>
                  <option value="both">both</option>
                </Select>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Depth
                </label>
                <Select
                  className="mt-2 w-full"
                  value={String(depth)}
                  onChange={(e) =>
                    setSearchParams(
                      createSearchParams({
                        ...(tokenQuery ? { token: tokenQuery } : {}),
                        dir: direction,
                        depth: e.target.value,
                      }),
                    )
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
                <span className={cn(selectedNode.isCycleMember ? "text-red-700" : "")}>
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
                <Link
                  to={{
                    pathname: "/impact",
                    search: new URLSearchParams({
                      token: selectedNode.path,
                      depth: String(Math.max(2, depth)),
                    }).toString(),
                  }}
                  className="mt-2 block text-sm font-semibold text-primary hover:underline"
                >
                  Analyze impact →
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
