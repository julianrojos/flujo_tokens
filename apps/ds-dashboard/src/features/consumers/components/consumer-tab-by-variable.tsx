import { useEffect, useMemo, useState } from "react";

import { Link } from "react-router-dom";
import { Network } from "lucide-react";
import { ApiErrorMessage } from "@/components/api-error-message";
import { EmptyState, FilterBar, StatsOverview } from "@/components/composites";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ImpactLevelBadge } from "@/components/ui/impact-level-badge";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import { fetchReportByVariable, fetchTokenCatalog, listConsumers } from "@/lib/api";
import { toTokenDetail } from "@/lib/routes";
import { useSortState } from "@/lib/use-sort-state";
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
  totalVariables: number;
  totalNodes: number;
  highImpactVariables: number;
  uniqueConsumers: number;
}

type VariableSortField = "name" | "property" | "impact" | "nodes" | "usedIn";
const PARENT_CONSUMER_ID_PREFIX = "parent:" as const;

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
  let totalNodes = 0;
  let highImpactVariables = 0;

  for (const report of reports) {
    totalNodes += report.totalNodes;
    if (report.impactLevel.level === "CRITICAL" || report.impactLevel.level === "HIGH") {
      highImpactVariables += 1;
    }
    for (const consumer of report.consumers) {
      if (isParentConsumerUsage(consumer.consumerId)) continue;
      consumerIds.add(consumer.consumerId);
    }
  }

  return {
    totalVariables: reports.length,
    totalNodes,
    highImpactVariables,
    uniqueConsumers: consumerIds.size,
  };
}

export function ConsumerTabByVariable({ dsFileKey, reloadToken = 0 }: ConsumerTabByVariableProps) {
  const { searchQuery, severityFilter, setSearchQuery, setSeverityFilter } = useConsumerFilterParams();
  const [reports, setReports] = useState<VariableUsageReport[]>([]);
  const [consumers, setConsumers] = useState<ConsumerWithUsageDetails[]>([]);
  const [tokenCatalog, setTokenCatalog] = useState<TokenCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReturnType<typeof toApiErrorDisplay> | null>(null);
  const [sort, toggleSort] = useSortState<VariableSortField>({ field: "name", dir: "asc" });

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const [reportResult, tokenCatalogResult, consumersResult] = await Promise.allSettled([
        fetchReportByVariable(dsFileKey),
        fetchTokenCatalog(),
        listConsumers(dsFileKey),
      ]);

      if (reportResult.status === "rejected") {
        throw reportResult.reason;
      }

      setReports(reportResult.value.data || []);
      if (tokenCatalogResult.status === "fulfilled") {
        setTokenCatalog(tokenCatalogResult.value);
      } else {
        setTokenCatalog(null);
      }
      if (consumersResult.status === "fulfilled") {
        setConsumers(consumersResult.value.data || []);
      } else {
        setConsumers([]);
      }
    } catch (cause) {
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Load reports failed",
          fallbackMessage: "Unable to load variable usage reports.",
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReports();
  }, [dsFileKey, reloadToken]);

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

  const sortedReports = useMemo(() => {
    return [...visibleReports].sort((a, b) => {
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
  }, [visibleReports, sort]);

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
          { id: "variables-total", label: "Total variables", value: kpis.totalVariables },
          { id: "variables-high", label: "High impact", value: kpis.highImpactVariables },
          { id: "variables-nodes", label: "Total nodes", value: kpis.totalNodes },
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
              <Badge variant="neutral" className="shrink-0">
                {visibleReports.length} of {reports.length} variables
              </Badge>
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
          </FilterBar>

          {error ? <ApiErrorMessage error={error} /> : null}

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
                sortedReports.map((report) => {
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
                              <span className="text-foreground/70">
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
        </div>
      </Card>
    </div>
  );
}
