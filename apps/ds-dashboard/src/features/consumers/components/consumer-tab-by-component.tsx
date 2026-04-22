import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/composites/empty-state";
import { StatusAlert } from "@/components/ui/status-alert";
import { ApiErrorMessage } from "@/components/api-error-message";
import { ImpactLevelBadge } from "@/components/ui/impact-level-badge";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import { fetchReportByComponent } from "@/lib/api";
import { useConsumerFilterParams } from "../hooks/use-consumer-filter-params";
import { Network } from "lucide-react";
import type { ComponentUsageReport, ImpactLevel } from "@/types/consumers";

interface ConsumerTabByComponentProps {
  dsFileKey: string;
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
      setError(toApiErrorDisplay(cause, {
        fallbackTitle: "Load reports failed",
        fallbackMessage: "Unable to load component usage reports.",
      }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReports();
  }, [dsFileKey]);

  const filteredReports = reports.filter((report) => {
    const matchesSearch = !searchQuery ||
      report.componentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.componentKey.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSeverity = severityFilter === "all" || report.impactLevel.level === severityFilter;

    return matchesSearch && matchesSeverity;
  });

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Loading component usage...</p>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <EmptyState
        icon={Network}
        title="No component usage data"
        description="Sync consumer files to see component usage across files."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-titles font-semibold titles-color">Component Usage</h2>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            {filteredReports.length} of {reports.length} components
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as ImpactLevel | "all")}
            className="w-40"
          >
            <option value="all">All severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </Select>
          <Input
            placeholder="Search components..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48"
          />
        </div>
      </div>

      {error ? <ApiErrorMessage error={error} /> : null}

      {filteredReports.length === 0 ? (
        <StatusAlert variant="info" title="No matching components">
          No components found matching "{searchQuery}". Try a different search term.
        </StatusAlert>
      ) : (
        <div className="space-y-3">
          {filteredReports.map((report) => (
            <div
              key={report.componentKey}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-titles font-semibold titles-color">
                      {report.componentName}
                    </h3>
                    <ImpactLevelBadge level={report.impactLevel.level} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {report.componentKey}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-2xl font-bold">{report.totalInstances}</p>
                  <p className="text-xs text-muted-foreground">instances</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Used in {report.consumers.length} {report.consumers.length === 1 ? "file" : "files"}:
                </p>
                <div className="flex flex-wrap gap-2">
                  {report.consumers.slice(0, 10).map((usage) => (
                    <a
                      key={usage.consumerId}
                      href={usage.sampleLinks[0] || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    >
                      {usage.consumerName}
                      <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] font-medium">
                        {usage.instanceCount || 0}
                      </span>
                    </a>
                  ))}
                  {report.consumers.length > 10 && (
                    <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                      +{report.consumers.length - 10} more
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
