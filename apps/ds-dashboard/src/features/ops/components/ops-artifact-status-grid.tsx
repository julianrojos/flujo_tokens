/**
 * Ops Artifact Status Grid - displays system artifact statuses.
 */

import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/composites/section-header";
import { Button } from "@/components/ui/button";
import type { ArtifactMeta } from "../lib/operations-artifacts";
import { formatRelativeTime } from "@/hooks/use-operation-runner";

interface OpsArtifactStatusGridProps {
  artifacts: ArtifactMeta[];
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function OpsArtifactStatusGrid({ artifacts, isRefreshing, onRefresh }: OpsArtifactStatusGridProps) {
  return (
    <section className="space-y-3">
      <SectionHeader
        title="Estado del sistema"
        badge="Artefactos"
        action={
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isRefreshing} aria-label="Refresh artifact statuses">
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            Actualizar
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {artifacts.map((artifact) => {
          const Icon = artifact.icon;
          const hasDate = !!artifact.generatedAt;
          return (
            <div
              key={artifact.id}
              className="flex flex-col p-4 rounded-xl border border-border/70 bg-card/50 shadow-sm gap-2"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{artifact.label}</span>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full shrink-0",
                      !hasDate ? "bg-muted-foreground/40" : artifact.isStale ? "bg-status-warning" : "bg-status-success"
                    )}
                  />
                  <span
                    className={cn(
                      "text-xs font-medium tabular-nums",
                      artifact.isStale ? "text-status-warning" : !hasDate ? "text-muted-foreground/60" : ""
                    )}
                  >
                    {hasDate ? formatRelativeTime(artifact.generatedAt) : "Sin datos"}
                  </span>
                </div>

                {artifact.summary && (
                  <p className="text-[11px] text-muted-foreground leading-tight pl-3.5 truncate">
                    {artifact.summary}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
