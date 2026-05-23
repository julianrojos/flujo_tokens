import { useSearchParams } from "react-router-dom";
import {
  readConsumerFilterState,
  writeSearchQuery,
} from "../lib/consumer-filter-query";

export interface ConsumerFilterParams {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
}

export function useConsumerFilterParams(): ConsumerFilterParams {
  const [searchParams, setSearchParams] = useSearchParams();
  const { searchQuery } = readConsumerFilterState(searchParams);

  const setSearchQuery = (value: string) => {
    setSearchParams((prev) => writeSearchQuery(prev, value), { replace: true });
  };

  return {
    searchQuery,
    setSearchQuery,
  };
}
