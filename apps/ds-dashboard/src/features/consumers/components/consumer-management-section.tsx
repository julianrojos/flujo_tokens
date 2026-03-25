import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { StatusAlert } from "@/components/ui/status-alert";
import { ApiErrorMessage } from "@/components/api-error-message";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import {
  listConsumers,
  removeConsumer,
  syncConsumers,
  updateConsumer,
  type ListConsumersResponse,
} from "@/lib/api";
import { AddConsumerModal } from "./add-consumer-modal";
import { ConsumerCard } from "./consumer-card";

interface ConsumerManagementSectionProps {
  dsFileKey: string;
}

export function ConsumerManagementSection({ dsFileKey }: ConsumerManagementSectionProps) {
  const [consumers, setConsumers] = useState<ListConsumersResponse["data"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReturnType<typeof toApiErrorDisplay> | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [syncingConsumerId, setSyncingConsumerId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  const loadConsumers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listConsumers(dsFileKey);
      setConsumers(response.data || []);
    } catch (cause) {
      setError(toApiErrorDisplay(cause, {
        fallbackTitle: "Load consumers failed",
        fallbackMessage: "Unable to load consumer files.",
      }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConsumers();
  }, [dsFileKey]);

  const handleAddSuccess = () => {
    void loadConsumers();
  };

  const handleSync = async (consumerId?: string) => {
    if (consumerId) {
      setSyncingConsumerId(consumerId);
    } else {
      setSyncingAll(true);
    }

    setError(null);
    try {
      await syncConsumers({
        dsFileKey,
        consumerIds: consumerId ? [consumerId] : undefined,
        force: false,
        // Keep parent-file "Used In" data fresh for token detail views.
        // Tradeoff: adds one extra parent-file scan per sync request.
        captureParentUsage: true,
      });
      await loadConsumers();
    } catch (cause) {
      setError(toApiErrorDisplay(cause, {
        fallbackTitle: "Sync failed",
        fallbackMessage: "Unable to sync consumer files.",
      }));
    } finally {
      setSyncingConsumerId(null);
      setSyncingAll(false);
    }
  };

  const handleRemove = async (consumerId: string) => {
    if (!window.confirm("Are you sure you want to remove this consumer? This action cannot be undone.")) {
      return;
    }

    setError(null);
    try {
      await removeConsumer(consumerId);
      await loadConsumers();
    } catch (cause) {
      setError(toApiErrorDisplay(cause, {
        fallbackTitle: "Remove failed",
        fallbackMessage: "Unable to remove consumer file.",
      }));
    }
  };

  const handleToggleEnabled = async (consumerId: string, enabled: boolean) => {
    setError(null);
    try {
      await updateConsumer(consumerId, { enabled });
      await loadConsumers();
    } catch (cause) {
      setError(toApiErrorDisplay(cause, {
        fallbackTitle: "Update failed",
        fallbackMessage: "Unable to update consumer.",
      }));
    }
  };

  if (!dsFileKey) {
    return (
      <StatusAlert variant="warning" title="Figma File ID required">
        Set the Figma File ID in Design Systems Admin to enable consumer file tracking.
      </StatusAlert>
    );
  }

  return (
    <section className="mt-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-serif font-semibold">Consumer Files</h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddModalOpen(true)}
            disabled={syncingAll}
          >
            Add Consumer File
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleSync()}
            disabled={syncingAll || consumers.length === 0}
          >
            {syncingAll ? "Syncing..." : "Sync changed"}
          </Button>
        </div>
      </div>

      {error ? <ApiErrorMessage error={error} /> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading consumers...</p>
      ) : consumers.length === 0 ? (
        <StatusAlert variant="info" title="No consumer files">
          Add your first consumer file to start tracking cross-file token usage.
        </StatusAlert>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {consumers.map((consumer) => (
            <ConsumerCard
              key={consumer.id}
              mode="management"
              consumer={consumer}
              syncing={syncingConsumerId === consumer.id}
              onSync={(id) => void handleSync(id)}
              onRemove={(id) => void handleRemove(id)}
              onToggleEnabled={(id, enabled) => void handleToggleEnabled(id, enabled)}
            />
          ))}
        </div>
      )}

      <AddConsumerModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        dsFileKey={dsFileKey}
        onSuccess={handleAddSuccess}
      />
    </section>
  );
}
