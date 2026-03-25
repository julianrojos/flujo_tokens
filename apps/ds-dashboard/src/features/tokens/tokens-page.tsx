import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Accessibility,
  FolderTree,
  RefreshCcw,
} from "lucide-react";

import {
  fetchTokenCollectionTrees,
  fetchTokenRegistry,
  fetchTokenUsageIndex,
  refreshTokenUsageIndex,
} from "@/lib/api";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";
import { useSortState } from "@/lib/use-sort-state";
import type { TokenCollectionTreeIndex } from "@/types/token-tree";
import type { TokenEntry } from "@/types/token-registry";
import type { TokenUsageEntry, TokenUsageIndexSummary } from "@/types/token-usage-index";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterBar, PageHeader } from "@/components/composites";
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
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import {
  Table,
  TableBody,
  TableCell,
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
  const [sort, toggleSort] = useSortState<SortField>({ field: "path", dir: "asc" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);
  const [usageError, setUsageError] = useState<ApiErrorDisplay | null>(null);
  const [usageSyncing, setUsageSyncing] = useState(false);
  const [treeModalOpen, setTreeModalOpen] = useState(false);
  const [treeData, setTreeData] = useState<TokenCollectionTreeIndex | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<ApiErrorDisplay | null>(null);
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
              toApiErrorDisplay(cause, {
                fallbackTitle: "Usage index unavailable",
                fallbackMessage: "Run `npm run ds:token-usage-index` and retry.",
              }),
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
        setError(
          toApiErrorDisplay(cause, {
            fallbackTitle: "Token registry unavailable",
            fallbackMessage: "Run `npm run generate:registry` and refresh the page.",
          }),
        );
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
        if (sort.field === "path") return entry.path.toLowerCase();
        if (sort.field === "collection") return entry.collection.toLowerCase();
        if (sort.field === "type") return entry.type.toLowerCase();
        if (sort.field === "cssVar") return entry.cssVar.toLowerCase();
        if (sort.field === "resolvedValue") return entry.resolvedValue.toLowerCase();
        return usageByPath[entry.path]?.usageCount ?? 0;
      };

      const aValue = valueFor(a);
      const bValue = valueFor(b);
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sort.dir === "asc" ? comparison : comparison * -1;
    });

    return next;
  }, [entries, search, collection, type, sort, usageByPath]);

  const summary = useMemo(() => {
    const byCollection: Record<string, number> = {};
    for (const entry of entries) {
      byCollection[entry.collection] =
        (byCollection[entry.collection] ?? 0) + 1;
    }
    return byCollection;
  }, [entries]);

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
      setUsageError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Usage sync failed",
          fallbackMessage: "Unable to refresh token usage index.",
        }),
      );
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
        setTreeError(
          toApiErrorDisplay(cause, {
            fallbackTitle: "Token tree unavailable",
            fallbackMessage: "Unable to load token collection trees.",
          }),
        );
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
      <PageHeader
        title="Tokens & Custom Properties"
        description="Local inventory of your design tokens, with filters by collection and type."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/tokens/naming-debt">
              <Button variant="outline">Naming Quality</Button>
            </Link>
            <Button variant="outline" onClick={refreshUsage} disabled={usageSyncing}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {usageSyncing ? "Syncing usage..." : "Sync Usage Index"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-9 px-0"
              title="Open token collections tree"
              aria-label="Open token collections tree"
              onClick={() => setTreeModalOpen(true)}
            >
              <FolderTree className="h-4 w-4" />
            </Button>
          </div>
        }
      />

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
        <CardContent>
          <FilterBar
            searchValue={search}
            onSearch={setSearch}
            searchPlaceholder="Buscar por token path, CSS var o valor"
            count={filtered.length}
          >
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
          </FilterBar>

          {error ? (
            <ApiErrorMessage error={error} />
          ) : null}
          {usageError ? (
            <ApiErrorMessage error={usageError} tone="warning" className="mt-3" />
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead
                  label="Token Path"
                  ariaLabel="Sort by token path"
                  onSort={() => toggleSort("path")}
                />
                <SortableTableHead
                  label="Collection"
                  ariaLabel="Sort by collection"
                  onSort={() => toggleSort("collection")}
                />
                <SortableTableHead
                  label="Type"
                  ariaLabel="Sort by type"
                  onSort={() => toggleSort("type")}
                />
                <SortableTableHead
                  label="CSS Variable"
                  ariaLabel="Sort by CSS variable"
                  onSort={() => toggleSort("cssVar")}
                />
                <SortableTableHead
                  label="Resolved Value"
                  ariaLabel="Sort by resolved value"
                  onSort={() => toggleSort("resolvedValue")}
                />
                <SortableTableHead
                  label="Used In"
                  ariaLabel="Sort by usage count"
                  onSort={() => toggleSort("usageCount")}
                />
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
                    const detailParams = new URLSearchParams();
                    if (collection !== "all") detailParams.set("fromCollection", collection);
                    if (type !== "all") detailParams.set("fromType", type);
                    if (search.trim()) detailParams.set("fromSearch", search.trim());
                    const detailHref = `/tokens/${encodeURIComponent(entry.path)}${
                      detailParams.size ? `?${detailParams.toString()}` : ""
                    }`;
                    return (
                      <TableRow key={entry.path}>
                        <TableCell>
                          <div className="font-medium">
                            <Link
                              to={detailHref}
                              className="hover:text-primary hover:underline"
                              aria-label={`Open ${entry.path} detail`}
                            >
                              {entry.path}
                            </Link>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <Link
                              to={detailHref}
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
      />
    </div>
  );
}
