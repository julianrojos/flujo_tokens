import { useEffect, useMemo, useState } from "react";

import { Network } from "lucide-react";
import { ApiErrorMessage } from "@/components/api-error-message";
import { EmptyState, FilterBar, StatsOverview } from "@/components/composites";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import { splitComponentName } from "@/lib/component-identity";
import { fetchReportByComponent } from "@/lib/api";
import { useConsumerFilterParams } from "../hooks/use-consumer-filter-params";
import type { ComponentUsageReport } from "@/types/consumers";

interface ConsumerTabByComponentProps {
  dsFileKey: string;
}

interface ComponentKpis {
  totalComponents: number;
  totalInstances: number;
  uniqueConsumers: number;
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

export function ConsumerTabByComponent({ dsFileKey }: ConsumerTabByComponentProps) {
  const { searchQuery, setSearchQuery } = useConsumerFilterParams();
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
      return matchesSearch;
    });
  }, [reports, searchQuery]);

  const sortedReports = useMemo(() => {
    return [...filteredReports].sort((a, b) => a.componentName.localeCompare(b.componentName));
  }, [filteredReports]);

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

          {error ? <ApiErrorMessage error={error} /> : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead>Variant</TableHead>
                <TableHead>Instances</TableHead>
                <TableHead>Used in</TableHead>
                <TableHead>Consumers</TableHead>
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
                sortedReports.map((report) => {
                  const topConsumers = report.consumers.slice(0, 3);
                  const { parentName, variantLabel } = splitComponentName(report.componentName);
                  return (
                    <TableRow key={report.componentKey}>
                      <TableCell>
                        <span className="text-foreground">{parentName}</span>
                      </TableCell>
                      <TableCell>
                        {variantLabel ? (
                          <Badge variant="neutral">{variantLabel}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
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
