import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState, EmptyStateAction } from "@/components/composites/empty-state";
import { StatusAlert } from "@/components/ui/status-alert";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/overlay/modal";
import { ApiErrorMessage } from "@/components/api-error-message";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import { fetchReportByFile, removeConsumer, syncConsumers } from "@/lib/api";
import { ConsumerCard } from "./consumer-card";
import { Network } from "lucide-react";
import { useConsumerFilterParams } from "../hooks/use-consumer-filter-params";
import type { FileReport } from "@/types/consumers";

interface ConsumerTabByFileProps {
  dsFileKey: string;
  reloadToken?: number;
  onAddConsumer?: () => void;
}

interface RemoveCandidate {
  id: string;
  name: string;
}

export function ConsumerTabByFile({ dsFileKey, reloadToken = 0, onAddConsumer }: ConsumerTabByFileProps) {
  const { staleFilter, setStaleFilter } = useConsumerFilterParams();
  const [reports, setReports] = useState<FileReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReturnType<typeof toApiErrorDisplay> | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncingConsumerId, setSyncingConsumerId] = useState<string | null>(null);
  const [removingConsumerId, setRemovingConsumerId] = useState<string | null>(null);
  const [removeCandidate, setRemoveCandidate] = useState<RemoveCandidate | null>(null);
  const [removeConfirmed, setRemoveConfirmed] = useState(false);

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
  }, [dsFileKey, staleFilter, reloadToken]);

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

  const requestRemove = (consumerId: string, consumerName: string) => {
    setRemoveCandidate({ id: consumerId, name: consumerName });
    setRemoveConfirmed(false);
  };

  const closeRemoveModal = () => {
    if (removingConsumerId) return;
    setRemoveCandidate(null);
    setRemoveConfirmed(false);
  };

  const handleConfirmRemove = async () => {
    if (!removeCandidate) return;

    setRemovingConsumerId(removeCandidate.id);
    setError(null);
    try {
      await removeConsumer(removeCandidate.id);
      await loadReports();
      setRemoveCandidate(null);
      setRemoveConfirmed(false);
    } catch (cause) {
      setError(toApiErrorDisplay(cause, {
        fallbackTitle: "Remove failed",
        fallbackMessage: "Unable to remove this consumer file.",
      }));
    } finally {
      setRemovingConsumerId(null);
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
            onRemove={(id) => requestRemove(id, report.consumerName)}
            removing={removingConsumerId === report.consumerId}
          />
        ))}
      </div>

      <Modal open={!!removeCandidate} onClose={closeRemoveModal}>
        <ModalContent size="md">
          <ModalHeader>
            <h2 id="consumer-remove-confirm-title" className="text-lg font-semibold">
              Remove consumer file
            </h2>
          </ModalHeader>

          <div className="px-5 pb-2">
            <p className="mb-4 text-sm text-muted-foreground">
              This will remove <strong>{removeCandidate?.name}</strong> and all its sync history.
              This action cannot be undone.
            </p>

            <label className="mb-5 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={removeConfirmed}
                onChange={(event) => setRemoveConfirmed(event.target.checked)}
                className="h-4 w-4"
                disabled={!!removingConsumerId}
              />
              <span>I understand and want to continue</span>
            </label>
          </div>

          <ModalFooter>
            <Button variant="outline" onClick={closeRemoveModal} disabled={!!removingConsumerId}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleConfirmRemove()}
              disabled={!removeConfirmed || !!removingConsumerId}
              className="bg-status-error text-status-error-foreground hover:bg-status-error/90"
            >
              {removingConsumerId ? "Removing..." : "Remove consumer"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
