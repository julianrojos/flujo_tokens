import { useMemo } from "react";

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Network } from "lucide-react";
import { ApiErrorMessage } from "@/components/api-error-message";
import { EmptyState, FilterBar, StatsOverview } from "@/components/composites";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
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
  buildComponentUsageScopeSummary,
  type ComponentUsageScopeSummary,
  type ConsumerWithUsageDetails,
  type ComponentLocalDependencySummary,
} from "../lib/usage-details-summary";
import { getComponentTableDisplayInfo } from "../lib/component-table-display";

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

type ComponentSortField = "component" | "variant" | "instances" | "wrappers" | "uses" | "consumers";

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
  let totalInstances = 0;

  for (const report of reports) {
    totalInstances += report.totalInstances;
    for (const consumer of report.consumers) {
      consumerIds.add(consumer.consumerId);
    }
  }

  return {
    totalComponents: reports.length,
    totalInstances,
    uniqueConsumers: consumerIds.size,
  };
}

function countUniqueConsumers(report: ComponentUsageReport): number {
  return new Set(report.consumers.map((consumer) => consumer.consumerId)).size;
}

function renderUsageBreakdown(usageSummary: ComponentUsageScopeSummary | undefined) {
  if (!usageSummary) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="space-y-1">
      <Badge variant="neutral" className="text-[10px]" title="Unique local component wrappers across consumers">
        {usageSummary.wrapperCount} wrappers across files
      </Badge>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="neutral" className="text-[10px]">Page {usageSummary.usageScope.page}</Badge>
        <Badge variant="neutral" className="text-[10px]">Local {usageSummary.usageScope.localComponent}</Badge>
        <Badge variant="neutral" className="text-[10px]">Nested {usageSummary.usageScope.nestedLocalComponent}</Badge>
      </div>
    </div>
  );
}

export function ConsumerTabByComponent({ dsFileKey, reloadToken = 0 }: ConsumerTabByComponentProps) {
  const { searchQuery, setSearchQuery } = useConsumerFilterParams();
  const [sort, toggleSort] = useSortState<ComponentSortField>({ field: "component", dir: "asc" });
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

  const usageSummaryByComponent = useMemo(
    () => buildComponentUsageScopeSummary(consumers),
    [consumers],
  );
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
            const chip = <span className="truncate max-w-[160px]">{dependencyName}</span>;

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
        if (sort.field === "wrappers") return usageSummaryByComponent.get(report.componentKey)?.wrapperCount ?? Number.NEGATIVE_INFINITY;
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
    usageSummaryByComponent,
    localDependencySummaryByComponent,
    rowMetaByKey,
  ]);

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
              <Badge variant="neutral" className="shrink-0">
                {filteredReports.length} of {reports.length} components
              </Badge>
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
                  label="Wrappers"
                  onSort={() => toggleSort("wrappers")}
                  ariaLabel="Sort by wrappers"
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
                    <TableCell colSpan={6} className="text-muted-foreground">
                      Loading component usage...
                    </TableCell>
                  </TableRow>
                ))
              ) : sortedReports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={Network}
                      title="No matching components"
                      description="Try adjusting the current filters."
                      compact
                    />
                  </TableCell>
                </TableRow>
              ) : (
                sortedReports.map((report) => {
                  const topConsumers = report.consumers.slice(0, 3);
                  const { displayInfo } = getRowMeta(report);
                  return (
                    <TableRow key={report.componentKey}>
                      <TableCell>
                        {renderComponentCell(report)}
                      </TableCell>
                      <TableCell>
                        {displayInfo.variantLabel ? (
                          <Badge variant="neutral">{displayInfo.variantLabel}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="tabular-nums text-foreground">{report.totalInstances}</span>
                      </TableCell>
                      <TableCell>
                        {renderUsageBreakdown(usageSummaryByComponent.get(report.componentKey))}
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
                              <span className="text-xs text-muted-foreground">
                                {usage.instanceCount || 0}
                              </span>
                            </div>
                          ))}
                          {report.consumers.length > topConsumers.length ? (
                            <span className="text-xs text-muted-foreground">
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
        </div>
      </Card>
    </div>
  );
}
