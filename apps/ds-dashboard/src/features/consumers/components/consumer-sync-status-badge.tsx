import { Badge } from "@/components/ui/badge";
import type { DsSyncRun } from "@/types/consumers";

interface ConsumerSyncStatusBadgeProps {
  latestSync?: DsSyncRun;
  syncing?: boolean;
}

function parseSyncedAt(value: string | undefined): number | null {
  const ms = new Date(String(value || "")).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function ConsumerSyncStatusBadge({ latestSync, syncing }: ConsumerSyncStatusBadgeProps) {
  if (syncing) {
    return (
      <Badge variant="neutral">
        <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
        Syncing...
      </Badge>
    );
  }

  if (!latestSync) {
    return (
      <Badge variant="warning">
        Not synced
      </Badge>
    );
  }

  const status = latestSync.status;
  const syncedAtMs = parseSyncedAt(latestSync.syncedAt);
  const hoursAgo = syncedAtMs === null ? null : Math.floor((Date.now() - syncedAtMs) / (1000 * 60 * 60));

  if (status === 'error') {
    return (
      <Badge variant="error" title={latestSync.errorMessage}>
        Sync error
      </Badge>
    );
  }

  if (status === 'partial') {
    return (
      <Badge variant="warning" title={latestSync.errorMessage}>
        {hoursAgo === null ? "Partial" : `Partial (${hoursAgo}h ago)`}
      </Badge>
    );
  }

  if (status === 'skipped') {
    return (
      <Badge variant="neutral">
        Skipped
      </Badge>
    );
  }

  // status === 'ok'
  if (hoursAgo === null) {
    return (
      <Badge variant="neutral">
        Synced
      </Badge>
    );
  }

  if (hoursAgo > 72) {
    return (
      <Badge variant="warning">
        {hoursAgo}h ago
      </Badge>
    );
  }

  return (
    <Badge variant="success">
      {hoursAgo}h ago
    </Badge>
  );
}
