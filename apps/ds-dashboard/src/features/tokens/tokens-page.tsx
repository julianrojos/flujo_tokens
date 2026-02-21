import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Accessibility,
  ArrowLeftRight,
  ArrowUpDown,
  TreePine,
  RefreshCcw,
} from "lucide-react";

import {
  fetchTokenCollectionTrees,
  fetchTokenRegistry,
  fetchTokenUsageIndex,
  refreshTokenUsageIndex,
} from "@/lib/api";
import type { TokenCollectionTreeIndex } from "@/types/token-tree";
import type { TokenEntry } from "@/types/token-registry";
import type { TokenUsageEntry, TokenUsageIndexSummary } from "@/types/token-usage-index";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContrastCheckerModal } from "./accessibility/contrast-checker-modal";
import { buildSemanticColorOptions } from "./accessibility/semantic-color-options";
import { useContrastChecker } from "./accessibility/use-contrast-checker";
import { TokenTreeModal } from "./token-tree/token-tree-modal";

function resolveColorSwatch(value: string): string | null {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw) || /^#[0-9a-fA-F]{8}$/.test(raw)) {
    return raw;
  }
  return null;
}

function dedupeColorOptionsByPath<T extends { tokenPath: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    if (!map.has(item.tokenPath)) map.set(item.tokenPath, item);
  }
  return Array.from(map.values());
}

type SortField =
  | "path"
  | "collection"
  | "type"
  | "cssVar"
  | "resolvedValue"
  | "usageCount";

export function TokensPage() {
  const [entries, setEntries] = useState<TokenEntry[]>([]);
  const [usageByPath, setUsageByPath] = useState<Record<string, TokenUsageEntry>>({});
  const [usageSummary, setUsageSummary] = useState<TokenUsageIndexSummary | null>(null);
  const [search, setSearch] = useState("");
  const [collection, setCollection] = useState("all");
  const [type, setType] = useState("all");
  const [sortField, setSortField] = useState<SortField>("path");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usageSyncing, setUsageSyncing] = useState(false);
  const [treeModalOpen, setTreeModalOpen] = useState(false);
  const [treeData, setTreeData] = useState<TokenCollectionTreeIndex | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const contrastChecker = useContrastChecker();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      setUsageError(null);
      try {
        const [registryPayload, usagePayload] = await Promise.all([
          fetchTokenRegistry(),
          fetchTokenUsageIndex().catch((cause) => {
            setUsageError(
              cause instanceof Error
                ? cause.message
                : "Token usage index is unavailable. Run `npm run ds:token-usage-index`.",
            );
            return null;
          }),
        ]);
        setEntries(registryPayload.entries ?? []);
        if (usagePayload) {
          setUsageByPath(usagePayload.byPath ?? {});
          setUsageSummary(usagePayload.summary ?? null);
        } else {
          setUsageByPath({});
          setUsageSummary(null);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const collections = useMemo(() => {
    const set = new Set(entries.map((entry) => entry.collection));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const types = useMemo(() => {
    const set = new Set(entries.map((entry) => entry.type));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const filtered = useMemo(() => {
    const lowered = search.trim().toLowerCase();
    const next = entries.filter((entry) => {
      const matchesSearch =
        !lowered ||
        entry.path.toLowerCase().includes(lowered) ||
        entry.cssVar.toLowerCase().includes(lowered) ||
        entry.resolvedValue.toLowerCase().includes(lowered);
      const matchesCollection =
        collection === "all" || entry.collection === collection;
      const matchesType = type === "all" || entry.type === type;
      return matchesSearch && matchesCollection && matchesType;
    });

    next.sort((a, b) => {
      const valueFor = (entry: TokenEntry): string | number => {
        if (sortField === "path") return entry.path.toLowerCase();
        if (sortField === "collection") return entry.collection.toLowerCase();
        if (sortField === "type") return entry.type.toLowerCase();
        if (sortField === "cssVar") return entry.cssVar.toLowerCase();
        if (sortField === "resolvedValue") return entry.resolvedValue.toLowerCase();
        return usageByPath[entry.path]?.usageCount ?? 0;
      };

      const aValue = valueFor(a);
      const bValue = valueFor(b);
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sortDir === "asc" ? comparison : comparison * -1;
    });

    return next;
  }, [entries, search, collection, type, sortField, sortDir, usageByPath]);

  const summary = useMemo(() => {
    const byCollection: Record<string, number> = {};
    for (const entry of entries) {
      byCollection[entry.collection] =
        (byCollection[entry.collection] ?? 0) + 1;
    }
    return byCollection;
  }, [entries]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDir("asc");
  };

  const semanticColorOptions = useMemo(
    () => buildSemanticColorOptions(entries),
    [entries],
  );
  const backgroundColorOptions = useMemo(() => {
    if (!contrastChecker.includePrimitivesBackground) {
      return semanticColorOptions.background;
    }
    return dedupeColorOptionsByPath([
      ...semanticColorOptions.background,
      ...semanticColorOptions.primitives,
    ]);
  }, [
    contrastChecker.includePrimitivesBackground,
    semanticColorOptions.background,
    semanticColorOptions.primitives,
  ]);
  const foregroundColorOptions = useMemo(() => {
    if (!contrastChecker.includePrimitivesForeground) {
      return semanticColorOptions.foreground;
    }
    return dedupeColorOptionsByPath([
      ...semanticColorOptions.foreground,
      ...semanticColorOptions.primitives,
    ]);
  }, [
    contrastChecker.includePrimitivesForeground,
    semanticColorOptions.foreground,
    semanticColorOptions.primitives,
  ]);

  const showAccessibilityButton = type === "color";

  useEffect(() => {
    if (!showAccessibilityButton && contrastChecker.isOpen) {
      contrastChecker.setIsOpen(false);
    }
  }, [showAccessibilityButton, contrastChecker.isOpen, contrastChecker.setIsOpen]);

  useEffect(() => {
    contrastChecker.syncWithOptions(
      backgroundColorOptions,
      foregroundColorOptions,
    );
  }, [
    backgroundColorOptions,
    foregroundColorOptions,
    contrastChecker.syncWithOptions,
  ]);

  const contrastResult = useMemo(
    () =>
      contrastChecker.buildResult(
        backgroundColorOptions,
        foregroundColorOptions,
      ),
    [
      contrastChecker.buildResult,
      backgroundColorOptions,
      foregroundColorOptions,
    ],
  );

  const refreshUsage = async () => {
    setUsageSyncing(true);
    setUsageError(null);
    try {
      await refreshTokenUsageIndex();
      const payload = await fetchTokenUsageIndex();
      setUsageByPath(payload.byPath ?? {});
      setUsageSummary(payload.summary ?? null);
    } catch (cause) {
      setUsageError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setUsageSyncing(false);
    }
  };

  const loadTokenCollectionTrees = useCallback(
    async (force: boolean) => {
      if (treeLoading) return;
      if (!force && treeData) return;
      setTreeLoading(true);
      setTreeError(null);
      try {
        const payload = await fetchTokenCollectionTrees();
        setTreeData(payload);
      } catch (cause) {
        setTreeError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setTreeLoading(false);
      }
    },
    [treeData, treeLoading],
  );

  useEffect(() => {
    if (!treeModalOpen) return;
    void loadTokenCollectionTrees(false);
  }, [loadTokenCollectionTrees, treeModalOpen]);

  return (
    <div className="space-y-5 animate-fade-slide-in">
      <section className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total tokens</CardDescription>
            <CardTitle>{entries.length}</CardTitle>
          </CardHeader>
        </Card>
        {Object.entries(summary)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(0, 3)
          .map(([label, count]) => (
            <Card key={label}>
              <CardHeader>
                <CardDescription>{label}</CardDescription>
                <CardTitle>{count}</CardTitle>
              </CardHeader>
            </Card>
          ))}
      </section>

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex items-start gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-9 px-0"
              title="Open token collections tree"
              aria-label="Open token collections tree"
              onClick={() => setTreeModalOpen(true)}
            >
              <TreePine className="h-4 w-4" />
            </Button>
            <div>
              <CardTitle>Tokens & Custom Properties</CardTitle>
              <CardDescription>
                Inventory local de `token-registry.json` con filtros por colección
                y tipo.
              </CardDescription>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <Link to="/tokens/diff">
              <Button variant="outline">
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                Compare
              </Button>
            </Link>
            <Link to="/tokens/naming-debt">
              <Button variant="outline">Naming Quality</Button>
            </Link>
            <Button variant="outline" onClick={refreshUsage} disabled={usageSyncing}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {usageSyncing ? "Syncing usage..." : "Sync Usage Index"}
            </Button>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por token path, CSS var o valor"
              className="md:w-80"
            />
            <Select
              value={collection}
              onChange={(event) => setCollection(event.target.value)}
            >
              <option value="all">Collection: All</option>
              {collections.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="all">Type: All</option>
              {types.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            {showAccessibilityButton ? (
              <Button
                variant="outline"
                disabled={
                  backgroundColorOptions.length === 0 ||
                  foregroundColorOptions.length === 0
                }
                title="Open color accessibility checker"
                aria-label="Open color accessibility checker"
                onClick={() => contrastChecker.setIsOpen(true)}
              >
                <Accessibility className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {usageError ? (
            <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700">
              Usage index unavailable: {usageError}
            </div>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    aria-label="Sort by token path"
                    onClick={() => toggleSort("path")}
                  >
                    Token Path <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    aria-label="Sort by collection"
                    onClick={() => toggleSort("collection")}
                  >
                    Collection <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    aria-label="Sort by type"
                    onClick={() => toggleSort("type")}
                  >
                    Type <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    aria-label="Sort by CSS variable"
                    onClick={() => toggleSort("cssVar")}
                  >
                    CSS Variable <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    aria-label="Sort by resolved value"
                    onClick={() => toggleSort("resolvedValue")}
                  >
                    Resolved Value <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    aria-label="Sort by usage count"
                    onClick={() => toggleSort("usageCount")}
                  >
                    Used In <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground"
                  >
                    No tokens match your filters.
                  </TableCell>
                </TableRow>
              ) : null}

              {loading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <TableRow key={`token-loading-${index}`}>
                      <TableCell colSpan={6} className="text-muted-foreground">
                        Loading tokens...
                      </TableCell>
                    </TableRow>
                  ))
                : filtered.map((entry) => {
                    const swatch = resolveColorSwatch(entry.resolvedValue);
                    const usage = usageByPath[entry.path];
                    const usageCount = usage?.usageCount ?? 0;
                    const specCount = usage?.usageByKind?.["component-spec"] ?? 0;
                    const cssAliasCount = usage?.usageByKind?.["css-alias"] ?? 0;
                    const usageOwners =
                      usage?.usedIn
                        ?.map((item) => item.owner)
                        .filter(Boolean)
                        .filter((value, index, all) => all.indexOf(value) === index)
                        .slice(0, 2) ?? [];
                    return (
                      <TableRow key={entry.path}>
                        <TableCell>
                          <div className="font-medium">
                            <Link
                              to={`/tokens/${encodeURIComponent(entry.path)}`}
                              className="hover:text-primary hover:underline"
                              aria-label={`Open ${entry.path} detail`}
                            >
                              {entry.path}
                            </Link>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <Link
                              to={`/tokens/${encodeURIComponent(entry.path)}`}
                              className="font-mono hover:text-primary hover:underline"
                              aria-label={`Open ${entry.path} detail`}
                            >
                              {entry.slashPath}
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="neutral">{entry.collection}</Badge>
                        </TableCell>
                        <TableCell>{entry.type}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {entry.cssVar}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 font-mono text-xs">
                            {swatch ? (
                              <span
                                className="inline-block h-4 w-4 rounded-sm border border-border"
                                style={{ backgroundColor: swatch }}
                                aria-label={`Color swatch ${swatch}`}
                              />
                            ) : null}
                            {entry.resolvedValue}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Badge variant="neutral">{usageCount} refs</Badge>
                            {usageSummary ? (
                              <div className="text-xs text-muted-foreground">
                                specs {specCount} · css {cssAliasCount}
                              </div>
                            ) : null}
                            {usageOwners.length > 0 ? (
                              <div className="font-mono text-xs text-muted-foreground">
                                {usageOwners.join(", ")}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ContrastCheckerModal
        open={contrastChecker.isOpen}
        onClose={() => contrastChecker.setIsOpen(false)}
        backgroundOptions={backgroundColorOptions}
        foregroundOptions={foregroundColorOptions}
        backgroundTokenPath={contrastChecker.backgroundTokenPath}
        foregroundTokenPath={contrastChecker.foregroundTokenPath}
        onBackgroundChange={contrastChecker.setBackgroundTokenPath}
        onForegroundChange={contrastChecker.setForegroundTokenPath}
        includePrimitivesBackground={contrastChecker.includePrimitivesBackground}
        onIncludePrimitivesBackgroundChange={
          contrastChecker.setIncludePrimitivesBackground
        }
        includePrimitivesForeground={contrastChecker.includePrimitivesForeground}
        onIncludePrimitivesForegroundChange={
          contrastChecker.setIncludePrimitivesForeground
        }
        elementType={contrastChecker.elementType}
        onElementTypeChange={contrastChecker.setElementType}
        textSize={contrastChecker.textSize}
        onTextSizeChange={contrastChecker.setTextSize}
        result={contrastResult}
        onReset={contrastChecker.reset}
      />

      <TokenTreeModal
        open={treeModalOpen}
        onClose={() => setTreeModalOpen(false)}
        collections={treeData?.collections ?? []}
        summary={treeData?.summary ?? null}
        loading={treeLoading}
        error={treeError}
        onReload={() => {
          void loadTokenCollectionTrees(true);
        }}
      />
    </div>
  );
}
