/**
 * Token Diff Impact Panel - displays selected token impact details.
 */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TokenUsageEntry } from "@/types/token-usage-index";
import type { DiffTableRow } from "../hooks/use-token-diff";
import { summarizeOwners, badgeForChange, formatImpactCount } from "../lib/token-diff-transforms";

interface TokenDiffImpactPanelProps {
  selected: DiffTableRow;
  usageEntry: TokenUsageEntry | null;
  unresolvedHits: Array<{
    kind: string;
    source: string;
    owner: string;
    keyPath: string;
    tokenPath: string;
    reason: string;
    suggested?: string | null;
  }>;
  graphImpact: { dependents: string[]; dependencies: string[] };
  onClose: () => void;
}

export function TokenDiffImpactPanel({
  selected,
  usageEntry,
  unresolvedHits,
  graphImpact,
  onClose,
}: TokenDiffImpactPanelProps) {
  const owners = useMemo(() => {
    if (!usageEntry) return [];
    return summarizeOwners(usageEntry.usedIn || [], 8);
  }, [usageEntry]);

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[420px] max-w-[calc(100vw-2rem)] rounded-xl border border-border/70 bg-card/95 shadow-panel backdrop-blur-lg" role="dialog" aria-label="Token impact details">
      <div className="flex items-start justify-between gap-3 border-b border-border/70 p-4">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Token impact
          </div>
          <div className="font-mono text-xs">{selected.tokenPath}</div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant={badgeForChange(selected.kind, selected.change_class)}>
              {selected.kind} · {selected.change_class}
            </Badge>
            {usageEntry ? (
              <Badge variant="neutral">{usageEntry.usageCount} uses</Badge>
            ) : (
              <Badge variant="neutral">usage unknown</Badge>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close impact panel">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/70 bg-background/60 p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Uses
            </div>
            <div className="mt-2 text-xl font-semibold">
              {formatImpactCount(usageEntry?.usageCount ?? null)}
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/60 p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Dependents
            </div>
            <div className="mt-2 text-xl font-semibold">
              {graphImpact.dependents.length}
            </div>
          </div>
        </div>

        {selected.kind === "removed" ? (
          <div className="rounded-lg border border-border/70 bg-background/60 p-3">
            <div className="text-sm font-semibold">Unresolved references</div>
            <div className="mt-2 text-xs text-muted-foreground">
              {unresolvedHits.length
                ? `${unresolvedHits.length} refs still pointing to this token/css var.`
                : "No unresolved references matched for this token in the current usage index."}
            </div>
          </div>
        ) : null}

        {owners.length ? (
          <div>
            <div className="mb-2 text-sm font-semibold">Top owners</div>
            <div className="flex flex-wrap gap-2">
              {owners.map((row) => (
                <Badge key={row.owner} variant="neutral">
                  {row.owner} · {row.count}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4">
          <div>
            <div className="mb-2 text-sm font-semibold">Dependents</div>
            {graphImpact.dependents.length ? (
              <div className="flex flex-wrap gap-2">
                {graphImpact.dependents.slice(0, 12).map((dep) => (
                  <Badge key={dep} variant="neutral">
                    {dep}
                  </Badge>
                ))}
                {graphImpact.dependents.length > 12 ? (
                  <Badge variant="neutral">
                    +{graphImpact.dependents.length - 12} more
                  </Badge>
                ) : null}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No dependents found.</div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Link
              className="text-sm font-semibold underline decoration-border/60 underline-offset-4"
              to={`/tokens/${encodeURIComponent(selected.tokenPath)}`}
            >
              Open token detail
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
