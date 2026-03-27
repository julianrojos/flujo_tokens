import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImpactLevelBadge } from "@/components/ui/impact-level-badge";
import { ConsumerSyncStatusBadge } from "./consumer-sync-status-badge";
import type { DsConsumer, DsSyncRun, ImpactLevel } from "@/types/consumers";

interface ConsumerCardBaseProps {
  consumer: DsConsumer & { latestSync?: DsSyncRun };
  syncing?: boolean;
  removing?: boolean;
}

interface ConsumerCardManagementProps extends ConsumerCardBaseProps {
  mode: "management";
  onSync: (consumerId: string) => void;
  onRemove: (consumerId: string) => void;
  onToggleEnabled: (consumerId: string, enabled: boolean) => void;
}

interface ConsumerCardReportProps extends ConsumerCardBaseProps {
  mode: "report";
  impactLevel: ImpactLevel;
  onSync?: (consumerId: string) => void;
  onRemove?: (consumerId: string) => void;
}

type ConsumerCardProps = ConsumerCardManagementProps | ConsumerCardReportProps;

export function ConsumerCard(props: ConsumerCardProps) {
  const { consumer, syncing = false, removing = false } = props;
  const isManagement = props.mode === "management";
  const canSync = isManagement || typeof props.onSync === "function";
  const canRemove = isManagement || typeof props.onRemove === "function";

  return (
    <Card className="group relative overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold">
              <Link
                to={`/consumers/${consumer.id}`}
                className="hover:underline"
              >
                {consumer.consumerName}
              </Link>
            </h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {consumer.consumerFileKey}
            </p>
          </div>
          <ConsumerSyncStatusBadge
            latestSync={consumer.latestSync}
            syncing={syncing}
          />
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        {consumer.latestSync ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant="neutral">
                {consumer.latestSync.componentCount} components
              </Badge>
              <Badge variant="neutral">
                {consumer.latestSync.variableCount} variables
              </Badge>
              {consumer.latestSync.warningCount > 0 && (
                <Badge variant="warning">
                  {consumer.latestSync.warningCount} warnings
                </Badge>
              )}
            </div>
            {!isManagement ? (
              <div className="pt-1">
                <ImpactLevelBadge level={props.impactLevel} />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No sync data available
          </p>
        )}
      </CardContent>
      {(isManagement || canSync || canRemove) && (
        <CardFooter className="flex justify-between gap-2 border-t border-border/50 bg-muted/30 px-4 py-3">
          {isManagement ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={consumer.enabled}
                onChange={(e) => props.onToggleEnabled(consumer.id, e.target.checked)}
                className="h-4 w-4"
                disabled={syncing || removing}
              />
              <span className="text-muted-foreground">Enabled</span>
            </label>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {canSync && props.onSync ? (
              <Button
                size="sm"
                variant="outline"
                disabled={syncing || removing}
                onClick={() => props.onSync?.(consumer.id)}
              >
                {syncing ? "Syncing..." : "Sync now"}
              </Button>
            ) : null}
            {isManagement ? (
              <Button
                size="sm"
                variant="outline"
                className="text-status-error hover:bg-status-error-bg/10 hover:text-status-error"
                disabled={syncing || removing}
                onClick={() => props.onRemove(consumer.id)}
              >
                {removing ? "Removing..." : "Remove"}
              </Button>
            ) : null}
            {!isManagement && props.onRemove ? (
              <Button
                size="sm"
                variant="outline"
                className="text-status-error hover:bg-status-error-bg/10 hover:text-status-error"
                disabled={syncing || removing}
                onClick={() => props.onRemove?.(consumer.id)}
              >
                {removing ? "Removing..." : "Remove"}
              </Button>
            ) : null}
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
