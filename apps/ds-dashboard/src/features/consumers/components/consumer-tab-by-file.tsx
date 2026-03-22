import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState, EmptyStateAction } from "@/components/composites/empty-state";
import { StatusAlert } from "@/components/ui/status-alert";
import { ApiErrorMessage } from "@/components/api-error-message";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import { fetchReportByFile, syncConsumers } from "@/lib/api";
import { ConsumerCard } from "./consumer-card";
import { Network } from "lucide-react";
import { useConsumerFilterParams } from "../hooks/use-consumer-filter-params";
import type { FileReport } from "@/types/consumers";

interface ConsumerTabByFileProps {
  dsFileKey: string;
  onAddConsumer?: () => void;
}

export function ConsumerTabByFile({ dsFileKey, onAddConsumer }: ConsumerTabByFileProps) {
  const { staleFilter, setStaleFilter } = useConsumerFilterParams();
  const [reports, setReports] = useState<FileReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReturnType<typeof toApiErrorDisplay> | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncingConsumerId, setSyncingConsumerId] = useState<string | null>(null);

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchReportByFile(dsFileKey, {
        staleOnly: staleFilter,
      });
      setReports(response.data || []);
    } catch (cause) {
      setError(toApiErrorDisplay(cause, {
        fallbackTitle: "Load reports failed",
        fallbackMessage: "Unable to load consumer file reports.",
      }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReports();
  }, [dsFileKey, staleFilter]);

  const handleSync = async (consumerId?: string, force = false) => {
    if (consumerId) {
      setSyncingConsumerId(consumerId);
    } else {
      setSyncing(true);
    }

    setError(null);
    try {
      await syncConsumers({
        dsFileKey,
        consumerIds: consumerId ? [consumerId] : undefined,
        force,
      });
      await loadReports();
    } catch (cause) {
      setError(toApiErrorDisplay(cause, {
        fallbackTitle: "Sync failed",
        fallbackMessage: "Unable to sync consumer files.",
      }));
    } finally {
      setSyncing(false);
      setSyncingConsumerId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Loading consumer files...</p>
      </div>
    );
  }

  if (reports.length === 0 && staleFilter) {
    return (
      <StatusAlert variant="info" title="No stale consumers">
        No consumer files older than 72 hours were found.
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={() => setStaleFilter(false)}>
            Show all consumers
          </Button>
        </div>
      </StatusAlert>
    );
  }

  if (reports.length === 0) {
    return (
      <EmptyState
        icon={Network}
        title="No consumer files yet"
        description="Register Figma files that consume this design system to track cross-file impact."
        action={
          <EmptyStateAction onClick={onAddConsumer}>
            Add first consumer
          </EmptyStateAction>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">Consumer Files Overview</h3>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            {reports.length} {reports.length === 1 ? "file" : "files"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-1.5 text-sm">
            <input
              type="checkbox"
              checked={staleFilter}
              onChange={(e) => setStaleFilter(e.target.checked)}
              className="h-4 w-4"
            />
            <span>Show stale only</span>
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleSync()}
            disabled={syncing}
          >
            {syncing ? "Syncing..." : "Sync changed"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleSync(undefined, true)}
            disabled={syncing}
          >
            Force re-sync all
          </Button>
        </div>
      </div>

      {error ? <ApiErrorMessage error={error} /> : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => (
          <ConsumerCard
            key={report.consumerId}
            mode="report"
            consumer={{
              id: report.consumerId,
              dsFileKey: "",
              consumerFileKey: report.consumerFileKey,
              consumerName: report.consumerName,
              enabled: true,
              createdAt: report.lastSyncedAt,
              latestSync: {
                id: "",
                consumerId: report.consumerId,
                syncedAt: report.lastSyncedAt,
                durationMs: 0,
                status: report.status,
                componentCount: report.componentCount,
                variableCount: report.variableCount,
                warningCount: report.warningCount,
              },
            }}
            impactLevel={report.impactLevel.level}
            syncing={syncingConsumerId === report.consumerId}
            onSync={(id) => void handleSync(id)}
          />
        ))}
      </div>
    </div>
  );
}
