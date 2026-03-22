import { Badge } from "@/components/ui/badge";
import type { DsSyncRun } from "@/types/consumers";

interface ConsumerSyncStatusBadgeProps {
  latestSync?: DsSyncRun;
  syncing?: boolean;
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
  const syncedAt = new Date(latestSync.syncedAt);
  const hoursAgo = Math.floor((Date.now() - syncedAt.getTime()) / (1000 * 60 * 60));

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
        Partial ({hoursAgo}h ago)
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
