import { useEffect, useMemo, useState } from "react";

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, EmptyStateAction } from "@/components/composites/empty-state";
import { StatusAlert } from "@/components/ui/status-alert";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/overlay/modal";
import { ApiErrorMessage } from "@/components/api-error-message";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import { fetchReportByFile, removeConsumer, syncConsumers } from "@/lib/api";
import { formatSyncedAt } from "@/lib/format-synced-at";
import { toConsumerDetail } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { Info, Network } from "lucide-react";
import { useConsumerFilterParams } from "../hooks/use-consumer-filter-params";
import { buildAggregateAdoptionState } from "../lib/adoption-metrics";
import type { FileReport, DsSyncRun } from "@/types/consumers";
import type { SyncStatusFilter } from "../lib/consumer-filter-query";
import { AdoptionBar } from "./adoption-bar";

interface ConsumerTabByFileProps {
  dsFileKey: string;
  reloadToken?: number;
  onAddConsumer?: () => void;
}

interface RemoveCandidate {
  id: string;
  name: string;
}

interface KpiData {
  total: number;
  syncedToday: number;
  withWarnings: number;
  neverSynced: number;
}

const STATUS_SORT_ORDER: Record<DsSyncRun["status"], number> = {
  error: 0,
  partial: 1,
  skipped: 2,
  ok: 3,
};
const STATUS_BADGE_VARIANT: Record<DsSyncRun["status"], "error" | "warning" | "neutral" | "success"> = {
  error: "error",
  partial: "warning",
  skipped: "neutral",
  ok: "success",
};

function computeKpis(reports: FileReport[]): KpiData {
  const now = Date.now();
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  let syncedToday = 0;
  let withWarnings = 0;
  let neverSynced = 0;

  for (const report of reports) {
    if (!report.lastSyncedAt) {
      neverSynced += 1;
    } else {
      const syncedAt = new Date(report.lastSyncedAt).getTime();
      if (Number.isFinite(syncedAt) && now - syncedAt < twentyFourHoursMs) {
        syncedToday += 1;
      }
    }
    if (report.warningCount > 0) {
      withWarnings += 1;
    }
  }

  return {
    total: reports.length,
    syncedToday,
    withWarnings,
    neverSynced,
  };
}

function sortReports(reports: FileReport[]): FileReport[] {
  return [...reports].sort((a, b) => {
    // Use fallback value (99) for unknown status to avoid NaN breaking sort
    const statusA = STATUS_SORT_ORDER[a.status] ?? 99;
    const statusB = STATUS_SORT_ORDER[b.status] ?? 99;
    const statusDiff = statusA - statusB;
    if (statusDiff !== 0) return statusDiff;
    return a.consumerName.localeCompare(b.consumerName);
  });
}

function applyFilters(
  reports: FileReport[],
  filters: {
    searchQuery: string;
    statusFilter: SyncStatusFilter;
    highImpactOnly: boolean;
  },
): FileReport[] {
  const { searchQuery, statusFilter, highImpactOnly } = filters;
  const normalizedQuery = searchQuery.toLowerCase().trim();

  return reports.filter((report) => {
    // Search filter
    if (normalizedQuery) {
      const nameMatch = report.consumerName.toLowerCase().includes(normalizedQuery);
      const keyMatch = report.consumerFileKey.toLowerCase().includes(normalizedQuery);
      if (!nameMatch && !keyMatch) return false;
    }

    // Status filter
    if (statusFilter !== "all" && report.status !== statusFilter) {
      return false;
    }

    // High impact filter (CRITICAL or HIGH)
    if (highImpactOnly) {
      const impact = report.impactLevel.level;
      if (impact !== "CRITICAL" && impact !== "HIGH") {
        return false;
      }
    }

    return true;
  });
}

function renderAdoptionCell(report: FileReport) {
  const state = buildAggregateAdoptionState(report);

  if (state.showNA) {
    return (
      <span className="text-muted-foreground" title="No usage data">
        N/A
      </span>
    );
  }

  if (state.showUnavailable) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <span className="text-muted-foreground" title="Adoption data unavailable">
          —
        </span>
        {state.showPartial && (
          <Badge
            variant="neutral"
            className="text-[10px]"
            title="Partial: one local usage dimension is unavailable for this sync."
          >
            Partial
          </Badge>
        )}
      </div>
    );
  }

  // Invariant: showBar=true → adoptionRate!=null → both local counts non-null → totalLocalUsed!=null
  if (state.showBar && state.totalLocalUsed != null) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <AdoptionBar dsCount={state.totalDsUsed} nonDsCount={state.totalLocalUsed} className="flex-1" />
        {state.showPartial && (
          <Badge
            variant="neutral"
            className="text-[10px]"
            title="Partial: one local usage dimension is unavailable for this sync."
          >
            Partial
          </Badge>
        )}
      </div>
    );
  }

  return <span className="text-muted-foreground">—</span>;
}

export function ConsumerTabByFile({ dsFileKey, reloadToken = 0, onAddConsumer }: ConsumerTabByFileProps) {
  const { statusFilter, setStatusFilter, searchQuery, setSearchQuery } = useConsumerFilterParams();
  const [reports, setReports] = useState<FileReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReturnType<typeof toApiErrorDisplay> | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncingConsumerId, setSyncingConsumerId] = useState<string | null>(null);
  const [removingConsumerId, setRemovingConsumerId] = useState<string | null>(null);
  const [removeCandidate, setRemoveCandidate] = useState<RemoveCandidate | null>(null);
  const [removeConfirmed, setRemoveConfirmed] = useState(false);
  const [highImpactOnly, setHighImpactOnly] = useState(false);

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    try {
      // Always fetch with staleOnly: false for accurate KPIs
      const response = await fetchReportByFile(dsFileKey, {
        staleOnly: false,
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
  }, [dsFileKey, reloadToken]);

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
        // Keep parent-file "Used In" data fresh for token detail views.
        // Tradeoff: adds one extra parent-file scan per sync request.
        captureParentUsage: true,
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

  // Compute KPIs from all reports (before filtering)
  const kpis = useMemo(() => computeKpis(reports), [reports]);

  // Apply filters and sorting
  const filteredReports = useMemo(() => applyFilters(reports, {
    searchQuery,
    statusFilter,
    highImpactOnly,
  }), [reports, searchQuery, statusFilter, highImpactOnly]);
  const sortedReports = useMemo(() => sortReports(filteredReports), [filteredReports]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Loading consumer files...</p>
      </div>
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
      {/* KPI Bar */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-2xl font-bold">{kpis.total}</p>
          <p className="text-xs text-muted-foreground">Total files</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-2xl font-bold">{kpis.syncedToday}</p>
          <p className="text-xs text-muted-foreground">Synced today</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-2xl font-bold">{kpis.withWarnings}</p>
          <p className="text-xs text-muted-foreground">With warnings</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-2xl font-bold">{kpis.neverSynced}</p>
          <p className="text-xs text-muted-foreground">Never synced</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <input
            type="text"
            placeholder="Search by name or file key..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-w-0 rounded border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-app-accent/50 md:w-64"
          />
          <div className="flex flex-shrink-0 gap-1">
            {(["all", "ok", "partial", "error", "skipped"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  statusFilter === status
                    ? "bg-app-accent text-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <label className="flex items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-1.5 text-sm">
            <input
              type="checkbox"
              checked={highImpactOnly}
              onChange={(e) => setHighImpactOnly(e.target.checked)}
              className="h-4 w-4"
            />
            <span>High impact only</span>
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

      {sortedReports.length === 0 ? (
        <StatusAlert variant="info" title="No results match your filters">
          Try adjusting your search or filter criteria.
        </StatusAlert>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Consumer</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Last sync</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Usage</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Warnings</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                  <span
                    className="inline-flex items-center justify-end gap-1"
                    title="Adoption = DS usage ÷ (DS + Non-DS usage). Non-DS includes local and other-library items not matched to the tracked DS during the last sync. The table shows an aggregate adoption value (components + variables)."
                  >
                    Adoption
                    <Info
                      className="h-3 w-3 text-muted-foreground/60"
                      aria-hidden="true"
                    />
                    <span className="sr-only">
                      Adoption uses DS usage divided by DS plus Non-DS usage. Non-DS includes local
                      and other-library items not matched to the tracked design system during the
                      last sync.
                    </span>
                  </span>
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Locally defined</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedReports.map((report) => (
                <tr key={report.consumerId} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-3">
                    <div className="space-y-0.5">
                      <Link
                        to={toConsumerDetail(report.consumerId)}
                        className="font-medium text-foreground hover:underline"
                      >
                        {report.consumerName}
                      </Link>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {formatSyncedAt(report.lastSyncedAt, "Never")}
                  </td>
                  <td className="px-3 py-3">
                    <div className="space-y-0.5 text-sm">
                      <p>
                        <span className="text-xs text-muted-foreground">Comp </span>
                        <span className="tabular-nums">DS {report.componentCount}</span>
                        {report.localComponentUsedCount != null && (
                          <span className="text-muted-foreground"> · Non-DS {report.localComponentUsedCount}</span>
                        )}
                      </p>
                      <p>
                        <span className="text-xs text-muted-foreground">Vars </span>
                        <span className="tabular-nums">DS {report.variableCount}</span>
                        {report.localVariableUsedCount != null && (
                          <span className="text-muted-foreground"> · Non-DS {report.localVariableUsedCount}</span>
                        )}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    {report.warningCount > 0 ? (
                      <Badge variant="warning">{report.warningCount}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {renderAdoptionCell(report)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {report.localComponentDefinedCount == null && report.localVariableDefinedCount == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        className="text-sm text-muted-foreground tabular-nums"
                        title="Components and variables created in this file"
                      >
                        {report.localComponentDefinedCount ?? "—"} comp ·{" "}
                        {report.localVariableDefinedCount ?? "—"} vars
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={STATUS_BADGE_VARIANT[report.status]}>
                      {report.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={syncingConsumerId === report.consumerId || removingConsumerId === report.consumerId}
                        onClick={() => void handleSync(report.consumerId)}
                      >
                        {syncingConsumerId === report.consumerId ? "Syncing..." : "Sync"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={removingConsumerId === report.consumerId}
                        onClick={() => requestRemove(report.consumerId, report.consumerName)}
                      >
                        {removingConsumerId === report.consumerId ? "Removing..." : "Remove"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!removeCandidate} onClose={closeRemoveModal}>
        <ModalContent size="md">
          <ModalHeader>
            <h2 id="consumer-remove-confirm-title" className="text-lg font-titles font-semibold tracking-tight">
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
