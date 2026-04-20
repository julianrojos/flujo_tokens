import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Accessibility,
  FolderTree,
} from "lucide-react";

import {
  fetchDesignSystemsConfig,
  fetchReportByVariable,
  fetchTokenCollectionTrees,
  fetchTokenCatalog,
  getActiveSystemId,
} from "@/lib/api";
import { resolveDesignSystemContext } from "@/lib/design-system-keys";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";
import { useSortState } from "@/lib/use-sort-state";
import type { TokenCollectionTreeIndex } from "@/types/token-tree";
import type { TokenCatalogEntry } from "@/types/token-catalog";
import type { TokenUsageEntry } from "@/types/token-usage-index";
import type { VariableUsageReport } from "@/types/consumers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterBar, PageHeader, StatsOverview } from "@/components/composites";
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
import {
  buildTokenUsageTargets,
  variableReportMatchesTokenTargets,
} from "./token-detail/lib/token-detail-transforms";

const PAGE_SIZE_OPTIONS = [25, 50, 75, 100, 125, 150, 175] as const;
const PAGE_SIZE_ALL = "all";

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

function splitReportNodeCounts(report: VariableUsageReport): { parent: number; consumer: number } {
  let parent = 0;
  let consumer = 0;
  for (const entry of report.consumers ?? []) {
    const nodeCount = Number.isFinite(entry.nodeCount) ? Math.max(0, Number(entry.nodeCount)) : 0;
    if (String(entry.consumerId || "").startsWith("parent:")) {
      parent += nodeCount;
    } else {
      consumer += nodeCount;
    }
  }
  return { parent, consumer };
}

function buildMergedUsageByPath(args: {
  entries: TokenCatalogEntry[];
  variableReports: VariableUsageReport[];
}): Record<string, TokenUsageEntry> {
  const merged: Record<string, TokenUsageEntry> = {};
  if (!Array.isArray(args.entries) || args.entries.length === 0) return merged;
  if (!Array.isArray(args.variableReports) || args.variableReports.length === 0) return merged;

  for (const token of args.entries) {
    const targets = buildTokenUsageTargets(token);
    let figmaParentCount = 0;
    let figmaConsumerCount = 0;

    for (const report of args.variableReports) {
      if (!variableReportMatchesTokenTargets(report, targets)) continue;
      const split = splitReportNodeCounts(report);
      figmaParentCount += split.parent;
      figmaConsumerCount += split.consumer;
    }

    if (figmaParentCount <= 0 && figmaConsumerCount <= 0) continue;

    const base = merged[token.path] ?? {
      path: token.path,
      slashPath: token.slashPath,
      cssVar: token.cssVar,
      type: token.type,
      collection: token.collection,
      usageCount: 0,
      usageByKind: {},
      usedIn: [],
    };
    const baseUsageByKind = base.usageByKind ?? {};
    const nextUsageByKind = { ...baseUsageByKind };
    if (figmaParentCount > 0) {
      nextUsageByKind["figma-applied"] = (nextUsageByKind["figma-applied"] ?? 0) + figmaParentCount;
    }
    if (figmaConsumerCount > 0) {
      nextUsageByKind["figma-consumer-applied"] =
        (nextUsageByKind["figma-consumer-applied"] ?? 0) + figmaConsumerCount;
    }

    merged[token.path] = {
      ...base,
      usageCount: (Number(base.usageCount) || 0) + figmaParentCount + figmaConsumerCount,
      usageByKind: nextUsageByKind,
      usedIn: Array.isArray(base.usedIn) ? base.usedIn : [],
    };
  }

  return merged;
}

type SortField =
  | "path"
  | "collection"
  | "type"
  | "resolvedValue"
  | "usageCount";

export function TokensPage() {
  const [entries, setEntries] = useState<TokenCatalogEntry[]>([]);
  const [usageByPath, setUsageByPath] = useState<Record<string, TokenUsageEntry>>({});
  const [search, setSearch] = useState("");
  const [collection, setCollection] = useState("all");
  const [type, setType] = useState("all");
  const [sort, toggleSort] = useSortState<SortField>({ field: "path", dir: "asc" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);
  const [treeModalOpen, setTreeModalOpen] = useState(false);
  const [treeData, setTreeData] = useState<TokenCollectionTreeIndex | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<ApiErrorDisplay | null>(null);
  const [pageSize, setPageSize] = useState<string>("25");
  const [currentPage, setCurrentPage] = useState(1);
  const contrastChecker = useContrastChecker();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [configPayload, registryPayload] = await Promise.all([
          fetchDesignSystemsConfig().catch(() => null),
          fetchTokenCatalog(),
        ]);
        const { dsFileKey } = resolveDesignSystemContext(
          configPayload,
          String(getActiveSystemId() || "").trim(),
        );
        const variableReports = dsFileKey
          ? await fetchReportByVariable(dsFileKey)
              .then((payload) => payload.data ?? [])
              .catch((cause) => {
                console.warn("[tokens-page] Failed to fetch variable usage reports", cause);
                return [] as VariableUsageReport[];
              })
          : [];

        setEntries(registryPayload.entries ?? []);
        const mergedUsageByPath = buildMergedUsageByPath({
          entries: registryPayload.entries ?? [],
          variableReports,
        });
        setUsageByPath(mergedUsageByPath);
      } catch (cause) {
        setError(
          toApiErrorDisplay(cause, {
            fallbackTitle: "Token registry unavailable",
            fallbackMessage: "Refresh the page after regenerating tokens.",
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
        entry.resolvedValue.toLowerCase().includes(lowered);
      const matchesCollection =
        collection === "all" || entry.collection === collection;
      const matchesType = type === "all" || entry.type === type;
      return matchesSearch && matchesCollection && matchesType;
    });

    next.sort((a, b) => {
      const valueFor = (entry: TokenCatalogEntry): string | number => {
        if (sort.field === "path") return entry.path.toLowerCase();
        if (sort.field === "collection") return entry.collection.toLowerCase();
        if (sort.field === "type") return entry.type.toLowerCase();
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

  const allowShowAll = filtered.length >= 175;
  const pageSizeOptions = useMemo(
    () => PAGE_SIZE_OPTIONS.filter((size) => size <= Math.max(25, filtered.length)),
    [filtered.length],
  );
  const pageSizeValue = pageSize === PAGE_SIZE_ALL ? filtered.length : Number(pageSize);
  const shouldPaginate =
    pageSize !== PAGE_SIZE_ALL &&
    Number.isFinite(pageSizeValue) &&
    pageSizeValue > 0 &&
    filtered.length > pageSizeValue;
  const totalPages = shouldPaginate ? Math.max(1, Math.ceil(filtered.length / pageSizeValue)) : 1;

  useEffect(() => {
    if (pageSize === PAGE_SIZE_ALL && !allowShowAll) {
      setPageSize("25");
      return;
    }
    if (pageSize !== PAGE_SIZE_ALL) {
      const numericValue = Number(pageSize);
      if (!pageSizeOptions.includes(numericValue as (typeof PAGE_SIZE_OPTIONS)[number])) {
        const fallback = pageSizeOptions[pageSizeOptions.length - 1] ?? 25;
        setPageSize(String(fallback));
        return;
      }
    }
    setCurrentPage(1);
  }, [allowShowAll, collection, pageSize, pageSizeOptions, search, type]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const pagedEntries = useMemo(() => {
    if (!shouldPaginate) return filtered;
    const start = (currentPage - 1) * pageSizeValue;
    return filtered.slice(start, start + pageSizeValue);
  }, [currentPage, filtered, pageSizeValue, shouldPaginate]);

  const pageStart = shouldPaginate ? (currentPage - 1) * pageSizeValue + 1 : filtered.length === 0 ? 0 : 1;
  const pageEnd = shouldPaginate ? Math.min(filtered.length, currentPage * pageSizeValue) : filtered.length;

  const metrics = useMemo(() => {
    const totalTokens = entries.length;
    let tokensInUse = 0;
    let totalRefs = 0;

    for (const entry of entries) {
      const usageCount = Number(usageByPath[entry.path]?.usageCount ?? 0);
      if (usageCount > 0) tokensInUse += 1;
      totalRefs += Math.max(0, usageCount);
    }

    const tokensWithoutUse = Math.max(0, totalTokens - tokensInUse);
    const usagePercent = totalTokens > 0 ? Math.round((tokensInUse / totalTokens) * 100) : 0;
    const unusedPercent = totalTokens > 0 ? Math.round((tokensWithoutUse / totalTokens) * 100) : 0;

    return {
      totalTokens,
      tokensInUse,
      tokensWithoutUse,
      usagePercent,
      unusedPercent,
      totalRefs,
    };
  }, [entries, usageByPath]);

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
    <div className="space-y-5">
      <PageHeader
        title="Tokens"
        description="Local inventory of your design tokens, with filters by collection and type."
        actions={
          <div className="flex flex-wrap gap-2">
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

      <StatsOverview
        items={[
          { id: "tokens-total", label: "Total tokens", value: metrics.totalTokens },
          {
            id: "tokens-in-use",
            label: "Tokens en uso",
            value: `${metrics.tokensInUse} (${metrics.usagePercent}%)`,
          },
          {
            id: "tokens-unused",
            label: "Tokens sin uso",
            value: `${metrics.tokensWithoutUse} (${metrics.unusedPercent}%)`,
          },
          { id: "tokens-total-uses", label: "Total uses", value: metrics.totalRefs },
        ]}
      />

      <div className="rounded-xl border border-border/70 bg-card/85 p-5 text-card-foreground backdrop-blur-sm">
          <FilterBar
            searchValue={search}
            onSearch={setSearch}
            searchPlaceholder="Buscar por token path o valor"
            rightSlot={(
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Rows</span>
                <Select
                  value={pageSize}
                  onChange={(event) => setPageSize(event.target.value)}
                  className="w-[132px]"
                  aria-label="Rows per page"
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={String(size)}>
                      {size}
                    </option>
                  ))}
                  {allowShowAll ? (
                    <option value={PAGE_SIZE_ALL}>All</option>
                  ) : null}
                </Select>
              </div>
            )}
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

          {shouldPaginate ? (
            <div className="mt-3 mb-3 flex flex-wrap items-center justify-between gap-2 pl-0">
              <p className="text-xs text-muted-foreground">
                Showing {pageStart}-{pageEnd} of {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                >
                  Prev
                </Button>
                <span className="text-xs text-muted-foreground">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
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
                  label="Resolved Value"
                  ariaLabel="Sort by resolved value"
                  onSort={() => toggleSort("resolvedValue")}
                />
                <SortableTableHead
                  label="Instances"
                  ariaLabel="Sort by usage count"
                  onSort={() => toggleSort("usageCount")}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground"
                  >
                    No tokens match your filters.
                  </TableCell>
                </TableRow>
              ) : null}

              {loading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <TableRow key={`token-loading-${index}`}>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        Loading tokens...
                      </TableCell>
                    </TableRow>
                  ))
                : pagedEntries.map((entry) => {
                    const swatch = resolveColorSwatch(entry.resolvedValue);
                    const usage = usageByPath[entry.path];
                    const usageCount = usage?.usageCount ?? 0;
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
                              aria-label={`Open ${entry.slashPath} detail`}
                            >
                              {entry.slashPath}
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="neutral">{entry.collection}</Badge>
                        </TableCell>
                        <TableCell>{entry.type}</TableCell>
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
                            <div className="text-xs">{usageCount}</div>
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

          {shouldPaginate ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pl-0">
              <p className="text-xs text-muted-foreground">
                Showing {pageStart}-{pageEnd} of {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                >
                  Prev
                </Button>
                <span className="text-xs text-muted-foreground">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
      </div>

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
