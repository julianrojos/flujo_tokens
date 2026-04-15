import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/composites/empty-state";
import { StatusAlert } from "@/components/ui/status-alert";
import { ApiErrorMessage } from "@/components/api-error-message";
import { ImpactLevelBadge } from "@/components/ui/impact-level-badge";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import { fetchReportByVariable } from "@/lib/api";
import { useConsumerFilterParams } from "../hooks/use-consumer-filter-params";
import { SimulateChangePanel } from "./simulate-change-panel";
import { Network } from "lucide-react";
import type { VariableUsageReport, ImpactLevel } from "@/types/consumers";

interface ConsumerTabByVariableProps {
  dsFileKey: string;
}

export function ConsumerTabByVariable({ dsFileKey }: ConsumerTabByVariableProps) {
  const { searchQuery, severityFilter, setSearchQuery, setSeverityFilter } = useConsumerFilterParams();
  const [reports, setReports] = useState<VariableUsageReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReturnType<typeof toApiErrorDisplay> | null>(null);
  const [selectedVariableKey, setSelectedVariableKey] = useState<string | null>(null);

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchReportByVariable(dsFileKey);
      setReports(response.data || []);
    } catch (cause) {
      setError(toApiErrorDisplay(cause, {
        fallbackTitle: "Load reports failed",
        fallbackMessage: "Unable to load variable usage reports.",
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
      report.variableName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.variableKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.variableType.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSeverity = severityFilter === "all" || report.impactLevel.level === severityFilter;

    return matchesSearch && matchesSeverity;
  });

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Loading variable usage...</p>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <EmptyState
        icon={Network}
        title="No variable usage data"
        description="Sync consumer files to see variable usage across files."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-titles font-semibold">Variable Usage</h3>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            {filteredReports.length} of {reports.length} variables
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
            placeholder="Search variables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48"
          />
        </div>
      </div>

      {error ? <ApiErrorMessage error={error} /> : null}

      {filteredReports.length === 0 ? (
        <StatusAlert variant="info" title="No matching variables">
          No variables found matching "{searchQuery}". Try a different search term.
        </StatusAlert>
      ) : (
        <div className="space-y-3">
          {filteredReports.map((report) => (
            <div
              key={report.variableKey}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="truncate text-sm font-titles font-semibold">
                      {report.variableName}
                    </h4>
                    <ImpactLevelBadge level={report.impactLevel.level} />
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {report.variableType}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {report.variableKey}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-2xl font-bold">{report.totalNodes}</p>
                    <p className="text-xs text-muted-foreground">nodes</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedVariableKey(report.variableKey)}
                  >
                    Simulate change →
                  </Button>
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
                        {usage.nodeCount || 0}
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

      {selectedVariableKey && (
        <SimulateChangePanel
          variableKey={selectedVariableKey}
          dsFileKey={dsFileKey}
          onClose={() => setSelectedVariableKey(null)}
        />
      )}
    </div>
  );
}
