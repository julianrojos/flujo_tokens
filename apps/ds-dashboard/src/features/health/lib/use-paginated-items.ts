import { useCallback, useEffect, useMemo, useState } from "react";

export function usePaginatedItems<T>(items: readonly T[], pageSize = 5) {
  const normalizedPageSize = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 5;
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / normalizedPageSize));

  useEffect(() => {
    setCurrentPage((previous) => Math.min(previous, totalPages));
  }, [totalPages]);

  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * normalizedPageSize;
    return items.slice(start, start + normalizedPageSize);
  }, [currentPage, items, normalizedPageSize]);

  const pageStart = items.length === 0 ? 0 : (currentPage - 1) * normalizedPageSize + 1;
  const pageEnd = items.length === 0 ? 0 : Math.min(items.length, currentPage * normalizedPageSize);
  const hasPagination = items.length > normalizedPageSize;
  const goPrevious = useCallback(() => {
    setCurrentPage((previous) => Math.max(1, previous - 1));
  }, []);
  const goNext = useCallback(() => {
    setCurrentPage((previous) => Math.min(totalPages, previous + 1));
  }, [totalPages]);

  return {
    currentPage,
    totalPages,
    pageStart,
    pageEnd,
    hasPagination,
    pageSize: normalizedPageSize,
    pagedItems,
    canGoPrevious: currentPage > 1,
    canGoNext: currentPage < totalPages,
    goPrevious,
    goNext,
  };
}
