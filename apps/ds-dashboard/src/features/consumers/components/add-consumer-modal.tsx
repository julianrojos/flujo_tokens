import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalFooter,
} from "@/components/ui/overlay/modal";
import { StatusAlert } from "@/components/ui/status-alert";
import {
  addConsumer,
  type AddConsumerPayload,
  syncConsumers,
} from "@/lib/api";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import { ApiErrorMessage } from "@/components/api-error-message";

interface AddConsumerModalProps {
  open: boolean;
  onClose: () => void;
  dsFileKey: string;
  onSuccess?: () => void;
}

export function AddConsumerModal({
  open,
  onClose,
  dsFileKey,
  onSuccess,
}: AddConsumerModalProps) {
  const [consumerName, setConsumerName] = useState("");
  const [consumerFileUrl, setConsumerFileUrl] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiErrorDisplay> | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload: AddConsumerPayload = {
        dsFileKey,
        consumerName: consumerName.trim(),
        consumerFileUrl: consumerFileUrl.trim() || undefined,
        enabled,
      };

      const created = await addConsumer(payload);
      const consumerId = String(created?.data?.id || "").trim();
      await syncConsumers({
        dsFileKey,
        consumerIds: consumerId ? [consumerId] : undefined,
        // Keep parent-file "Used In" data fresh for token detail views.
        // Tradeoff: adds one extra parent-file scan per sync request.
        captureParentUsage: true,
      });
      onSuccess?.();
      handleClose();
    } catch (cause) {
      setError(toApiErrorDisplay(cause, {
        fallbackTitle: "Add or sync failed",
        fallbackMessage: "Unable to add and sync consumer file.",
      }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setConsumerName("");
    setConsumerFileUrl("");
    setEnabled(true);
    setError(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose}>
      <ModalContent size="md">
        <form onSubmit={handleSubmit}>
          <ModalHeader>
            <h2 className="text-lg font-serif font-semibold">Add Consumer File</h2>
          </ModalHeader>
          <div className="space-y-4 p-5">
            {error ? <ApiErrorMessage error={error} /> : null}

            <div className="space-y-1">
              <label
                htmlFor="consumer-name"
                className="text-xs font-medium text-muted-foreground"
              >
                Consumer name
              </label>
              <Input
                id="consumer-name"
                value={consumerName}
                onChange={(e) => setConsumerName(e.target.value)}
                placeholder="e.g., Marketing Website, Admin Dashboard"
                disabled={submitting}
                required
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="consumer-file-url"
                className="text-xs font-medium text-muted-foreground"
              >
                Figma file URL
              </label>
              <Input
                id="consumer-file-url"
                value={consumerFileUrl}
                onChange={(e) => setConsumerFileUrl(e.target.value)}
                placeholder="https://www.figma.com/file/..."
                disabled={submitting}
                required
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4"
                disabled={submitting}
              />
              <span>Include this file in sync and impact analysis</span>
            </label>

            <StatusAlert variant="info" title="How it works">
              Consumer files will be scanned for design system token usage.
              Sync extracts component and variable references from the Figma
              file.
            </StatusAlert>
          </div>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !consumerName.trim() || !consumerFileUrl.trim()}>
              {submitting ? "Adding and syncing..." : "Add Consumer"}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
