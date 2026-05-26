import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Hide the page-size selector until a table has enough rows to benefit from it.
 * Below this threshold, the extra control adds noise without giving the user
 * meaningful pagination choices.
 */
export const PAGE_SIZE_THRESHOLD = 25;

export const PAGE_SIZE_OPTIONS = [25, 50, 75, 100, 125, 150, 175] as const;
export const PAGE_SIZE_ALL = "all";

/**
 * Expose the "All" option once the dataset is large enough that showing every
 * row remains a useful explicit choice.
 */
export const PAGE_SIZE_ALL_THRESHOLD = 176;

export function shouldShowPageSizeSelect(totalItems: number): boolean {
  return totalItems > PAGE_SIZE_THRESHOLD;
}

export function shouldAllowShowAll(totalItems: number): boolean {
  return totalItems >= PAGE_SIZE_ALL_THRESHOLD;
}

export function getTablePageSizeOptions(totalItems: number): readonly number[] {
  return PAGE_SIZE_OPTIONS.filter((size) => size <= Math.max(PAGE_SIZE_THRESHOLD, totalItems));
}

export function resolveTablePaginationWindow(totalItems: number, pageSize: string, currentPage: number) {
  const pageSizeValue = pageSize === PAGE_SIZE_ALL ? totalItems : Number(pageSize);
  const shouldPaginate =
    pageSize !== PAGE_SIZE_ALL &&
    Number.isFinite(pageSizeValue) &&
    pageSizeValue > 0 &&
    totalItems > pageSizeValue;
  const totalPages = shouldPaginate ? Math.max(1, Math.ceil(totalItems / pageSizeValue)) : 1;
  const pageStart = shouldPaginate
    ? (currentPage - 1) * pageSizeValue + 1
    : totalItems === 0
      ? 0
      : 1;
  const pageEnd = shouldPaginate
    ? Math.min(totalItems, currentPage * pageSizeValue)
    : totalItems;

  return {
    pageSizeValue,
    shouldPaginate,
    totalPages,
    pageStart,
    pageEnd,
  };
}

export interface UseTablePaginationOptions {
  resetKey?: unknown;
  initialPageSize?: string;
}

export function useTablePagination<T>(
  items: readonly T[],
  options: UseTablePaginationOptions = {},
) {
  const { resetKey, initialPageSize = "25" } = options;
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [currentPage, setCurrentPage] = useState(1);

  const pageSizeOptions = useMemo(() => getTablePageSizeOptions(items.length), [items.length]);
  const showPageSizeSelect = shouldShowPageSizeSelect(items.length);
  const allowShowAll = shouldAllowShowAll(items.length);
  const pagination = useMemo(
    () => resolveTablePaginationWindow(items.length, pageSize, currentPage),
    [currentPage, items.length, pageSize],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [resetKey]);

  useEffect(() => {
    if (pageSize === PAGE_SIZE_ALL && !allowShowAll) {
      setPageSizeState("25");
      setCurrentPage(1);
      return;
    }

    if (pageSize !== PAGE_SIZE_ALL) {
      const numericValue = Number(pageSize);
      if (!pageSizeOptions.includes(numericValue as (typeof PAGE_SIZE_OPTIONS)[number])) {
        const fallback = pageSizeOptions[pageSizeOptions.length - 1] ?? PAGE_SIZE_OPTIONS[0] ?? 25;
        setPageSizeState(String(fallback));
        setCurrentPage(1);
      }
    }
  }, [allowShowAll, pageSize, pageSizeOptions]);

  useEffect(() => {
    setCurrentPage((previous) => Math.min(previous, pagination.totalPages));
  }, [pagination.totalPages]);

  const setPageSize = useCallback((nextPageSize: string) => {
    setPageSizeState(nextPageSize);
    setCurrentPage(1);
  }, []);

  const goPrevious = useCallback(() => {
    setCurrentPage((previous) => Math.max(1, previous - 1));
  }, []);

  const goNext = useCallback(() => {
    setCurrentPage((previous) => Math.min(pagination.totalPages, previous + 1));
  }, [pagination.totalPages]);

  const pagedItems = useMemo(() => {
    if (!pagination.shouldPaginate) return items;
    const start = (currentPage - 1) * pagination.pageSizeValue;
    return items.slice(start, start + pagination.pageSizeValue);
  }, [currentPage, items, pagination.pageSizeValue, pagination.shouldPaginate]);

  return {
    pageSize,
    setPageSize,
    pageSizeOptions,
    showPageSizeSelect,
    allowShowAll,
    currentPage,
    setCurrentPage,
    totalPages: pagination.totalPages,
    pageStart: pagination.pageStart,
    pageEnd: pagination.pageEnd,
    shouldPaginate: pagination.shouldPaginate,
    pageSizeValue: pagination.pageSizeValue,
    pagedItems,
    canGoPrevious: currentPage > 1,
    canGoNext: currentPage < pagination.totalPages,
    goPrevious,
    goNext,
  };
}
