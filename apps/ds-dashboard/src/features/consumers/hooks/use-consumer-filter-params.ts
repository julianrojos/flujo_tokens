import { useSearchParams } from "react-router-dom";
import type { ImpactLevel } from "@/types/consumers";
import {
  readConsumerFilterState,
  writeSearchQuery,
  writeSeverityFilter,
  writeStatusFilter,
  type SyncStatusFilter,
} from "../lib/consumer-filter-query";

export interface ConsumerFilterParams {
  searchQuery: string;
  severityFilter: ImpactLevel | "all";
  statusFilter: SyncStatusFilter;
  setSearchQuery: (value: string) => void;
  setSeverityFilter: (value: ImpactLevel | "all") => void;
  setStatusFilter: (value: SyncStatusFilter) => void;
  clearFilters: () => void;
}

export function useConsumerFilterParams(): ConsumerFilterParams {
  const [searchParams, setSearchParams] = useSearchParams();
  const { searchQuery, severityFilter, statusFilter } = readConsumerFilterState(searchParams);

  const setSearchQuery = (value: string) => {
    setSearchParams((prev) => writeSearchQuery(prev, value), { replace: true });
  };

  const setSeverityFilter = (value: ImpactLevel | "all") => {
    setSearchParams((prev) => writeSeverityFilter(prev, value), { replace: true });
  };

  const setStatusFilter = (value: SyncStatusFilter) => {
    setSearchParams((prev) => writeStatusFilter(prev, value), { replace: true });
  };

  const clearFilters = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("q");
      next.delete("severity");
      next.delete("status");
      return next;
    }, { replace: true });
  };

  return {
    searchQuery,
    severityFilter,
    statusFilter,
    setSearchQuery,
    setSeverityFilter,
    setStatusFilter,
    clearFilters,
  };
}
