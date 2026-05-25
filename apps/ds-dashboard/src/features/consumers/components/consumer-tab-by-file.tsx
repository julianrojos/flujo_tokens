import { useEffect, useMemo, useState } from "react";

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Inbox, Loader2, Network } from "lucide-react";

import { ApiErrorMessage } from "@/components/api-error-message";
import { EmptyState, EmptyStateAction, FilterBar } from "@/components/composites";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal, ModalCloseButton, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/overlay/modal";
import { Select } from "@/components/ui/select";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConsumerSyncStatusBadge } from "@/features/consumers/components/consumer-sync-status-badge";
import { useConsumerFilterParams } from "@/features/consumers/hooks/use-consumer-filter-params";
import { useSortState } from "@/lib/use-sort-state";
import { shouldAllowShowAll, shouldShowPageSizeSelect } from "@/lib/table-pagination";
import { listConsumers, removeConsumer } from "@/lib/api";
import { formatSyncedAt } from "@/lib/format-synced-at";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import { useDesignSystem } from "@/lib/design-system-context";
import { toSystemConsumerDetail } from "@/lib/routes";
import type { DsConsumer, DsSyncRun } from "@/types/consumers";

interface ConsumerTabByFileProps {
  dsFileKey: string;
  reloadToken?: number;
  onAddConsumer?: () => void;
  isAddConsumerRefreshing?: boolean;
}

interface RemoveCandidate {
  id: string;
  name: string;
}

type ConsumerSortField = "consumer" | "fileKey" | "lastSync";
const PAGE_SIZE_OPTIONS = [25, 50, 75, 100, 125, 150, 175] as const;
const PAGE_SIZE_ALL = "all";

function getSyncedAtMs(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const syncedAt = new Date(value).getTime();
  return Number.isFinite(syncedAt) ? syncedAt : Number.NEGATIVE_INFINITY;
}

function applyFilters(
  consumers: Array<DsConsumer & { latestSync?: DsSyncRun }>,
  filters: {
    searchQuery: string;
  },
): Array<DsConsumer & { latestSync?: DsSyncRun }> {
  const normalizedQuery = filters.searchQuery.toLowerCase().trim();

  return consumers.filter((consumer) => {
    if (!normalizedQuery) return true;
    const nameMatch = consumer.consumerName.toLowerCase().includes(normalizedQuery);
    const keyMatch = consumer.consumerFileKey.toLowerCase().includes(normalizedQuery);
    return nameMatch || keyMatch;
  });
}

export function ConsumerTabByFile({ dsFileKey, reloadToken = 0, onAddConsumer, isAddConsumerRefreshing = false }: ConsumerTabByFileProps) {
  const { searchQuery, setSearchQuery } = useConsumerFilterParams();
  const { activeSystem } = useDesignSystem();
  const [removingConsumerId, setRemovingConsumerId] = useState<string | null>(null);
  const [removeCandidate, setRemoveCandidate] = useState<RemoveCandidate | null>(null);
  const [removeConfirmed, setRemoveConfirmed] = useState(false);
  const [mutationError, setMutationError] = useState<ReturnType<typeof toApiErrorDisplay> | null>(null);
  const [sort, toggleSort] = useSortState<ConsumerSortField>({ field: "lastSync", dir: "desc" });
  const [pageSize, setPageSize] = useState<string>("25");
  const [currentPage, setCurrentPage] = useState(1);
  const sortAriaSort = sort.dir === "asc" ? "ascending" : "descending";

  const query = useQuery({
    queryKey: ["consumer-files-admin", dsFileKey, reloadToken],
    enabled: Boolean(dsFileKey),
    queryFn: async () => listConsumers(dsFileKey || ""),
  });

  const consumers = query.data?.data ?? [];
  const loading = query.isLoading;
  const error = mutationError ?? (query.error
    ? toApiErrorDisplay(query.error, {
      fallbackTitle: "Load consumer files failed",
      fallbackMessage: "Unable to load consumer files.",
    })
    : null);

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
    setMutationError(null);
    try {
      await removeConsumer(removeCandidate.id);
      await query.refetch();
      setRemoveCandidate(null);
      setRemoveConfirmed(false);
    } catch (cause) {
      setMutationError(toApiErrorDisplay(cause, {
        fallbackTitle: "Remove failed",
        fallbackMessage: "Unable to remove this consumer file.",
      }));
    } finally {
      setRemovingConsumerId(null);
    }
  };

  const filteredConsumers = useMemo(
    () => applyFilters(consumers, { searchQuery }),
    [consumers, searchQuery],
  );
  const sortedConsumers = useMemo(() => {
    const getValue = (consumer: DsConsumer & { latestSync?: DsSyncRun }): string | number => {
      if (sort.field === "consumer") return consumer.consumerName.toLowerCase();
      if (sort.field === "fileKey") return consumer.consumerFileKey.toLowerCase();
      return getSyncedAtMs(consumer.latestSync?.syncedAt);
    };

    return [...filteredConsumers].sort((left, right) => {
      const leftValue = getValue(left);
      const rightValue = getValue(right);
      const comparison = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
      const dirAdjusted = sort.dir === "asc" ? comparison : comparison * -1;
      if (dirAdjusted !== 0) return dirAdjusted;
      return left.consumerName.localeCompare(right.consumerName);
    });
  }, [filteredConsumers, sort]);

  const pageSizeOptions = useMemo(
    () => PAGE_SIZE_OPTIONS.filter((size) => size <= Math.max(25, sortedConsumers.length)),
    [sortedConsumers.length],
  );
  const pageSizeValue = pageSize === PAGE_SIZE_ALL ? sortedConsumers.length : Number(pageSize);
  const shouldPaginate =
    pageSize !== PAGE_SIZE_ALL &&
    Number.isFinite(pageSizeValue) &&
    pageSizeValue > 0 &&
    sortedConsumers.length > pageSizeValue;
  const totalPages = shouldPaginate ? Math.max(1, Math.ceil(sortedConsumers.length / pageSizeValue)) : 1;
  const showPageSizeSelect = shouldShowPageSizeSelect(sortedConsumers.length);

  useEffect(() => {
    if (pageSize === PAGE_SIZE_ALL && !shouldAllowShowAll(sortedConsumers.length)) {
      setPageSize("25");
      return;
    }
    if (pageSize !== PAGE_SIZE_ALL) {
      const numericValue = Number(pageSize);
      if (!pageSizeOptions.includes(numericValue as (typeof PAGE_SIZE_OPTIONS)[number])) {
        const fallback = pageSizeOptions[pageSizeOptions.length - 1] ?? 25;
        setPageSize(String(fallback));
        return;
      }
    }
    setCurrentPage(1);
  }, [pageSize, pageSizeOptions, searchQuery, sortedConsumers.length]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const pagedConsumers = useMemo(() => {
    if (!shouldPaginate) return sortedConsumers;
    const start = (currentPage - 1) * pageSizeValue;
    return sortedConsumers.slice(start, start + pageSizeValue);
  }, [currentPage, pageSizeValue, shouldPaginate, sortedConsumers]);

  const pageStart = shouldPaginate
    ? (currentPage - 1) * pageSizeValue + 1
    : sortedConsumers.length === 0
      ? 0
      : 1;
  const pageEnd = shouldPaginate
    ? Math.min(sortedConsumers.length, currentPage * pageSizeValue)
    : sortedConsumers.length;
  const rowLinkClassName = "text-foreground hover:text-primary";

  if (loading && consumers.length === 0) {
    return (
      <Card className="p-5 text-card-foreground backdrop-blur-sm">
        <div className="space-y-3">
          <div className="h-10 animate-pulse rounded-lg bg-muted/60" />
          <div className="h-10 animate-pulse rounded-lg bg-muted/60" />
          <div className="h-10 animate-pulse rounded-lg bg-muted/60" />
        </div>
      </Card>
    );
  }

  if (!loading && consumers.length === 0) {
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
    <Card className="p-5 text-card-foreground backdrop-blur-sm">
      <div className="space-y-4">
        <FilterBar
          searchValue={searchQuery}
          onSearch={setSearchQuery}
          searchPlaceholder="Search by name or file key"
          searchAriaLabel="Search consumers"
          rightSlot={
            <div className="flex items-center gap-2">
              {showPageSizeSelect ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Rows</span>
                  <Select
                    value={pageSize}
                    onChange={(event) => setPageSize(event.target.value)}
                    className="w-[132px]"
                    aria-label="Rows per page"
                  >
                    {pageSizeOptions.map((size) => (
                      <option key={size} value={String(size)}>
                        {size}
                      </option>
                    ))}
                    {shouldAllowShowAll(sortedConsumers.length) ? <option value={PAGE_SIZE_ALL}>All</option> : null}
                  </Select>
                </div>
              ) : null}
              {onAddConsumer ? (
                <Button
                  onClick={onAddConsumer}
                  disabled={isAddConsumerRefreshing}
                >
                  {isAddConsumerRefreshing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      Refreshing...
                    </>
                  ) : (
                    'Add Consumer File'
                  )}
                </Button>
              ) : null}
            </div>
          }
        />

        {error ? <ApiErrorMessage error={error} /> : null}

        {shouldPaginate && sortedConsumers.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 pl-0">
            <p className="text-xs text-muted-foreground">
              Showing {pageStart}-{pageEnd} of {sortedConsumers.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage <= 1}
              >
                Prev
              </Button>
              <span className="text-xs text-muted-foreground">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead
                label="Consumer"
                onSort={() => toggleSort("consumer")}
                ariaLabel="Sort by consumer"
                ariaSort={sort.field === "consumer" ? sortAriaSort : "none"}
              />
              <SortableTableHead
                label="File key"
                onSort={() => toggleSort("fileKey")}
                ariaLabel="Sort by file key"
                ariaSort={sort.field === "fileKey" ? sortAriaSort : "none"}
              />
              <TableHead showSortIcon={false}>Sync status</TableHead>
              <SortableTableHead
                label="Last sync"
                onSort={() => toggleSort("lastSync")}
                ariaLabel="Sort by last sync"
                ariaSort={sort.field === "lastSync" ? sortAriaSort : "none"}
              />
              <TableHead showSortIcon={false} className="normal-case">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedConsumers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8">
                  <EmptyState
                    icon={Inbox}
                    title="No consumers match your filters"
                    action={
                      <EmptyStateAction onClick={() => setSearchQuery("")}>
                        Clear filters
                      </EmptyStateAction>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              pagedConsumers.map((consumer) => (
                <TableRow key={consumer.id}>
                  <TableCell>
                    {activeSystem ? (
                      <Link
                        to={toSystemConsumerDetail(activeSystem, consumer.consumerName)}
                        className={rowLinkClassName}
                      >
                        {consumer.consumerName}
                      </Link>
                    ) : (
                      <span>{consumer.consumerName}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {consumer.consumerFileKey}
                  </TableCell>
                  <TableCell>
                    <ConsumerSyncStatusBadge latestSync={consumer.latestSync} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatSyncedAt(consumer.latestSync?.syncedAt, "Never")}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={removingConsumerId === consumer.id}
                      onClick={() => requestRemove(consumer.id, consumer.consumerName)}
                    >
                      {removingConsumerId === consumer.id ? "Removing..." : "Remove"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {shouldPaginate && sortedConsumers.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 pl-0">
            <p className="text-xs text-muted-foreground">
              Showing {pageStart}-{pageEnd} of {sortedConsumers.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage <= 1}
              >
                Prev
              </Button>
              <span className="text-xs text-muted-foreground">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <Modal
        open={!!removeCandidate}
        onClose={closeRemoveModal}
        aria-labelledby="consumer-remove-confirm-title"
      >
        <ModalContent size="md">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleConfirmRemove();
            }}
          >
            <ModalHeader className="items-start gap-4">
              <div className="min-w-0 flex-1">
                <h2
                  id="consumer-remove-confirm-title"
                  className="text-lg font-titles font-semibold tracking-tight titles-color"
                >
                  Remove consumer file
                </h2>
              </div>
              <ModalCloseButton onClick={closeRemoveModal} label="Close remove consumer dialog" />
            </ModalHeader>

            <div className="space-y-4 p-5">
              <p className="text-sm text-muted-foreground">
                This will remove <strong>{removeCandidate?.name}</strong> and all its sync history.
                This action cannot be undone.
              </p>

              <Checkbox
                id="consumer-remove-confirm-checkbox"
                checked={removeConfirmed}
                onChange={(event) => setRemoveConfirmed(event.target.checked)}
                disabled={!!removingConsumerId}
                label="I understand and want to continue"
              />
            </div>

            <ModalFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={closeRemoveModal}
                disabled={!!removingConsumerId}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={!removeConfirmed || !!removingConsumerId}
              >
                {removingConsumerId ? 'Removing...' : 'Remove consumer file'}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </Card>
  );
}
