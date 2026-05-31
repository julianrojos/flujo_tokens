import { useMemo, useState } from "react";

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
import { PaginationFooter } from "@/features/health/components/pagination-footer";
import { useConsumerFilterParams } from "@/features/consumers/hooks/use-consumer-filter-params";
import { parseSyncedAt } from "@/features/consumers/lib/date-utils";
import { compareNullableNumbers, compareStrings } from "@/features/consumers/lib/table-sorting";
import { useSortState } from "@/lib/use-sort-state";
import { PAGE_SIZE_ALL, useTablePagination } from "@/lib/table-pagination";
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
    return [...filteredConsumers].sort((left, right) => {
      let comparison = 0;
      switch (sort.field) {
        case "consumer":
          comparison = compareStrings(left.consumerName.toLowerCase(), right.consumerName.toLowerCase(), sort.dir);
          break;
        case "fileKey":
          comparison = compareStrings(left.consumerFileKey.toLowerCase(), right.consumerFileKey.toLowerCase(), sort.dir);
          break;
        case "lastSync":
          comparison = compareNullableNumbers(
            parseSyncedAt(left.latestSync?.syncedAt, Number.NEGATIVE_INFINITY),
            parseSyncedAt(right.latestSync?.syncedAt, Number.NEGATIVE_INFINITY),
            sort.dir,
          );
          break;
      }
      if (comparison !== 0) return comparison;
      return left.consumerName.localeCompare(right.consumerName);
    });
  }, [filteredConsumers, sort]);

  const {
    pageSize,
    setPageSize,
    pageSizeOptions,
    showPageSizeSelect,
    allowShowAll,
    currentPage,
    totalPages,
    pageStart,
    pageEnd,
    shouldPaginate,
    goPrevious,
    goNext,
    pagedItems: pagedConsumers,
  } = useTablePagination(sortedConsumers, {
    resetKey: searchQuery,
  });
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
                    {allowShowAll ? <option value={PAGE_SIZE_ALL}>All</option> : null}
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

        <PaginationFooter
          hasPagination={shouldPaginate && sortedConsumers.length > 0}
          pageStart={pageStart}
          pageEnd={pageEnd}
          totalItems={sortedConsumers.length}
          currentPage={currentPage}
          totalPages={totalPages}
          canGoPrevious={currentPage > 1}
          canGoNext={currentPage < totalPages}
          onPrevious={goPrevious}
          onNext={goNext}
        />

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
              <SortableTableHead
                label="Import date"
                onSort={() => toggleSort("lastSync")}
                ariaLabel="Sort by import date"
                ariaSort={sort.field === "lastSync" ? sortAriaSort : "none"}
              />
              <TableHead showSortIcon={false} className="normal-case">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedConsumers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8">
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

        <PaginationFooter
          hasPagination={shouldPaginate && sortedConsumers.length > 0}
          pageStart={pageStart}
          pageEnd={pageEnd}
          totalItems={sortedConsumers.length}
          currentPage={currentPage}
          totalPages={totalPages}
          canGoPrevious={currentPage > 1}
          canGoNext={currentPage < totalPages}
          onPrevious={goPrevious}
          onNext={goNext}
        />
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
