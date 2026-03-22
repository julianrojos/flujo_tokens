/**
 * useTokenDiffFilterParams hook - URL sync for token diff filters.
 * Uses useSearchParams from react-router-dom.
 *
 * Important: setBeforeRef only updates URL, does NOT trigger fetch.
 * Fetch is always manual via the "Compare" button.
 */

import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  readTokenDiffFilterState,
  writeSearch,
  writeBreaking,
  writeBeforeRef,
} from "../lib/token-diff-filter-query";

export interface UseTokenDiffFilterParamsResult {
  search: string;
  setSearch: (value: string) => void;
  showOnlyBreaking: boolean;
  setShowOnlyBreaking: (value: boolean) => void;
  beforeRef: string;
  setBeforeRef: (value: string) => void;
}

export function useTokenDiffFilterParams(): UseTokenDiffFilterParamsResult {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read initial state from URL
  const initialState = readTokenDiffFilterState(searchParams);

  const search = initialState.search;
  const showOnlyBreaking = initialState.showOnlyBreaking;
  const beforeRef = initialState.beforeRef;

  const setSearch = useCallback((value: string) => {
    setSearchParams((prev) => writeSearch(prev, value));
  }, [setSearchParams]);

  const setShowOnlyBreaking = useCallback((value: boolean) => {
    setSearchParams((prev) => writeBreaking(prev, value));
  }, [setSearchParams]);

  const setBeforeRef = useCallback((value: string) => {
    // Only update URL, do NOT trigger fetch
    // Fetch is manual via "Compare" button
    setSearchParams((prev) => writeBeforeRef(prev, value));
  }, [setSearchParams]);

  return {
    search,
    setSearch,
    showOnlyBreaking,
    setShowOnlyBreaking,
    beforeRef,
    setBeforeRef,
  };
}
