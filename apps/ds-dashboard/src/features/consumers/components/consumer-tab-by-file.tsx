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
import { ExternalLink, Inbox, Network } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useConsumerFilterParams } from "../hooks/use-consumer-filter-params";
import { buildAggregateAdoptionState } from "../lib/adoption-metrics";
import type { FileReport } from "@/types/consumers";
import { useSortState } from "@/lib/use-sort-state";

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

type ConsumerSortField = "consumer" | "lastSync" | "usage" | "adoption";

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

function buildFigmaFileUrl(fileKey: string): string {
  const normalizedKey = String(fileKey || "").trim();
  return normalizedKey ? `https://www.figma.com/file/${encodeURIComponent(normalizedKey)}` : "";
}

function applyFilters(
  reports: FileReport[],
  filters: {
    searchQuery: string;
  },
): FileReport[] {
  const { searchQuery } = filters;
  const normalizedQuery = searchQuery.toLowerCase().trim();

  return reports.filter((report) => {
    // Search filter
    if (normalizedQuery) {
      const nameMatch = report.consumerName.toLowerCase().includes(normalizedQuery);
      const keyMatch = report.consumerFileKey.toLowerCase().includes(normalizedQuery);
      if (!nameMatch && !keyMatch) return false;
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
  const { searchQuery, setSearchQuery } = useConsumerFilterParams();
  const [reports, setReports] = useState<FileReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReturnType<typeof toApiErrorDisplay> | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [removingConsumerId, setRemovingConsumerId] = useState<string | null>(null);
  const [removeCandidate, setRemoveCandidate] = useState<RemoveCandidate | null>(null);
  const [removeConfirmed, setRemoveConfirmed] = useState(false);
  const [sort, toggleSort] = useSortState<ConsumerSortField>({ field: "lastSync", dir: "desc" });

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const reportResult = await fetchReportByFile(dsFileKey, {
        staleOnly: false,
      });

      setReports(reportResult.data || []);
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

  const handleSync = async (force = false) => {
    setSyncing(true);

    setError(null);
    try {
      await syncConsumers({
        dsFileKey,
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
  }), [reports, searchQuery]);
  const sortedReports = useMemo(() => {
    const getSyncedAtMs = (value: string | null | undefined): number => {
      if (!value) return Number.NEGATIVE_INFINITY;
      const syncedAt = new Date(value).getTime();
      return Number.isFinite(syncedAt) ? syncedAt : Number.NEGATIVE_INFINITY;
    };
    const getUsageCount = (report: FileReport): number => {
      return report.componentCount + report.variableCount;
    };
    const getAdoptionScore = (report: FileReport): number => {
      const adoption = buildAggregateAdoptionState(report);
      return adoption.percentage ?? Number.NEGATIVE_INFINITY;
    };
    const valueFor = (report: FileReport): string | number => {
      if (sort.field === "consumer") return report.consumerName.toLowerCase();
      if (sort.field === "lastSync") return getSyncedAtMs(report.lastSyncedAt);
      if (sort.field === "usage") return getUsageCount(report);
      if (sort.field === "adoption") return getAdoptionScore(report);
      return report.consumerName.toLowerCase();
    };

    return [...filteredReports].sort((a, b) => {
      const aValue = valueFor(a);
      const bValue = valueFor(b);
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      const dirAdjusted = sort.dir === "asc" ? comparison : comparison * -1;
      if (dirAdjusted !== 0) return dirAdjusted;
      return a.consumerName.localeCompare(b.consumerName);
    });
  }, [filteredReports, sort]);
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
                  onClick={() => void handleSync(true)}
                  disabled={syncing}
                >
                  Force re-sync all
                </Button>
              </div>
            }
          />

          {error ? <ApiErrorMessage error={error} /> : null}

          <p className="text-xs text-muted-foreground">
            Adoption compares DS usage against DS plus non-DS usage for the last sync.
          </p>

          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead
                  label="Consumer"
                  onSort={() => toggleSort("consumer")}
                  ariaLabel="Sort by consumer"
                />
                <SortableTableHead
                  label="Last sync"
                  onSort={() => toggleSort("lastSync")}
                  ariaLabel="Sort by last sync"
                />
                <SortableTableHead
                  label="Usage"
                  onSort={() => toggleSort("usage")}
                  ariaLabel="Sort by usage"
                />
                <SortableTableHead
                  label="Adoption"
                  onSort={() => toggleSort("adoption")}
                  ariaLabel="Sort by adoption"
                />
                <TableHead showSortIcon={false}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={`consumer-loading-${index}`}>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Loading consumer files...
                    </TableCell>
                  </TableRow>
                ))
              ) : sortedReports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="p-0">
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
                      <div className="flex gap-2">
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
