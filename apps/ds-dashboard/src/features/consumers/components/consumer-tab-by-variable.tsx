import { useEffect, useMemo, useState } from "react";

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Network } from "lucide-react";
import { ApiErrorMessage } from "@/components/api-error-message";
import { EmptyState, FilterBar, StatsOverview } from "@/components/composites";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ImpactLevelBadge } from "@/components/ui/impact-level-badge";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import { fetchReportByVariable, fetchTokenCatalog, listConsumers } from "@/lib/api";
import { toTokenDetail } from "@/lib/routes";
import { useSortState } from "@/lib/use-sort-state";
import { shouldAllowShowAll, shouldShowPageSizeSelect } from "@/lib/table-pagination";
import { QUERY_DEFAULTS } from "@/lib/query-client";
import { useConsumerFilterParams } from "../hooks/use-consumer-filter-params";
import type { VariableUsageReport, ImpactLevel } from "@/types/consumers";
import type { TokenCatalog, TokenCatalogEntry } from "@/types/token-catalog";
import type { ConsumerWithUsageDetails } from "../lib/usage-details-summary";
import { buildVariableBindingFieldSummary } from "../lib/usage-details-summary";

interface ConsumerTabByVariableProps {
  dsFileKey: string;
  reloadToken?: number;
}

interface VariableKpis {
  highImpactVariables: number;
  uniqueConsumers: number;
}

interface ConsumerTabByVariableData {
  reports: VariableUsageReport[];
  consumers: ConsumerWithUsageDetails[];
  tokenCatalog: TokenCatalog | null;
}

type VariableSortField = "name" | "property" | "impact" | "nodes" | "usedIn";
const PARENT_CONSUMER_ID_PREFIX = "parent:" as const;
const PAGE_SIZE_OPTIONS = [25, 50, 75, 100, 125, 150, 175] as const;
const PAGE_SIZE_ALL = "all";

function isParentConsumerUsage(consumerId: string): boolean {
  return String(consumerId || "").startsWith(PARENT_CONSUMER_ID_PREFIX);
}

function normalizeTokenLookupKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^_+/, "")
    .replace(/^semanticos[./]/, "")
    .replace(/^primitivos[./]/, "")
    .replace(/^theme[./]/, "")
    .replace(/^tokens?[./]/, "")
    .replace(/^--+/, "")
    .replace(/[._]+/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function buildTokenPathLookup(entries: TokenCatalogEntry[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const entry of entries) {
    for (const ref of [entry.path, entry.slashPath, entry.cssVar]) {
      const key = normalizeTokenLookupKey(ref);
      if (!key) continue;
      if (!lookup.has(key)) {
        lookup.set(key, entry.path);
      }
    }
  }
  return lookup;
}

function computeKpis(reports: VariableUsageReport[]): VariableKpis {
  const consumerIds = new Set<string>();
  let highImpactVariables = 0;

  for (const report of reports) {
    if (report.impactLevel.level === "CRITICAL" || report.impactLevel.level === "HIGH") {
      highImpactVariables += 1;
    }
    for (const consumer of report.consumers) {
      if (isParentConsumerUsage(consumer.consumerId)) continue;
      consumerIds.add(consumer.consumerId);
    }
  }

  return {
    highImpactVariables,
    uniqueConsumers: consumerIds.size,
  };
}

async function loadVariableTabByVariableData(dsFileKey: string): Promise<ConsumerTabByVariableData> {
  const [reportResult, tokenCatalogResult, consumersResult] = await Promise.allSettled([
    fetchReportByVariable(dsFileKey),
    fetchTokenCatalog(),
    listConsumers(dsFileKey),
  ]);

  if (reportResult.status === "rejected") {
    throw reportResult.reason;
  }

  return {
    reports: reportResult.value.data || [],
    tokenCatalog: tokenCatalogResult.status === "fulfilled" ? tokenCatalogResult.value : null,
    consumers: consumersResult.status === "fulfilled" ? consumersResult.value.data || [] : [],
  };
}

export function ConsumerTabByVariable({ dsFileKey, reloadToken = 0 }: ConsumerTabByVariableProps) {
  const { searchQuery, severityFilter, setSearchQuery, setSeverityFilter } = useConsumerFilterParams();
  const [sort, toggleSort] = useSortState<VariableSortField>({ field: "name", dir: "asc" });
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [pageSize, setPageSize] = useState<string>("25");
  const [currentPage, setCurrentPage] = useState(1);
  const query = useQuery<ConsumerTabByVariableData>({
    queryKey: ["consumer-tab-by-variable", dsFileKey, reloadToken],
    enabled: Boolean(dsFileKey),
    queryFn: async () => loadVariableTabByVariableData(dsFileKey),
    ...QUERY_DEFAULTS,
  });

  const reports = query.data?.reports ?? [];
  const consumers = query.data?.consumers ?? [];
  const tokenCatalog = query.data?.tokenCatalog ?? null;
  const loading = query.isLoading;
  const error = query.error
    ? toApiErrorDisplay(query.error, {
        fallbackTitle: "Load reports failed",
        fallbackMessage: "Unable to load variable usage reports.",
      })
    : null;

  const filteredReports = useMemo(() => {
    const lowered = searchQuery.toLowerCase().trim();
    return reports.filter((report) => {
      const matchesSearch =
        !lowered ||
        report.variableName.toLowerCase().includes(lowered) ||
        report.variableKey.toLowerCase().includes(lowered);
      const matchesSeverity =
        severityFilter === "all" || report.impactLevel.level === severityFilter;
      return matchesSearch && matchesSeverity;
    });
  }, [reports, searchQuery, severityFilter]);

  const visibleReports = useMemo(() => {
    return filteredReports.filter((report) =>
      report.consumers.some((consumer) => !isParentConsumerUsage(consumer.consumerId)),
    );
  }, [filteredReports]);

  const tokenPathByLookup = useMemo(
    () => buildTokenPathLookup(tokenCatalog?.entries || []),
    [tokenCatalog],
  );
  const bindingFieldsByVariable = useMemo(
    () => buildVariableBindingFieldSummary(consumers),
    [consumers],
  );
  const propertyOptions = useMemo(() => {
    const values = new Set<string>();

    for (const report of visibleReports) {
      for (const entry of bindingFieldsByVariable.get(report.variableKey) || []) {
        const field = String(entry.field || "").trim();
        if (field) values.add(field);
      }
    }

    return Array.from(values).sort((left, right) => left.localeCompare(right));
  }, [bindingFieldsByVariable, visibleReports]);

  const propertyFilteredReports = useMemo(() => {
    if (propertyFilter === "all") {
      return visibleReports;
    }

    return visibleReports.filter((report) =>
      (bindingFieldsByVariable.get(report.variableKey) || []).some(
        (entry) => entry.field === propertyFilter,
      ),
    );
  }, [bindingFieldsByVariable, propertyFilter, visibleReports]);

  useEffect(() => {
    if (propertyFilter === "all") return;
    if (propertyOptions.includes(propertyFilter)) return;
    setPropertyFilter("all");
  }, [propertyFilter, propertyOptions]);

  const sortedReports = useMemo(() => {
    return [...propertyFilteredReports].sort((a, b) => {
      const valueFor = (report: VariableUsageReport): string | number => {
        const visibleConsumers = report.consumers.filter((consumer) => !isParentConsumerUsage(consumer.consumerId));
        const fieldSummary = (bindingFieldsByVariable.get(report.variableKey) || [])
          .slice(0, 3)
          .map((entry) => `${entry.field}:${entry.count}`)
          .join(", ");
        if (sort.field === "name") return report.variableName.toLowerCase();
        if (sort.field === "property") return fieldSummary.toLowerCase();
        if (sort.field === "impact") return report.impactLevel.level;
        if (sort.field === "nodes") return report.totalNodes;
        if (sort.field === "usedIn") return visibleConsumers.length;
        return visibleConsumers.length;
      };

      const aValue = valueFor(a);
      const bValue = valueFor(b);
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sort.dir === "asc" ? comparison : comparison * -1;
    });
  }, [bindingFieldsByVariable, propertyFilteredReports, sort]);
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
  }, [pageSize, pageSizeOptions, propertyFilter, searchQuery, severityFilter, sortedReports.length]);

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

  function resolveTokenPathForReport(report: VariableUsageReport): string | null {
    const directTokenPath = tokenCatalog?.byVariableId?.[report.variableKey]?.path;
    if (directTokenPath) {
      return directTokenPath;
    }
    for (const candidate of [report.variableName, report.variableKey]) {
      const key = normalizeTokenLookupKey(candidate);
      if (!key) continue;
      const resolved = tokenPathByLookup.get(key);
      if (resolved) return resolved;
    }
    return null;
  }

  const kpis = useMemo(() => computeKpis(reports), [reports]);
  const totalVariablesUsed = visibleReports.length;
  const designSystemVariablesUsed = useMemo(() => {
    return visibleReports.filter((report) => resolveTokenPathForReport(report) != null).length;
  }, [tokenCatalog, tokenPathByLookup, visibleReports]);
  const designSystemVariablesUsePercentage = useMemo(() => {
    if (totalVariablesUsed === 0) {
      return null;
    }
    return designSystemVariablesUsed / totalVariablesUsed;
  }, [designSystemVariablesUsed, totalVariablesUsed]);

  if (!loading && reports.length === 0) {
    return (
      <Card className="p-5 text-card-foreground backdrop-blur-sm">
        <EmptyState
          icon={Network}
          title="No variable usage data"
          description="Sync consumer files to see variable usage across files."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <StatsOverview
        items={[
          {
            id: "variables-ds-use",
            label: "Design system variables use",
            value: (
              <span className="inline-flex items-baseline gap-2">
                <span className="tabular-nums text-foreground">{designSystemVariablesUsed}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  (
                  {designSystemVariablesUsePercentage != null
                    ? `${Math.round(designSystemVariablesUsePercentage * 100)}%`
                    : "—"}
                  )
                </span>
              </span>
            ),
          },
          { id: "variables-high", label: "High impact", value: kpis.highImpactVariables },
          { id: "variables-consumers", label: "Unique consumers", value: kpis.uniqueConsumers },
        ]}
      />

      <Card className="p-5 text-card-foreground backdrop-blur-sm">
        <div className="space-y-4">
          <FilterBar
            searchValue={searchQuery}
            onSearch={setSearchQuery}
            searchPlaceholder="Search variables"
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
          >
            <Select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value as ImpactLevel | "all")}
              className="w-40"
            >
              <option value="all">All severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </Select>
            <Select
              value={propertyFilter}
              onChange={(event) => setPropertyFilter(event.target.value)}
              className="w-40"
            >
              <option value="all">Property: All</option>
              {propertyOptions.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </Select>
          </FilterBar>

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
                  label="Variable"
                  onSort={() => toggleSort("name")}
                  ariaLabel="Sort by variable"
                />
                <SortableTableHead
                  label="Property"
                  onSort={() => toggleSort("property")}
                  ariaLabel="Sort by property"
                />
                <SortableTableHead
                  label="Impact"
                  onSort={() => toggleSort("impact")}
                  ariaLabel="Sort by impact"
                />
                <SortableTableHead
                  label="Instances"
                  onSort={() => toggleSort("nodes")}
                  ariaLabel="Sort by instances"
                />
                <SortableTableHead
                  label="Used in"
                  onSort={() => toggleSort("usedIn")}
                  ariaLabel="Sort by used in"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={`variable-loading-${index}`}>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Loading variable usage...
                    </TableCell>
                  </TableRow>
                ))
              ) : sortedReports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="p-0">
                    <EmptyState
                      icon={Network}
                      title="No variable usage data"
                      description="Try adjusting the current filters or sync consumer files with real variable usage."
                      compact
                    />
                  </TableCell>
                </TableRow>
              ) : (
                pagedReports.map((report) => {
                  const visibleConsumers = report.consumers.filter((consumer) => !isParentConsumerUsage(consumer.consumerId));
                  const topConsumers = visibleConsumers.slice(0, 3);
                  const resolvedTokenPath = resolveTokenPathForReport(report);
                  return (
                    <TableRow key={report.variableKey}>
                      <TableCell>
                        {resolvedTokenPath ? (
                          <Link
                            to={toTokenDetail(resolvedTokenPath)}
                            className="text-foreground hover:text-primary"
                            aria-label={`Open ${report.variableName} detail`}
                          >
                            {report.variableName}
                          </Link>
                        ) : (
                          <span className="text-foreground">{report.variableName}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                          {(bindingFieldsByVariable.get(report.variableKey) || []).map((entry) => (
                            <span key={entry.field} className="text-foreground">
                              {entry.field}
                            </span>
                          ))}
                          {bindingFieldsByVariable.get(report.variableKey)?.length ? null : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <ImpactLevelBadge level={report.impactLevel.level} />
                      </TableCell>
                      <TableCell>
                        <span className="tabular-nums text-foreground">{report.totalNodes}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {topConsumers.map((usage) => (
                            <a
                              key={usage.consumerId}
                              href={usage.sampleLinks[0] || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 text-foreground transition-colors hover:text-primary"
                            >
                              <span className="truncate max-w-[140px]">{usage.consumerName}</span>
                              <span className="inline-flex min-w-6 items-center justify-center rounded-full border border-border/60 bg-[var(--app-surface-1)] px-1.5 py-0.5 text-[10px] tabular-nums text-foreground/70">
                                {usage.nodeCount || 0}
                              </span>
                            </a>
                          ))}
                          {visibleConsumers.length > topConsumers.length ? (
                            <span className="px-2 py-1 text-muted-foreground">
                              +{visibleConsumers.length - topConsumers.length} more
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
