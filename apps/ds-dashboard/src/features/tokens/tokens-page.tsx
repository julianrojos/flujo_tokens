import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FolderTree, Inbox } from "lucide-react";

import {
  fetchDesignSystemsConfig,
  fetchReportByVariable,
  fetchTokenCollectionTrees,
  fetchTokenCatalog,
  getActiveSystemId,
} from "@/lib/api";
import { resolveDesignSystemContext } from "@/lib/design-system-keys";
import { resolveCollectionPageFilter } from "@/lib/collection-page-filter";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";
import { useSortState } from "@/lib/use-sort-state";
import type { TokenCollectionTreeIndex } from "@/types/token-tree";
import type { TokenCatalogEntry } from "@/types/token-catalog";
import type { TokenUsageEntry } from "@/types/token-usage-index";
import type { VariableUsageReport } from "@/types/consumers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, FilterBar, PageHeader, PrevNextNav, StatsOverview } from "@/components/composites";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { ApiErrorMessage } from "@/components/api-error-message";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { shouldAllowShowAll, shouldShowPageSizeSelect } from "@/lib/table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TokenTreeModal } from "./token-tree/token-tree-modal";
import {
  buildTokenUsageTargets,
  variableReportMatchesTokenTargets,
} from "./token-detail/lib/token-detail-transforms";
import { resolveVariableRef } from "@/lib/token-reference";
import { toTokenDetail } from "@/lib/routes";
import { prefetchTokenDetailQuery } from "./token-detail/use-token-detail-data";
import {
  normalizeResolvedValueFilter,
  resolveColorSwatch as normalizeColorSwatch,
} from "@/lib/token-value-normalize";

const PAGE_SIZE_OPTIONS = [25, 50, 75, 100, 125, 150, 175] as const;
const PAGE_SIZE_ALL = "all";

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
  const [searchParams] = useSearchParams();
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
  const userAdjustedFiltersRef = useRef(false);
  const lastResolvedValueFilterRef = useRef("");
  const filterValue = String(searchParams.get("value") ?? "").trim().toLowerCase();
  const resolvedValueFilter =
    searchParams.get("group") === "resolvedValue"
      ? normalizeResolvedValueFilter(filterValue)
      : "";
  const aliasFilter = searchParams.get("group") === "aliases" && filterValue === "alias" ? filterValue : "";
  const usageCountFilter =
    searchParams.get("group") === "usageCount" && filterValue === "unused" ? filterValue : "";
  const collectionFilter = resolveCollectionPageFilter(
    "tokens",
    searchParams.get("group"),
    searchParams.get("value"),
  );

  const prefetchTokenDetail = useCallback((tokenPath: string) => {
    const target = String(tokenPath || "").trim();
    if (!target) return;
    void prefetchTokenDetailQuery(target);
  }, []);

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

  const tokenRegistry = useMemo(
    () => ({
      entries,
      byPath: Object.fromEntries(entries.map((entry) => [entry.path, entry])),
      bySlashPath: Object.fromEntries(entries.map((entry) => [entry.slashPath, entry])),
      byVariableId: {},
    }),
    [entries],
  );

  const types = useMemo(() => {
    const set = new Set(entries.map((entry) => entry.type));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const resolvedValuePreset = useMemo(() => {
    if (!resolvedValueFilter || entries.length === 0) {
      return { collection: "", type: "" };
    }

    const matchingEntries = entries.filter(
      (entry) =>
        normalizeResolvedValueFilter(entry.resolvedValue) === resolvedValueFilter,
    );
    if (matchingEntries.length === 0) {
      return { collection: "", type: "" };
    }

    const collectionSet = new Set(matchingEntries.map((entry) => entry.collection));
    const typeSet = new Set(matchingEntries.map((entry) => entry.type));

    return {
      collection: collectionSet.size === 1 ? matchingEntries[0]?.collection ?? "" : "",
      type: typeSet.size === 1 ? matchingEntries[0]?.type ?? "" : "",
    };
  }, [entries, resolvedValueFilter]);

  const usageCountPreset = useMemo(() => {
    if (usageCountFilter !== "unused") {
      return { collection: "", type: "" };
    }

    const matchingEntries = entries.filter((entry) => (usageByPath[entry.path]?.usageCount ?? 0) === 0);
    if (matchingEntries.length === 0) {
      return { collection: "", type: "" };
    }

    const collectionSet = new Set(matchingEntries.map((entry) => entry.collection));
    const typeSet = new Set(matchingEntries.map((entry) => entry.type));

    return {
      collection: collectionSet.size === 1 ? matchingEntries[0]?.collection ?? "" : "",
      type: typeSet.size === 1 ? matchingEntries[0]?.type ?? "" : "",
    };
  }, [entries, usageByPath, usageCountFilter]);

  const aliasPreset = useMemo(() => {
    if (aliasFilter !== "alias") {
      return { collection: "", type: "" };
    }

    const matchingEntries = entries.filter((entry) => entry.aliasOf !== null);
    if (matchingEntries.length === 0) {
      return { collection: "", type: "" };
    }

    const collectionSet = new Set(matchingEntries.map((entry) => entry.collection));
    const typeSet = new Set(matchingEntries.map((entry) => entry.type));

    return {
      collection: collectionSet.size === 1 ? matchingEntries[0]?.collection ?? "" : "",
      type: typeSet.size === 1 ? matchingEntries[0]?.type ?? "" : "",
    };
  }, [aliasFilter, entries]);

  const filtered = useMemo(() => {
    const lowered = search.trim().toLowerCase();
    const normalizedResolvedValueFilter = resolvedValueFilter;
    const next = entries.filter((entry) => {
      const matchesSearch =
        !lowered ||
        entry.path.toLowerCase().includes(lowered) ||
        entry.resolvedValue.toLowerCase().includes(lowered);
      const matchesCollection =
        collection === "all" || entry.collection === collection;
      const matchesType = type === "all" || entry.type === type;
      const matchesAlias =
        !aliasFilter || (aliasFilter === "alias" ? entry.aliasOf !== null : true);
      const matchesUsageCount =
        !usageCountFilter ||
        (usageCountFilter === "unused" ? (usageByPath[entry.path]?.usageCount ?? 0) === 0 : true);
      const matchesResolvedValue =
        !normalizedResolvedValueFilter ||
        normalizeResolvedValueFilter(entry.resolvedValue) === normalizedResolvedValueFilter;
      return matchesSearch && matchesCollection && matchesType && matchesAlias && matchesUsageCount && matchesResolvedValue;
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
  }, [aliasFilter, entries, search, collection, type, sort, usageByPath, resolvedValueFilter, usageCountFilter]);

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
  const showPageSizeSelect = shouldShowPageSizeSelect(filtered.length);
  const rowLinkClassName = "text-foreground hover:text-primary";

  useEffect(() => {
    if (pageSize === PAGE_SIZE_ALL && !shouldAllowShowAll(filtered.length)) {
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
  }, [collection, pageSize, pageSizeOptions, search, type, filtered.length]);

  useEffect(() => {
    const nextFilterKey = `${resolvedValueFilter}|${usageCountFilter}|${aliasFilter}`;
    if (lastResolvedValueFilterRef.current === nextFilterKey) return;
    lastResolvedValueFilterRef.current = nextFilterKey;
    userAdjustedFiltersRef.current = false;
    setCollection("all");
    setType("all");
    setCurrentPage(1);
  }, [aliasFilter, resolvedValueFilter, usageCountFilter]);

  useEffect(() => {
    if (!resolvedValueFilter || userAdjustedFiltersRef.current) return;

    let applied = false;

    if (collection === "all" && resolvedValuePreset.collection) {
      setCollection(resolvedValuePreset.collection);
      applied = true;
    }

    if (type === "all" && resolvedValuePreset.type) {
      setType(resolvedValuePreset.type);
      applied = true;
    }

    if (applied) {
      userAdjustedFiltersRef.current = true;
    }
  }, [aliasFilter, aliasPreset.collection, aliasPreset.type, collection, resolvedValueFilter, resolvedValuePreset.collection, resolvedValuePreset.type, type, usageCountFilter, usageCountPreset.collection, usageCountPreset.type]);

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
    let tokensWithUse = 0;
    let aliasesTotal = 0;

    for (const entry of entries) {
      const usageCount = Number(usageByPath[entry.path]?.usageCount ?? 0);
      if (usageCount > 0) tokensWithUse += 1;
      if (entry.aliasOf !== null) aliasesTotal += 1;
    }

    const tokensWithoutUse = Math.max(0, totalTokens - tokensWithUse);
    const aliasesPercent = totalTokens > 0 ? Math.round((aliasesTotal / totalTokens) * 100) : 0;
    const unusedPercent = totalTokens > 0 ? Math.round((tokensWithoutUse / totalTokens) * 100) : 0;

    return {
      totalTokens,
      aliasesTotal,
      tokensWithoutUse,
      aliasesPercent,
      unusedPercent,
    };
  }, [entries, usageByPath]);

  const hasKpiFilter = collectionFilter.isFiltered;

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
        description={collectionFilter.description}
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

      {hasKpiFilter ? (
        <PrevNextNav
          hasPrevious={true}
          hasNext={false}
          onPrevious={() => window.history.back()}
          onNext={() => undefined}
          currentIndex={0}
          totalItems={1}
          previousLabel="Back"
        />
      ) : null}

      {hasKpiFilter ? null : (
        <StatsOverview
          items={[
            { id: "tokens-total", label: "Total tokens", value: metrics.totalTokens },
            {
              id: "aliases",
              label: "Aliases",
              value: `${metrics.aliasesTotal} (${metrics.aliasesPercent}%)`,
              to: "/tokens?group=aliases&value=alias",
            },
            {
              id: "tokens-unused",
              label: "Unused tokens",
              value: `${metrics.tokensWithoutUse} (${metrics.unusedPercent}%)`,
              to: "/tokens?group=usageCount&value=unused",
            },
          ]}
        />
      )}

      <Card className="p-5 text-card-foreground backdrop-blur-sm">
          <FilterBar
            searchValue={search}
            onSearch={setSearch}
            searchPlaceholder="Buscar por token o valor"
            rightSlot={
              showPageSizeSelect ? (
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
                    {shouldAllowShowAll(filtered.length) ? <option value={PAGE_SIZE_ALL}>All</option> : null}
                  </Select>
                </div>
              ) : null
            }
          >
            <Select
              value={collection}
              onChange={(event) => {
                userAdjustedFiltersRef.current = true;
                setCollection(event.target.value);
              }}
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
              onChange={(event) => {
                userAdjustedFiltersRef.current = true;
                setType(event.target.value);
              }}
            >
              <option value="all">Type: All</option>
              {types.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
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
                  label="Token"
                  ariaLabel="Sort by token"
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
              {loading ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={`token-loading-${index}`}>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Loading tokens...
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="p-0">
                    <EmptyState
                      icon={Inbox}
                      title="No tokens found"
                      description="Try adjusting the current filters."
                      compact
                    />
                  </TableCell>
                </TableRow>
              ) : (
                pagedEntries.map((entry) => {
                  const swatch = normalizeColorSwatch(entry.resolvedValue);
                  const resolvedRef = resolveVariableRef(entry.resolvedValue, tokenRegistry);
                  const resolvedToken =
                    tokenRegistry.byPath[resolvedRef.tokenLabel] ??
                    tokenRegistry.bySlashPath[resolvedRef.tokenLabel] ??
                    null;
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
                        <Link
                          to={detailHref}
                          className={rowLinkClassName}
                          aria-label={`Open ${entry.slashPath} detail`}
                          onMouseEnter={() => prefetchTokenDetail(entry.path)}
                          onFocus={() => prefetchTokenDetail(entry.path)}
                        >
                          {entry.slashPath}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="neutral">{entry.collection}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs lowercase text-foreground">{entry.type}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {swatch ? (
                            <span
                              className="inline-block h-4 w-4 rounded-sm border border-border"
                              style={{ backgroundColor: swatch }}
                              aria-label={`Color swatch ${swatch}`}
                            />
                          ) : null}
                          {resolvedToken && resolvedToken.path !== entry.path ? (
                            <Link
                              to={toTokenDetail(resolvedToken.path)}
                              className={rowLinkClassName}
                              aria-label={`Open ${resolvedToken.slashPath} detail from resolved value`}
                              onMouseEnter={() => prefetchTokenDetail(resolvedToken.path)}
                              onFocus={() => prefetchTokenDetail(resolvedToken.path)}
                            >
                              {entry.resolvedValue}
                            </Link>
                          ) : (
                            <span className="text-foreground">{entry.resolvedValue}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div>{usageCount}</div>
                          {usageOwners.length > 0 ? (
                            <div className="font-mono text-xs text-muted-foreground">
                              {usageOwners.join(", ")}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
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
      </Card>

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
