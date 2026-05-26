import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Inbox, Unlink } from "lucide-react";

import { ApiErrorMessage } from "@/components/api-error-message";
import { EmptyState, EmptyStateAction, FilterBar, PageHeader, StatsOverview } from "@/components/composites";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ImpactLevelBadge } from "@/components/ui/impact-level-badge";
import { Select } from "@/components/ui/select";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  buildConsumerOverviewRows,
  buildConsumerOverviewSummary,
  buildConsumerVariableRankingRows,
} from "@/features/consumers/lib/consumer-overview";
import { useDsFileKey } from "@/hooks/use-ds-file-key";
import { useDesignSystem } from "@/lib/design-system-context";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import {
  fetchComponentCatalog,
  fetchReportByComponent,
  fetchReportByVariable,
  fetchTokenCatalog,
  listConsumers,
} from "@/lib/api";
import { QUERY_DEFAULTS } from "@/lib/query-client";
import { formatSyncedAt } from "@/lib/format-synced-at";
import { resolveVariableRef } from "@/lib/token-reference";
import { useSortState } from "@/lib/use-sort-state";
import { toComponentDetail, toSystemAdmin, toSystemConsumerDetail, toSystemConsumers, toTokenDetail } from "@/lib/routes";
import { shouldAllowShowAll, shouldShowPageSizeSelect } from "@/lib/table-pagination";
import { buildConsumerTopComponentRankingRows } from "@/features/consumers/lib/consumer-top-component-ranking";
import { cn } from "@/lib/utils";
import type { TokenCatalog } from "@/types/token-catalog";
import type { DsSyncRun, ImpactLevel } from "@/types/consumers";

const PAGE_SIZE_OPTIONS = [25, 50, 75, 100, 125, 150, 175] as const;
const PAGE_SIZE_ALL = "all";
const RANKING_LIMIT = 10;
const IMPACT_LEVEL_WEIGHT: Record<ImpactLevel, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

type ComponentRankingSortField = "component" | "impact" | "coverage" | "consumers" | "instances";
type VariableRankingSortField = "variable" | "impact" | "coverage" | "consumers" | "nodes";
type ConsumerAdoptionSortField = "consumer" | "components" | "variables" | "lastSynced";

function formatAdoption(used: number, total: number, percent: number | null): string {
  if (total <= 0) return "—";
  return percent == null ? `${used} / ${total}` : `${used} / ${total} (${percent}%)`;
}

function compareNumberValues(left: number | null, right: number | null, dir: "asc" | "desc") {
  const leftValue = left ?? Number.NEGATIVE_INFINITY;
  const rightValue = right ?? Number.NEGATIVE_INFINITY;
  const comparison = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
  return dir === "asc" ? comparison : comparison * -1;
}

function compareStringValues(left: string, right: string, dir: "asc" | "desc") {
  const comparison = left.localeCompare(right);
  return dir === "asc" ? comparison : comparison * -1;
}

function compareImpactValues(left: ImpactLevel, right: ImpactLevel, dir: "asc" | "desc") {
  return compareNumberValues(IMPACT_LEVEL_WEIGHT[left], IMPACT_LEVEL_WEIGHT[right], dir);
}

function getSyncedAtValue(syncRun: DsSyncRun | undefined): number | null {
  if (!syncRun?.syncedAt) return null;
  const parsed = Date.parse(syncRun.syncedAt);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveConsumerTokenEntry(tokenCatalog: TokenCatalog | null, variableName: string) {
  if (!tokenCatalog) return null;
  const resolved = resolveVariableRef(variableName, tokenCatalog);
  return (
    tokenCatalog.byPath?.[resolved.tokenLabel] ??
    tokenCatalog.bySlashPath?.[resolved.tokenLabel] ??
    null
  );
}

export function ConsumersOverviewPage() {
  const navigate = useNavigate();
  const { dsFileKey, loading: dsFileKeyLoading } = useDsFileKey();
  const { activeSystem } = useDesignSystem();
  const [searchQuery, setSearchQuery] = useState("");
  const [consumerPageSize, setConsumerPageSize] = useState<string>("25");
  const [consumerCurrentPage, setConsumerCurrentPage] = useState(1);
  const [componentSort, toggleComponentSort] = useSortState<ComponentRankingSortField>({
    field: "instances",
    dir: "desc",
  });
  const [variableSort, toggleVariableSort] = useSortState<VariableRankingSortField>({
    field: "nodes",
    dir: "desc",
  });
  const [consumerSort, toggleConsumerSort] = useSortState<ConsumerAdoptionSortField>({
    field: "lastSynced",
    dir: "desc",
  });

  const query = useQuery({
    queryKey: ["consumer-overview", dsFileKey],
    enabled: Boolean(dsFileKey),
    queryFn: async () => {
      const [consumersResponse, componentReportsResponse, variableReportsResponse, componentCatalogResult, tokenCatalogResult] =
        await Promise.all([
          listConsumers(dsFileKey || ""),
          fetchReportByComponent(dsFileKey || ""),
          fetchReportByVariable(dsFileKey || ""),
          fetchComponentCatalog().catch(() => ({ components: [] })),
          fetchTokenCatalog().catch(() => null),
        ]);

      return {
        consumers: consumersResponse.data || [],
        componentReports: componentReportsResponse.data || [],
        variableReports: variableReportsResponse.data || [],
        componentCatalog: componentCatalogResult.components || [],
        tokenCatalog: tokenCatalogResult,
      };
    },
    ...QUERY_DEFAULTS,
  });

  const error = query.error
    ? toApiErrorDisplay(query.error, {
        fallbackTitle: "Load consumer overview failed",
        fallbackMessage: "Unable to load consumer adoption analytics.",
      })
    : null;

  const summary = useMemo(
    () => buildConsumerOverviewSummary(query.data?.consumers ?? []),
    [query.data?.consumers],
  );
  const consumerRows = useMemo(
    () => buildConsumerOverviewRows(query.data?.consumers ?? []),
    [query.data?.consumers],
  );
  const componentRankingRows = useMemo(
    () => buildConsumerTopComponentRankingRows(
      query.data?.componentReports ?? [],
      summary.activeConsumers,
      query.data?.componentCatalog ?? [],
    ),
    [query.data?.componentReports, query.data?.componentCatalog, summary.activeConsumers],
  );
  const variableRankingRows = useMemo(
    () => buildConsumerVariableRankingRows(
      query.data?.variableReports ?? [],
      summary.activeConsumers,
    ),
    [query.data?.variableReports, summary.activeConsumers],
  );
  const tokenCatalog = query.data?.tokenCatalog ?? null;

  const filteredConsumerRows = useMemo(() => {
    const normalizedQuery = searchQuery.toLowerCase().trim();
    if (!normalizedQuery) return consumerRows;
    return consumerRows.filter((row) => {
      return (
        row.consumerName.toLowerCase().includes(normalizedQuery) ||
        row.consumerFileKey.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [consumerRows, searchQuery]);

  const sortedConsumerRows = useMemo(() => {
    return [...filteredConsumerRows].sort((left, right) => {
      let comparison = 0;
      switch (consumerSort.field) {
        case "consumer":
          comparison = compareStringValues(left.consumerName, right.consumerName, consumerSort.dir);
          break;
        case "components":
          comparison = compareNumberValues(left.componentUsage.adoptionPercent, right.componentUsage.adoptionPercent, consumerSort.dir);
          if (comparison === 0) {
            comparison = compareNumberValues(left.componentUsage.used, right.componentUsage.used, consumerSort.dir);
          }
          break;
        case "variables":
          comparison = compareNumberValues(left.variableUsage.adoptionPercent, right.variableUsage.adoptionPercent, consumerSort.dir);
          if (comparison === 0) {
            comparison = compareNumberValues(left.variableUsage.used, right.variableUsage.used, consumerSort.dir);
          }
          break;
        case "lastSynced":
          comparison = compareNumberValues(
            getSyncedAtValue(left.latestSync),
            getSyncedAtValue(right.latestSync),
            consumerSort.dir,
          );
          break;
      }
      if (comparison !== 0) return comparison;
      const fallback = left.consumerName.localeCompare(right.consumerName);
      if (fallback !== 0) return fallback;
      return left.consumerId.localeCompare(right.consumerId);
    });
  }, [consumerSort, filteredConsumerRows]);

  const pageSizeOptions = useMemo(
    () => PAGE_SIZE_OPTIONS.filter((size) => size <= Math.max(25, sortedConsumerRows.length)),
    [sortedConsumerRows.length],
  );
  const pageSizeValue = consumerPageSize === PAGE_SIZE_ALL ? sortedConsumerRows.length : Number(consumerPageSize);
  const shouldPaginate =
    consumerPageSize !== PAGE_SIZE_ALL &&
    Number.isFinite(pageSizeValue) &&
    pageSizeValue > 0 &&
    sortedConsumerRows.length > pageSizeValue;
  const totalPages = shouldPaginate ? Math.max(1, Math.ceil(sortedConsumerRows.length / pageSizeValue)) : 1;
  const showPageSizeSelect = shouldShowPageSizeSelect(sortedConsumerRows.length);

  useEffect(() => {
    if (consumerPageSize === PAGE_SIZE_ALL && !shouldAllowShowAll(sortedConsumerRows.length)) {
      setConsumerPageSize("25");
      return;
    }
    if (consumerPageSize !== PAGE_SIZE_ALL) {
      const numericValue = Number(consumerPageSize);
      if (!pageSizeOptions.includes(numericValue as (typeof PAGE_SIZE_OPTIONS)[number])) {
        const fallback = pageSizeOptions[pageSizeOptions.length - 1] ?? 25;
        setConsumerPageSize(String(fallback));
        return;
      }
    }
    setConsumerCurrentPage(1);
  }, [consumerPageSize, pageSizeOptions, searchQuery, sortedConsumerRows.length]);

  useEffect(() => {
    setConsumerCurrentPage((previous) => Math.min(previous, totalPages));
  }, [totalPages]);

  const pagedConsumerRows = useMemo(() => {
    if (!shouldPaginate) return sortedConsumerRows;
    const start = (consumerCurrentPage - 1) * pageSizeValue;
    return sortedConsumerRows.slice(start, start + pageSizeValue);
  }, [consumerCurrentPage, pageSizeValue, shouldPaginate, sortedConsumerRows]);

  const pageStart = shouldPaginate
    ? (consumerCurrentPage - 1) * pageSizeValue + 1
    : sortedConsumerRows.length === 0
      ? 0
      : 1;
  const pageEnd = shouldPaginate
    ? Math.min(sortedConsumerRows.length, consumerCurrentPage * pageSizeValue)
    : sortedConsumerRows.length;
  const sortedComponentRankingRows = useMemo(() => {
    return [...componentRankingRows]
      .sort((left, right) => {
        let comparison = 0;
        switch (componentSort.field) {
          case "component":
            comparison = compareStringValues(left.componentName, right.componentName, componentSort.dir);
            break;
          case "impact":
            comparison = compareImpactValues(left.impactLevel.level, right.impactLevel.level, componentSort.dir);
            break;
          case "coverage":
            comparison = compareNumberValues(left.coveragePercent, right.coveragePercent, componentSort.dir);
            break;
          case "consumers":
            comparison = compareNumberValues(left.consumers, right.consumers, componentSort.dir);
            break;
          case "instances":
            comparison = compareNumberValues(left.totalInstances, right.totalInstances, componentSort.dir);
            break;
        }
        if (comparison !== 0) return comparison;
        const fallback = left.componentName.localeCompare(right.componentName);
        if (fallback !== 0) return fallback;
        return left.componentKey.localeCompare(right.componentKey);
      })
      .slice(0, RANKING_LIMIT);
  }, [componentRankingRows, componentSort]);
  const sortedVariableRankingRows = useMemo(() => {
    return [...variableRankingRows]
      .sort((left, right) => {
        let comparison = 0;
        switch (variableSort.field) {
          case "variable":
            comparison = compareStringValues(left.variableName, right.variableName, variableSort.dir);
            break;
          case "impact":
            comparison = compareImpactValues(left.impactLevel.level, right.impactLevel.level, variableSort.dir);
            break;
          case "coverage":
            comparison = compareNumberValues(left.coveragePercent, right.coveragePercent, variableSort.dir);
            break;
          case "consumers":
            comparison = compareNumberValues(left.consumers, right.consumers, variableSort.dir);
            break;
          case "nodes":
            comparison = compareNumberValues(left.totalNodes, right.totalNodes, variableSort.dir);
            break;
        }
        if (comparison !== 0) return comparison;
        const fallback = left.variableName.localeCompare(right.variableName);
        if (fallback !== 0) return fallback;
        return left.variableKey.localeCompare(right.variableKey);
      })
      .slice(0, RANKING_LIMIT);
  }, [variableRankingRows, variableSort]);
  const componentSortAriaSort = componentSort.dir === "asc" ? "ascending" : "descending";
  const variableSortAriaSort = variableSort.dir === "asc" ? "ascending" : "descending";
  const consumerSortAriaSort = consumerSort.dir === "asc" ? "ascending" : "descending";

  if (dsFileKeyLoading) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Consumers Overview"
          description="Cross-consumer adoption analytics"
        />
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Loading consumer analytics...</p>
        </div>
      </div>
    );
  }

  if (!dsFileKey) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Consumers Overview"
          description="Cross-consumer adoption analytics"
        />
        <EmptyState
          icon={Inbox}
          title="No Figma File ID configured"
          description="Set the Figma File ID in Design Systems Admin to enable consumer analytics."
          action={
            <EmptyStateAction
              onClick={() =>
                navigate(activeSystem ? toSystemAdmin(activeSystem) : "/new")
              }
            >
              Go to Admin
            </EmptyStateAction>
          }
        />
      </div>
    );
  }

  if (query.isLoading && !query.data) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Consumers Overview"
          description="Cross-consumer adoption analytics"
        />
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Loading consumer analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Consumers Overview"
        description="Cross-consumer adoption analytics"
      />

      <StatsOverview
        items={[
          { id: "consumer-overview-active", label: "Active consumers", value: summary.activeConsumers },
          { id: "consumer-overview-components", label: "DS component uses", value: summary.totalComponentUsage },
          { id: "consumer-overview-variables", label: "DS variable uses", value: summary.totalVariableUsage },
        ]}
      />

      {error ? <ApiErrorMessage error={error} /> : null}

      <Card className="p-5 text-card-foreground backdrop-blur-sm">
        <div className="space-y-4">
          <CardHeader className="px-0 pt-0">
            <CardTitle>Consumers adoption</CardTitle>
            <CardDescription>Adoption metrics by consumer file.</CardDescription>
          </CardHeader>

          <FilterBar
            searchValue={searchQuery}
            onSearch={setSearchQuery}
            searchPlaceholder="Search consumers"
            searchAriaLabel="Search consumers overview"
            rightSlot={
              showPageSizeSelect ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Rows</span>
                  <Select
                    value={consumerPageSize}
                    onChange={(event) => setConsumerPageSize(event.target.value)}
                    className="w-[132px]"
                    aria-label="Rows per page"
                  >
                    {pageSizeOptions.map((size) => (
                      <option key={size} value={String(size)}>
                        {size}
                      </option>
                    ))}
                    {shouldAllowShowAll(sortedConsumerRows.length) ? <option value={PAGE_SIZE_ALL}>All</option> : null}
                  </Select>
                </div>
              ) : null
            }
          />

          {shouldPaginate ? (
            <div className="flex flex-wrap items-center justify-between gap-2 pl-0">
              <p className="text-xs text-muted-foreground">
                Showing {pageStart}-{pageEnd} of {sortedConsumerRows.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConsumerCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={consumerCurrentPage <= 1}
                >
                  Prev
                </Button>
                <span className="text-xs text-muted-foreground">
                  {consumerCurrentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConsumerCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={consumerCurrentPage >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}

          {pagedConsumerRows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Consumer"
                    ariaLabel="Sort by consumer"
                    onSort={() => toggleConsumerSort("consumer")}
                    ariaSort={consumerSort.field === "consumer" ? consumerSortAriaSort : "none"}
                  />
                  <SortableTableHead
                    label="Components adoption"
                    ariaLabel="Sort by components adoption"
                    onSort={() => toggleConsumerSort("components")}
                    ariaSort={consumerSort.field === "components" ? consumerSortAriaSort : "none"}
                  />
                  <SortableTableHead
                    label="Variables adoption"
                    ariaLabel="Sort by variables adoption"
                    onSort={() => toggleConsumerSort("variables")}
                    ariaSort={consumerSort.field === "variables" ? consumerSortAriaSort : "none"}
                  />
                  <SortableTableHead
                    label="Import date"
                    ariaLabel="Sort by import date"
                    onSort={() => toggleConsumerSort("lastSynced")}
                    ariaSort={consumerSort.field === "lastSynced" ? consumerSortAriaSort : "none"}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedConsumerRows.map((row) => (
                  <TableRow key={row.consumerId}>
                    <TableCell>
                      <div className="space-y-0.5">
                        {activeSystem ? (
                          <Link
                            to={toSystemConsumerDetail(activeSystem, row.consumerName)}
                            className="text-foreground hover:text-primary"
                          >
                            {row.consumerName}
                          </Link>
                        ) : (
                          <span>{row.consumerName}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatAdoption(row.componentUsage.used, row.componentUsage.total, row.componentUsage.adoptionPercent)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatAdoption(row.variableUsage.used, row.variableUsage.total, row.variableUsage.adoptionPercent)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatSyncedAt(row.latestSync?.syncedAt, "Never")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : consumerRows.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No consumers registered yet"
              description="Add a consumer file to start collecting adoption metrics."
              action={
                <EmptyStateAction
                  onClick={() => navigate(activeSystem ? toSystemConsumers(activeSystem) : "/new")}
                >
                  Manage consumers
                </EmptyStateAction>
              }
              compact
            />
          ) : (
            <EmptyState
              icon={Inbox}
              title="No consumers match your filters"
              description="Try adjusting the search terms."
              action={
                <EmptyStateAction onClick={() => setSearchQuery("")}>
                  Clear filters
                </EmptyStateAction>
              }
              compact
            />
          )}

          {shouldPaginate ? (
            <div className="flex flex-wrap items-center justify-between gap-2 pl-0">
              <p className="text-xs text-muted-foreground">
                Showing {pageStart}-{pageEnd} of {sortedConsumerRows.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConsumerCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={consumerCurrentPage <= 1}
                >
                  Prev
                </Button>
                <span className="text-xs text-muted-foreground">
                  {consumerCurrentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConsumerCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={consumerCurrentPage >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-5 text-card-foreground backdrop-blur-sm">
          <div className="space-y-4">
            <CardHeader className="px-0 pt-0">
              <CardTitle>Top variables</CardTitle>
              <CardDescription>Top {RANKING_LIMIT} variables across all consumers. Sort by clicking the table headers.</CardDescription>
            </CardHeader>

            {sortedVariableRankingRows.length === 0 ? (
              <EmptyState icon={Inbox} title="No variable usage yet" compact />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      label="Variable"
                      ariaLabel="Sort by variable"
                      onSort={() => toggleVariableSort("variable")}
                      ariaSort={variableSort.field === "variable" ? variableSortAriaSort : "none"}
                    />
                    <SortableTableHead
                      label="Impact"
                      ariaLabel="Sort by impact"
                      onSort={() => toggleVariableSort("impact")}
                      ariaSort={variableSort.field === "impact" ? variableSortAriaSort : "none"}
                    />
                    <SortableTableHead
                      label="Coverage"
                      ariaLabel="Sort by coverage"
                      onSort={() => toggleVariableSort("coverage")}
                      ariaSort={variableSort.field === "coverage" ? variableSortAriaSort : "none"}
                    />
                    <SortableTableHead
                      label="Consumers"
                      ariaLabel="Sort by consumers"
                      onSort={() => toggleVariableSort("consumers")}
                      ariaSort={variableSort.field === "consumers" ? variableSortAriaSort : "none"}
                    />
                    <SortableTableHead
                      label="Nodes"
                      ariaLabel="Sort by total nodes"
                      onSort={() => toggleVariableSort("nodes")}
                      ariaSort={variableSort.field === "nodes" ? variableSortAriaSort : "none"}
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedVariableRankingRows.map((row) => {
                    const tokenEntry = resolveConsumerTokenEntry(tokenCatalog, row.variableName);
                    return (
                      <TableRow key={row.variableKey}>
                        <TableCell>
                          {tokenEntry ? (
                            <Link
                              to={toTokenDetail(tokenEntry.path)}
                              className="text-foreground hover:text-primary"
                            >
                              {row.variableName}
                            </Link>
                          ) : (
                            <span>{row.variableName}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <ImpactLevelBadge level={row.impactLevel.level} />
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {row.coveragePercent == null ? "—" : `${row.coveragePercent}%`}
                        </TableCell>
                        <TableCell className="tabular-nums">{row.consumers}</TableCell>
                        <TableCell className="tabular-nums">{row.totalNodes}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>

        <Card className="p-5 text-card-foreground backdrop-blur-sm">
          <div className="space-y-4">
            <CardHeader className="px-0 pt-0">
              <CardTitle>Top components</CardTitle>
              <CardDescription>Top {RANKING_LIMIT} components across all consumers. Sort by clicking the table headers.</CardDescription>
            </CardHeader>

            {sortedComponentRankingRows.length === 0 ? (
              <EmptyState icon={Inbox} title="No component usage yet" compact />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      label="Component"
                      ariaLabel="Sort by component"
                      onSort={() => toggleComponentSort("component")}
                      ariaSort={componentSort.field === "component" ? componentSortAriaSort : "none"}
                    />
                    <SortableTableHead
                      label="Impact"
                      ariaLabel="Sort by impact"
                      onSort={() => toggleComponentSort("impact")}
                      ariaSort={componentSort.field === "impact" ? componentSortAriaSort : "none"}
                    />
                    <SortableTableHead
                      label="Coverage"
                      ariaLabel="Sort by coverage"
                      onSort={() => toggleComponentSort("coverage")}
                      ariaSort={componentSort.field === "coverage" ? componentSortAriaSort : "none"}
                    />
                    <SortableTableHead
                      label="Consumers"
                      ariaLabel="Sort by consumers"
                      onSort={() => toggleComponentSort("consumers")}
                      ariaSort={componentSort.field === "consumers" ? componentSortAriaSort : "none"}
                    />
                    <SortableTableHead
                      label="Instances"
                      ariaLabel="Sort by total instances"
                      onSort={() => toggleComponentSort("instances")}
                      ariaSort={componentSort.field === "instances" ? componentSortAriaSort : "none"}
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedComponentRankingRows.map((row) => {
                    return (
                      <TableRow key={row.componentKey} className={cn(row.isUncatalogued && "opacity-70")}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {row.isUncatalogued && (
                              <span
                                title="Not in DS catalog"
                                aria-label="Not in DS catalog"
                                role="img"
                                className="shrink-0"
                              >
                                <Unlink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                              </span>
                            )}
                            {row.resolvedSlug ? (
                              <Link
                                to={toComponentDetail(row.resolvedSlug)}
                                className="text-foreground hover:text-primary"
                              >
                                {row.componentName}
                              </Link>
                            ) : (
                              <span>{row.componentName}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <ImpactLevelBadge level={row.impactLevel.level} />
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {row.coveragePercent == null ? "—" : `${row.coveragePercent}%`}
                        </TableCell>
                        <TableCell className="tabular-nums">{row.consumers}</TableCell>
                        <TableCell className="tabular-nums">{row.totalInstances}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
