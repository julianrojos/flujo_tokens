import { useSearchParams } from "react-router-dom";
import type { ImpactLevel } from "@/types/consumers";
import {
  readConsumerFilterState,
  writeSearchQuery,
  writeSeverityFilter,
} from "../lib/consumer-filter-query";

export interface ConsumerFilterParams {
  searchQuery: string;
  severityFilter: ImpactLevel | "all";
  setSearchQuery: (value: string) => void;
  setSeverityFilter: (value: ImpactLevel | "all") => void;
  clearFilters: () => void;
}

export function useConsumerFilterParams(): ConsumerFilterParams {
  const [searchParams, setSearchParams] = useSearchParams();
  const { searchQuery, severityFilter } = readConsumerFilterState(searchParams);

  const setSearchQuery = (value: string) => {
    setSearchParams((prev) => writeSearchQuery(prev, value), { replace: true });
  };

  const setSeverityFilter = (value: ImpactLevel | "all") => {
    setSearchParams((prev) => writeSeverityFilter(prev, value), { replace: true });
  };

  const clearFilters = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("q");
      next.delete("severity");
      return next;
    }, { replace: true });
  };

  return {
    searchQuery,
    severityFilter,
    setSearchQuery,
    setSeverityFilter,
    clearFilters,
  };
}
