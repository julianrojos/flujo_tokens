import { useEffect, useMemo, useState } from "react";

import { Network } from "lucide-react";
import { ApiErrorMessage } from "@/components/api-error-message";
import { EmptyState, FilterBar, StatsOverview } from "@/components/composites";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { ImpactLevelBadge } from "@/components/ui/impact-level-badge";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import { splitComponentName } from "@/lib/component-identity";
import { fetchReportByComponent } from "@/lib/api";
import { useConsumerFilterParams } from "../hooks/use-consumer-filter-params";
import type { ComponentUsageReport, ImpactLevel } from "@/types/consumers";

interface ConsumerTabByComponentProps {
  dsFileKey: string;
}

interface ComponentKpis {
  totalComponents: number;
  totalInstances: number;
  highImpactComponents: number;
  uniqueConsumers: number;
}

function computeKpis(reports: ComponentUsageReport[]): ComponentKpis {
  const consumerIds = new Set<string>();
  let totalInstances = 0;
  let highImpactComponents = 0;

  for (const report of reports) {
    totalInstances += report.totalInstances;
    if (report.impactLevel.level === "CRITICAL" || report.impactLevel.level === "HIGH") {
      highImpactComponents += 1;
    }
    for (const consumer of report.consumers) {
      consumerIds.add(consumer.consumerId);
    }
  }

  return {
    totalComponents: reports.length,
    totalInstances,
    highImpactComponents,
    uniqueConsumers: consumerIds.size,
  };
}

export function ConsumerTabByComponent({ dsFileKey }: ConsumerTabByComponentProps) {
  const { searchQuery, severityFilter, setSearchQuery, setSeverityFilter } = useConsumerFilterParams();
  const [reports, setReports] = useState<ComponentUsageReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReturnType<typeof toApiErrorDisplay> | null>(null);

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchReportByComponent(dsFileKey);
      setReports(response.data || []);
    } catch (cause) {
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Load reports failed",
          fallbackMessage: "Unable to load component usage reports.",
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
        report.componentName.toLowerCase().includes(lowered) ||
        report.componentKey.toLowerCase().includes(lowered);
      const matchesSeverity =
        severityFilter === "all" || report.impactLevel.level === severityFilter;
      return matchesSearch && matchesSeverity;
    });
  }, [reports, searchQuery, severityFilter]);

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
          { id: "components-high", label: "High impact", value: kpis.highImpactComponents },
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
                <SortableTableHead label="Component" onSort={() => undefined} ariaLabel="Component" />
                <SortableTableHead label="Variant" onSort={() => undefined} ariaLabel="Variant" />
                <SortableTableHead label="Impact" onSort={() => undefined} ariaLabel="Impact" />
                <SortableTableHead label="Instances" onSort={() => undefined} ariaLabel="Instances" />
                <SortableTableHead
                  label="Used in"
                  onSort={() => undefined}
                  ariaLabel="Used in"
                />
                <SortableTableHead
                  label="Consumers"
                  onSort={() => undefined}
                  ariaLabel="Consumers"
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
              ) : filteredReports.length === 0 ? (
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
                filteredReports.map((report) => {
                  const topConsumers = report.consumers.slice(0, 3);
                  const { variantLabel } = splitComponentName(report.componentName);
                  return (
                    <TableRow key={report.componentKey}>
                      <TableCell>
                        <span className="text-foreground">{report.componentName}</span>
                      </TableCell>
                      <TableCell>
                        {variantLabel ? (
                          <Badge variant="neutral">{variantLabel}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ImpactLevelBadge level={report.impactLevel.level} />
                      </TableCell>
                      <TableCell>
                        <span className="tabular-nums text-foreground">{report.totalInstances}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {report.consumers.length} {report.consumers.length === 1 ? "file" : "files"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {topConsumers.map((usage) => (
                            <a
                              key={usage.consumerId}
                              href={usage.sampleLinks[0] || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-surface-1 px-2 py-1 text-xs text-foreground transition-colors hover:border-border hover:bg-surface-2"
                            >
                              <span className="truncate max-w-[140px]">{usage.consumerName}</span>
                              <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {usage.instanceCount || 0}
                              </span>
                            </a>
                          ))}
                          {report.consumers.length > topConsumers.length ? (
                            <span className="rounded-md border border-border/70 bg-surface-1 px-2 py-1 text-xs text-muted-foreground">
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
