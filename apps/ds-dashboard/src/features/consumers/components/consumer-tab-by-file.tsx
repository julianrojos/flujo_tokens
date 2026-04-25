import { useEffect, useMemo, useState } from "react";

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, EmptyStateAction, FilterBar, StatsOverview } from "@/components/composites";
import { Modal, ModalCloseButton, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/overlay/modal";
import { ApiErrorMessage } from "@/components/api-error-message";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import { fetchReportByFile, removeConsumer, syncConsumers } from "@/lib/api";
import { formatSyncedAt } from "@/lib/format-synced-at";
import { toConsumerDetail } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { ExternalLink, Inbox, Network } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useConsumerFilterParams } from "../hooks/use-consumer-filter-params";
import { buildAggregateAdoptionState } from "../lib/adoption-metrics";
import type { FileReport, DsSyncRun } from "@/types/consumers";
import type { SyncStatusFilter } from "../lib/consumer-filter-query";

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

function buildFigmaFileUrl(fileKey: string): string {
  const normalizedKey = String(fileKey || "").trim();
  return normalizedKey ? `https://www.figma.com/file/${encodeURIComponent(normalizedKey)}` : "";
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
      <div className="flex items-center gap-1.5">
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

  return state.percentageLabel ? (
    <div className="flex items-center gap-1.5">
      <span className="tabular-nums text-foreground">{state.percentageLabel}</span>
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
  ) : (
    <span className="text-muted-foreground">—</span>
  );
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
  const rowLinkClassName = "text-foreground hover:text-primary";

  if (!loading && reports.length === 0) {
    return (
      <Card className="p-5 text-card-foreground backdrop-blur-sm">
        <EmptyState
          icon={Network}
          title="No consumer files yet"
          action={
            <EmptyStateAction onClick={onAddConsumer}>
              Add first consumer
            </EmptyStateAction>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <StatsOverview
        items={[
          { id: "consumers-total", label: "Total files", value: kpis.total },
          { id: "consumers-synced", label: "Synced today", value: kpis.syncedToday },
          { id: "consumers-warnings", label: "With warnings", value: kpis.withWarnings },
          { id: "consumers-never", label: "Never synced", value: kpis.neverSynced },
        ]}
      />

      <Card className="p-5 text-card-foreground backdrop-blur-sm">
        <div className="space-y-4">
          <FilterBar
            searchValue={searchQuery}
            onSearch={setSearchQuery}
            searchPlaceholder="Search by name or file key"
            rightSlot={
              <div className="flex flex-shrink-0 items-center gap-2">
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
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              {(["all", "ok", "partial", "error", "skipped"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    statusFilter === status
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/60 bg-[var(--app-surface-1)] text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
              <label className="flex items-center gap-2 rounded-md border border-border/70 bg-[var(--app-surface-1)] px-3 py-1.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={highImpactOnly}
                  onChange={(e) => setHighImpactOnly(e.target.checked)}
                  className="h-4 w-4"
                />
                <span>High impact only</span>
              </label>
            </div>
          </FilterBar>

          {error ? <ApiErrorMessage error={error} /> : null}

          <p className="text-xs text-muted-foreground">
            Adoption compares DS usage against DS plus non-DS usage for the last sync.
          </p>

          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead label="Consumer" onSort={() => undefined} ariaLabel="Consumer" />
                <SortableTableHead label="Last sync" onSort={() => undefined} ariaLabel="Last sync" />
                <SortableTableHead label="Usage" onSort={() => undefined} ariaLabel="Usage" />
                <SortableTableHead label="Adoption" onSort={() => undefined} ariaLabel="Adoption" />
                <SortableTableHead
                  label="Defined locally"
                  onSort={() => undefined}
                  ariaLabel="Defined locally"
                />
                <SortableTableHead label="Status" onSort={() => undefined} ariaLabel="Status" />
                <SortableTableHead label="Actions" onSort={() => undefined} ariaLabel="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={`consumer-loading-${index}`}>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      Loading consumer files...
                    </TableCell>
                  </TableRow>
                ))
              ) : sortedReports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      icon={Inbox}
                      title="No results match your filters"
                      description="Try adjusting your search or filter criteria."
                      compact
                    />
                  </TableCell>
                </TableRow>
              ) : (
                sortedReports.map((report) => (
                    <TableRow key={report.consumerId}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {report.consumerFileKey ? (
                            <a
                              href={buildFigmaFileUrl(report.consumerFileKey)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center text-muted-foreground hover:text-primary"
                              title={`Open ${report.consumerName} in Figma`}
                              aria-label={`Open ${report.consumerName} in Figma`}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : null}
                          <Link
                            to={toConsumerDetail(report.consumerId)}
                            className={rowLinkClassName}
                          >
                            {report.consumerName}
                          </Link>
                        </div>
                      </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatSyncedAt(report.lastSyncedAt, "Never")}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5 text-sm">
                        <p>
                          <span className="text-xs text-muted-foreground">Comp </span>
                          <span className="tabular-nums">DS {report.componentCount}</span>
                          {report.localComponentUsedCount != null && (
                            <span className="text-muted-foreground">
                              {" "}
                              · Non-DS {report.localComponentUsedCount}
                            </span>
                          )}
                        </p>
                        <p>
                          <span className="text-xs text-muted-foreground">Vars </span>
                          <span className="tabular-nums">DS {report.variableCount}</span>
                          {report.localVariableUsedCount != null && (
                            <span className="text-muted-foreground">
                              {" "}
                              · Non-DS {report.localVariableUsedCount}
                            </span>
                          )}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{renderAdoptionCell(report)}</TableCell>
                    <TableCell>
                      {report.localComponentDefinedCount == null &&
                      report.localVariableDefinedCount == null ? (
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
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[report.status]}>
                        {report.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            syncingConsumerId === report.consumerId ||
                            removingConsumerId === report.consumerId
                          }
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
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Modal open={!!removeCandidate} onClose={closeRemoveModal}>
        <ModalContent size="md">
          <ModalHeader>
            <div className="flex items-start justify-between gap-4">
              <h2 id="consumer-remove-confirm-title" className="text-lg font-titles font-semibold tracking-tight titles-color">
                Remove consumer file
              </h2>
              <ModalCloseButton onClick={closeRemoveModal} label="Close remove consumer dialog" />
            </div>
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
              variant="destructive"
              onClick={() => void handleConfirmRemove()}
              disabled={!removeConfirmed || !!removingConsumerId}
            >
              {removingConsumerId ? "Removing..." : "Remove consumer"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
