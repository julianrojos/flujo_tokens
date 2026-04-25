import { useEffect, useMemo, useState } from "react";

import { Network } from "lucide-react";
import { ApiErrorMessage } from "@/components/api-error-message";
import { EmptyState, FilterBar, StatsOverview } from "@/components/composites";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { ImpactLevelBadge } from "@/components/ui/impact-level-badge";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import { fetchReportByVariable } from "@/lib/api";
import { useSortState } from "@/lib/use-sort-state";
import { useConsumerFilterParams } from "../hooks/use-consumer-filter-params";
import { SimulateChangePanel } from "./simulate-change-panel";
import type { VariableUsageReport, ImpactLevel } from "@/types/consumers";

interface ConsumerTabByVariableProps {
  dsFileKey: string;
}

interface VariableKpis {
  totalVariables: number;
  totalNodes: number;
  highImpactVariables: number;
  uniqueConsumers: number;
}

type VariableSortField = "name" | "type" | "impact" | "nodes";

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

export function ConsumerTabByVariable({ dsFileKey }: ConsumerTabByVariableProps) {
  const { searchQuery, severityFilter, setSearchQuery, setSeverityFilter } = useConsumerFilterParams();
  const [reports, setReports] = useState<VariableUsageReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReturnType<typeof toApiErrorDisplay> | null>(null);
  const [selectedVariableKey, setSelectedVariableKey] = useState<string | null>(null);
  const [sort, toggleSort] = useSortState<VariableSortField>({ field: "name", dir: "asc" });

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchReportByVariable(dsFileKey);
      setReports(response.data || []);
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
  }, [dsFileKey]);

  const filteredReports = useMemo(() => {
    const lowered = searchQuery.toLowerCase().trim();
    return reports.filter((report) => {
      const matchesSearch =
        !lowered ||
        report.variableName.toLowerCase().includes(lowered) ||
        report.variableKey.toLowerCase().includes(lowered) ||
        report.variableType.toLowerCase().includes(lowered);
      const matchesSeverity =
        severityFilter === "all" || report.impactLevel.level === severityFilter;
      return matchesSearch && matchesSeverity;
    });
  }, [reports, searchQuery, severityFilter]);

  const sortedReports = useMemo(() => {
    return [...filteredReports].sort((a, b) => {
      const valueFor = (report: VariableUsageReport): string | number => {
        if (sort.field === "name") return report.variableName.toLowerCase();
        if (sort.field === "type") return report.variableType.toLowerCase();
        if (sort.field === "impact") return report.impactLevel.level;
        if (sort.field === "nodes") return report.totalNodes;
        return report.consumers.length;
      };

      const aValue = valueFor(a);
      const bValue = valueFor(b);
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sort.dir === "asc" ? comparison : comparison * -1;
    });
  }, [filteredReports, sort]);

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
                {filteredReports.length} of {reports.length} variables
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
                  label="Type"
                  onSort={() => toggleSort("type")}
                  ariaLabel="Sort by type"
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
                  onSort={() => undefined}
                  ariaLabel="Used in"
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
                      title="No matching variables"
                      description="Try adjusting the current filters."
                      compact
                    />
                  </TableCell>
                </TableRow>
              ) : (
                sortedReports.map((report) => {
                  const topConsumers = report.consumers.slice(0, 3);
                  return (
                    <TableRow key={report.variableKey}>
                      <TableCell>
                        <span className="text-foreground">{report.variableName}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs lowercase text-foreground">
                          {report.variableType}
                        </span>
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
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-foreground transition-colors hover:text-primary"
                            >
                              <span className="truncate max-w-[140px]">{usage.consumerName}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {usage.nodeCount || 0}
                              </span>
                            </a>
                          ))}
                          {report.consumers.length > topConsumers.length ? (
                            <span className="px-2 py-1 text-xs text-muted-foreground">
                              +{report.consumers.length - topConsumers.length} more
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedVariableKey(report.variableKey)}
                        >
                          Simulate change
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {selectedVariableKey ? (
        <SimulateChangePanel
          variableKey={selectedVariableKey}
          dsFileKey={dsFileKey}
          onClose={() => setSelectedVariableKey(null)}
        />
      ) : null}
    </div>
  );
}
