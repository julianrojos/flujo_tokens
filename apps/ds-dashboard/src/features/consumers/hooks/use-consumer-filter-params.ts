import { useSearchParams } from "react-router-dom";
import type { ImpactLevel } from "@/types/consumers";
import {
  readConsumerFilterState,
  writeSearchQuery,
  writeSeverityFilter,
  writeStaleFilter,
} from "../lib/consumer-filter-query";

export interface ConsumerFilterParams {
  searchQuery: string;
  severityFilter: ImpactLevel | "all";
  staleFilter: boolean;
  setSearchQuery: (value: string) => void;
  setSeverityFilter: (value: ImpactLevel | "all") => void;
  setStaleFilter: (value: boolean) => void;
  clearFilters: () => void;
}

export function useConsumerFilterParams(): ConsumerFilterParams {
  const [searchParams, setSearchParams] = useSearchParams();
  const { searchQuery, severityFilter, staleFilter } = readConsumerFilterState(searchParams);

  const setSearchQuery = (value: string) => {
    setSearchParams((prev) => writeSearchQuery(prev, value));
  };

  const setSeverityFilter = (value: ImpactLevel | "all") => {
    setSearchParams((prev) => writeSeverityFilter(prev, value));
  };

  const setStaleFilter = (value: boolean) => {
    setSearchParams((prev) => writeStaleFilter(prev, value));
  };

  const clearFilters = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("q");
      next.delete("severity");
      next.delete("stale");
      return next;
    });
  };

  return {
    searchQuery,
    severityFilter,
    staleFilter,
    setSearchQuery,
    setSeverityFilter,
    setStaleFilter,
    clearFilters,
  };
}
