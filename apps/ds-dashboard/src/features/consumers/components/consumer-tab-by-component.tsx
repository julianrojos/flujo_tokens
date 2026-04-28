import { useEffect, useMemo, useState } from "react";

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Network } from "lucide-react";
import { ApiErrorMessage } from "@/components/api-error-message";
import { EmptyState, FilterBar, StatsOverview } from "@/components/composites";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { StatusAlert } from "@/components/ui/status-alert";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import {
  buildComponentLookupMap,
  buildComponentSlugFallback,
  extractComponentParentAlias,
  normalizeComponentLookupKey,
  resolveKnownComponentSlug,
} from "@/lib/component-identity";
import { fetchComponentCatalog, fetchReportByComponent, listConsumers } from "@/lib/api";
import { toComponentDetail } from "@/lib/routes";
import { QUERY_DEFAULTS } from "@/lib/query-client";
import { useSortState } from "@/lib/use-sort-state";
import { useConsumerFilterParams } from "../hooks/use-consumer-filter-params";
import type { ComponentUsageReport } from "@/types/consumers";
import type { ComponentCatalogItem } from "@/types/component-catalog";
import {
  buildComponentLocalDependencySummary,
  type ConsumerWithUsageDetails,
  type ComponentLocalDependencySummary,
} from "../lib/usage-details-summary";
import { getComponentTableDisplayInfo } from "../lib/component-table-display";
import { shouldAllowShowAll, shouldShowPageSizeSelect } from "@/lib/table-pagination";

interface ConsumerTabByComponentProps {
  dsFileKey: string;
  reloadToken?: number;
}

interface ComponentKpis {
  totalComponents: number;
  totalInstances: number;
  uniqueConsumers: number;
}

interface ComponentTabByComponentData {
  reports: ComponentUsageReport[];
  consumers: ConsumerWithUsageDetails[];
  componentCatalogItems: ComponentCatalogItem[];
  usageDetailsWarning: string | null;
}

type ComponentSortField = "component" | "variant" | "instances" | "uses" | "consumers";

const PAGE_SIZE_OPTIONS = [25, 50, 75, 100, 125, 150, 175] as const;
const PAGE_SIZE_ALL = "all";

async function loadComponentTabByComponentData(dsFileKey: string): Promise<ComponentTabByComponentData> {
  const [reportResult, consumersResult, componentCatalogResult] = await Promise.allSettled([
    fetchReportByComponent(dsFileKey),
    listConsumers(dsFileKey),
    fetchComponentCatalog(),
  ]);

  if (reportResult.status === "rejected") {
    throw reportResult.reason;
  }

  const consumersWarning =
    consumersResult.status === "rejected"
      ? "[consumer-tab-by-component] Consumer usage details unavailable"
      : null;
  const consumersWarningReason =
    consumersResult.status === "rejected" ? consumersResult.reason : null;
  const componentCatalogItems =
    componentCatalogResult.status === "fulfilled"
      ? componentCatalogResult.value.components || []
      : [];

  if (consumersWarning) {
    console.warn(consumersWarning, consumersWarningReason);
  }

  return {
    reports: reportResult.value.data || [],
    consumers:
      consumersResult.status === "fulfilled" ? consumersResult.value.data || [] : [],
    componentCatalogItems,
    usageDetailsWarning: consumersWarning
      ? "Usage details are temporarily unavailable for this view."
      : null,
  };
}

function computeKpis(reports: ComponentUsageReport[]): ComponentKpis {
  const consumerIds = new Set<string>();
  let totalComponents = 0;
  let totalInstances = 0;

  for (const report of reports) {
    totalComponents += 1;
    totalInstances += report.totalInstances;
    for (const consumer of report.consumers) {
      consumerIds.add(consumer.consumerId);
    }
  }

  return {
    totalComponents,
    totalInstances,
    uniqueConsumers: consumerIds.size,
  };
}

function countUniqueConsumers(report: ComponentUsageReport): number {
  return new Set(report.consumers.map((consumer) => consumer.consumerId)).size;
}

export function ConsumerTabByComponent({ dsFileKey, reloadToken = 0 }: ConsumerTabByComponentProps) {
  const { searchQuery, setSearchQuery } = useConsumerFilterParams();
  const [sort, toggleSort] = useSortState<ComponentSortField>({ field: "component", dir: "asc" });
  const [pageSize, setPageSize] = useState<string>("25");
  const [currentPage, setCurrentPage] = useState(1);
  const query = useQuery<ComponentTabByComponentData>({
    queryKey: ["consumer-tab-by-component", dsFileKey, reloadToken],
    enabled: Boolean(dsFileKey),
    queryFn: async () => loadComponentTabByComponentData(dsFileKey),
    ...QUERY_DEFAULTS,
  });

  const reports = query.data?.reports ?? [];
  const consumers = query.data?.consumers ?? [];
  const componentCatalogItems = query.data?.componentCatalogItems ?? [];
  const loading = query.isLoading;
  const usageDetailsWarning = query.data?.usageDetailsWarning ?? null;
  const error = query.error
    ? toApiErrorDisplay(query.error, {
        fallbackTitle: "Load reports failed",
        fallbackMessage: "Unable to load component usage reports.",
      })
    : null;

  const filteredReports = useMemo(() => {
    const lowered = searchQuery.toLowerCase().trim();
    return reports.filter((report) => {
      const matchesSearch =
        !lowered ||
        report.componentName.toLowerCase().includes(lowered) ||
        report.componentKey.toLowerCase().includes(lowered);
      return matchesSearch;
    });
  }, [reports, searchQuery]);

  const localDependencySummaryByComponent = useMemo(
    () => buildComponentLocalDependencySummary(consumers),
    [consumers],
  );
  const componentSlugByLookup = useMemo(
    () => buildComponentLookupMap(componentCatalogItems),
    [componentCatalogItems],
  );
  const componentDisplayNameBySlug = useMemo(
    () => new Map(componentCatalogItems.map((item) => [item.slug, item.display_name])),
    [componentCatalogItems],
  );
  const componentDisplayNameByVariant = useMemo(() => {
    const lookup = new Map<string, string>();
    const ambiguous = new Set<string>();

    for (const item of componentCatalogItems) {
      const parentDisplayName = String(item.display_name || "").trim();
      if (!parentDisplayName) continue;

      for (const variant of item.figma?.variants || []) {
        const variantName = String(variant?.name || "").trim();
        if (!variantName) continue;

        const candidates = new Set<string>([variantName]);
        const parsedVariant = getComponentTableDisplayInfo({ componentName: variantName });
        if (parsedVariant.variantLabel) {
          candidates.add(parsedVariant.variantLabel);
        }

        for (const candidate of candidates) {
          const key = normalizeComponentLookupKey(candidate);
          if (!key || ambiguous.has(key)) continue;
          const current = lookup.get(key);
          if (!current) {
            lookup.set(key, parentDisplayName);
            continue;
          }
          if (current !== parentDisplayName) {
            lookup.delete(key);
            ambiguous.add(key);
          }
        }
      }
    }

    return lookup;
  }, [componentCatalogItems]);

  const getTableRowMeta = (report: ComponentUsageReport) => {
    const normalizedComponentName = normalizeComponentLookupKey(report.componentName);
    const slugFromName = resolveKnownComponentSlug({
      lookup: componentSlugByLookup,
      parentName: extractComponentParentAlias(report.componentName),
      variantName: report.componentName,
    });
    const parentDisplayName = slugFromName
      ? componentDisplayNameBySlug.get(slugFromName)
      : componentDisplayNameByVariant.get(normalizedComponentName);
    const displayInfo = getComponentTableDisplayInfo({
      componentName: report.componentName,
      parentDisplayName,
    });
    const resolvedComponentSlug =
      slugFromName ||
      (parentDisplayName
        ? resolveKnownComponentSlug({
            lookup: componentSlugByLookup,
            parentName: parentDisplayName,
            variantName: report.componentName,
          })
        : undefined);

    return { displayInfo, resolvedComponentSlug };
  };

  const rowMetaByKey = useMemo(() => {
    const metaByKey = new Map<string, ReturnType<typeof getTableRowMeta>>();
    for (const report of reports) {
      metaByKey.set(report.componentKey, getTableRowMeta(report));
    }
    return metaByKey;
  }, [
    reports,
    componentSlugByLookup,
    componentDisplayNameBySlug,
    componentDisplayNameByVariant,
  ]);

  const getRowMeta = (report: ComponentUsageReport) => {
    return rowMetaByKey.get(report.componentKey) ?? getTableRowMeta(report);
  };

  const resolveDependencySlug = (dependency: ComponentLocalDependencySummary): string | null => {
    const candidates = [
      dependency.componentKey,
      dependency.componentName,
      extractComponentParentAlias(dependency.componentName),
      buildComponentSlugFallback(dependency.componentName),
    ];

    for (const candidate of candidates) {
      const key = normalizeComponentLookupKey(String(candidate || "").trim());
      if (!key) continue;
      if (componentSlugByLookup[key]) {
        return componentSlugByLookup[key];
      }
      const slug = resolveKnownComponentSlug({
        lookup: componentSlugByLookup,
        parentName: extractComponentParentAlias(String(candidate || "")),
        variantName: String(candidate || ""),
      });
      if (slug) return slug;
    }

    return null;
  };

  function renderDependencyCell(report: ComponentUsageReport) {
    const dependencyMap = localDependencySummaryByComponent.get(report.componentKey);
    if (!dependencyMap || dependencyMap.size === 0) {
      return <span className="text-muted-foreground">—</span>;
    }

    const dependencies = Array.from(dependencyMap.values())
      .sort((left, right) => right.usageCount - left.usageCount)
      .slice(0, 3);
    const totalDependencyCount = dependencyMap.size;
    const dependencyItems = dependencies
      .map((dependency) => ({
        dependency,
        slug: resolveDependencySlug(dependency),
      }));

    return (
      <div className="space-y-1">
        <div className="flex flex-wrap gap-2">
          {dependencyItems.map(({ dependency, slug }) => {
            const dependencyName = dependency.componentName || componentDisplayNameBySlug.get(slug || "") || slug || dependency.componentKey;
            const chip = (
              <span className="inline-flex max-w-[160px] items-baseline gap-1">
                <span className="truncate">{dependencyName}</span>
                <span className="inline-flex min-w-6 items-center justify-center rounded-full border border-border/60 bg-[var(--app-surface-1)] px-1.5 py-0.5 text-[10px] tabular-nums text-foreground/70">
                  {dependency.usageCount}
                </span>
              </span>
            );

            if (!slug) {
              return (
                <span
                  key={dependency.componentKey}
                  className="inline-flex max-w-full items-center text-foreground"
                >
                  {chip}
                </span>
              );
            }

            return (
              <Link
                key={dependency.componentKey}
                to={toComponentDetail(slug)}
                className="inline-flex max-w-full items-center text-foreground transition-colors hover:text-primary"
                aria-label={`Open ${dependencyName} detail`}
              >
                {chip}
              </Link>
            );
          })}
        </div>
        {totalDependencyCount > dependencyItems.length ? (
          <span className="text-xs text-muted-foreground">
            +{totalDependencyCount - dependencyItems.length} more
          </span>
        ) : null}
      </div>
    );
  }

  const sortedReports = useMemo(() => {
    return [...filteredReports].sort((a, b) => {
      const valueFor = (report: ComponentUsageReport): string | number => {
        const { displayInfo } = getRowMeta(report);
        if (sort.field === "component") return displayInfo.componentLabel.toLowerCase();
        if (sort.field === "variant") return displayInfo.variantLabel.toLowerCase();
        if (sort.field === "instances") return report.totalInstances;
        if (sort.field === "uses") {
          return Array.from(localDependencySummaryByComponent.get(report.componentKey)?.values() ?? []).reduce(
            (sum, dependency) => sum + dependency.usageCount,
            0,
          );
        }
        if (sort.field === "consumers") return countUniqueConsumers(report);
        return displayInfo.componentLabel.toLowerCase();
      };

      const aValue = valueFor(a);
      const bValue = valueFor(b);
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      const dirAdjusted = sort.dir === "asc" ? comparison : comparison * -1;
      if (dirAdjusted !== 0) return dirAdjusted;
      const aMeta = getRowMeta(a);
      const bMeta = getRowMeta(b);
      return aMeta.displayInfo.componentLabel.localeCompare(bMeta.displayInfo.componentLabel);
    });
  }, [
    filteredReports,
    sort,
    localDependencySummaryByComponent,
    rowMetaByKey,
  ]);
  const pageSizeOptions = useMemo(
    () => PAGE_SIZE_OPTIONS.filter((size) => size <= Math.max(25, sortedReports.length)),
    [sortedReports.length],
  );
  const pageSizeValue = pageSize === PAGE_SIZE_ALL ? sortedReports.length : Number(pageSize);
  const shouldPaginate =
    pageSize !== PAGE_SIZE_ALL &&
    Number.isFinite(pageSizeValue) &&
    pageSizeValue > 0 &&
    sortedReports.length > pageSizeValue;
  const totalPages = shouldPaginate ? Math.max(1, Math.ceil(sortedReports.length / pageSizeValue)) : 1;
  const showPageSizeSelect = shouldShowPageSizeSelect(sortedReports.length);

  useEffect(() => {
    if (pageSize === PAGE_SIZE_ALL && !shouldAllowShowAll(sortedReports.length)) {
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
  }, [pageSize, pageSizeOptions, searchQuery, sortedReports.length]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const pagedReports = useMemo(() => {
    if (!shouldPaginate) return sortedReports;
    const start = (currentPage - 1) * pageSizeValue;
    return sortedReports.slice(start, start + pageSizeValue);
  }, [currentPage, pageSizeValue, shouldPaginate, sortedReports]);

  const pageStart = shouldPaginate ? (currentPage - 1) * pageSizeValue + 1 : sortedReports.length === 0 ? 0 : 1;
  const pageEnd = shouldPaginate ? Math.min(sortedReports.length, currentPage * pageSizeValue) : sortedReports.length;

  function renderComponentCell(report: ComponentUsageReport) {
    const { displayInfo, resolvedComponentSlug } = getRowMeta(report);

    if (resolvedComponentSlug) {
      return (
        <Link
          to={toComponentDetail(resolvedComponentSlug)}
          className="text-foreground hover:text-primary"
          aria-label={`Open ${report.componentName} detail`}
        >
          {displayInfo.componentLabel}
        </Link>
      );
    }

    return <span className="text-foreground">{displayInfo.componentLabel}</span>;
  }

  const kpis = useMemo(() => computeKpis(reports), [reports]);

  if (!loading && reports.length === 0) {
    return (
      <Card className="p-5 text-card-foreground backdrop-blur-sm">
        <EmptyState
          icon={Network}
          title="No component usage data"
          description="Sync consumer files to see component usage across files."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <StatsOverview
        items={[
          { id: "components-total", label: "Total components", value: kpis.totalComponents },
          { id: "components-instances", label: "Total instances", value: kpis.totalInstances },
          { id: "components-consumers", label: "Unique consumers", value: kpis.uniqueConsumers },
        ]}
      />

      <Card className="p-5 text-card-foreground backdrop-blur-sm">
        <div className="space-y-4">
          <FilterBar
            searchValue={searchQuery}
            onSearch={setSearchQuery}
            searchPlaceholder="Search components"
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
                    {shouldAllowShowAll(sortedReports.length) ? <option value={PAGE_SIZE_ALL}>All</option> : null}
                  </Select>
                </div>
              ) : null
            }
          />

          {usageDetailsWarning ? (
            <StatusAlert
              variant="warning"
              title="Usage details unavailable"
              description={usageDetailsWarning}
            />
          ) : null}

          {error ? <ApiErrorMessage error={error} /> : null}

          {shouldPaginate ? (
            <div className="mt-3 mb-3 flex flex-wrap items-center justify-between gap-2 pl-0">
              <p className="text-xs text-muted-foreground">
                Showing {pageStart}-{pageEnd} of {sortedReports.length}
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
                  label="Component"
                  onSort={() => toggleSort("component")}
                  ariaLabel="Sort by component"
                />
                <SortableTableHead
                  label="Variant"
                  onSort={() => toggleSort("variant")}
                  ariaLabel="Sort by variant"
                />
                <SortableTableHead
                  label="Instances"
                  onSort={() => toggleSort("instances")}
                  ariaLabel="Sort by instances"
                />
                <SortableTableHead
                  label="Reused in"
                  onSort={() => toggleSort("uses")}
                  ariaLabel="Sort by reused in"
                />
                <SortableTableHead
                  label="Consumers"
                  onSort={() => toggleSort("consumers")}
                  ariaLabel="Sort by consumers"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={`component-loading-${index}`}>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Loading component usage...
                    </TableCell>
                  </TableRow>
                ))
              ) : sortedReports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="p-0">
                    <EmptyState
                      icon={Network}
                      title="No matching components"
                      description="Try adjusting the current filters."
                      compact
                    />
                  </TableCell>
                </TableRow>
              ) : (
                pagedReports.map((report) => {
                  const topConsumers = report.consumers.slice(0, 3);
                  const { displayInfo } = getRowMeta(report);
                  return (
                    <TableRow key={report.componentKey}>
                      <TableCell>
                        {renderComponentCell(report)}
                      </TableCell>
                      <TableCell>
                        {displayInfo.variantLabel ? (
                          <span className="block truncate text-sm !font-normal">{displayInfo.variantLabel}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="tabular-nums text-foreground">{report.totalInstances}</span>
                      </TableCell>
                      <TableCell>
                        {renderDependencyCell(report)}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {topConsumers.map((usage) => (
                            <div key={usage.consumerId} className="flex items-center gap-2">
                              <a
                                href={usage.sampleLinks[0] || "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-foreground hover:text-primary"
                              >
                                {usage.consumerName}
                              </a>
                              <span className="inline-flex min-w-6 items-center justify-center rounded-full border border-border/60 bg-[var(--app-surface-1)] px-1.5 py-0.5 text-[10px] tabular-nums text-foreground">
                                {usage.instanceCount || 0}
                              </span>
                            </div>
                          ))}
                          {report.consumers.length > topConsumers.length ? (
                            <span className="text-foreground">
                              +{report.consumers.length - topConsumers.length} more
                            </span>
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
                Showing {pageStart}-{pageEnd} of {sortedReports.length}
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
      </Card>
    </div>
  );
}
