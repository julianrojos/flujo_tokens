/**
 * Token diff filter query - pure functions for URL params sync.
 * Mirrors the pattern from consumer-filter-query.ts
 */

export interface TokenDiffFilterState {
  search: string;
  showOnlyBreaking: boolean;
  beforeRef: string;
}

const DEFAULT_STATE: TokenDiffFilterState = {
  search: "",
  showOnlyBreaking: false,
  beforeRef: "HEAD~1",
};

/**
 * Read filter state from URL search params
 */
export function readTokenDiffFilterState(params: URLSearchParams): TokenDiffFilterState {
  const search = params.get("q") ?? DEFAULT_STATE.search;
  const breaking = params.get("breaking");
  const ref = params.get("ref") ?? DEFAULT_STATE.beforeRef;

  return {
    search,
    showOnlyBreaking: breaking === "true",
    beforeRef: ref,
  };
}

/**
 * Build URL search params for search query
 */
export function writeSearch(params: URLSearchParams, search: string): URLSearchParams {
  const next = new URLSearchParams(params);
  if (!search || search === DEFAULT_STATE.search) {
    next.delete("q");
  } else {
    next.set("q", search);
  }
  return next;
}

/**
 * Build URL search params for showOnlyBreaking flag
 */
export function writeBreaking(params: URLSearchParams, showOnlyBreaking: boolean): URLSearchParams {
  const next = new URLSearchParams(params);
  if (!showOnlyBreaking) {
    next.delete("breaking");
  } else {
    next.set("breaking", "true");
  }
  return next;
}

/**
 * Build URL search params for beforeRef
 */
export function writeBeforeRef(params: URLSearchParams, beforeRef: string): URLSearchParams {
  const next = new URLSearchParams(params);
  if (!beforeRef || beforeRef === DEFAULT_STATE.beforeRef) {
    next.delete("ref");
  } else {
    next.set("ref", beforeRef);
  }
  return next;
}

/**
 * Build complete URL search string from state
 */
export function buildTokenDiffQueryString(state: Partial<TokenDiffFilterState>): string {
  const params = new URLSearchParams();

  if (state.search && state.search !== DEFAULT_STATE.search) {
    params.set("q", state.search);
  }
  if (state.showOnlyBreaking) {
    params.set("breaking", "true");
  }
  if (state.beforeRef && state.beforeRef !== DEFAULT_STATE.beforeRef) {
    params.set("ref", state.beforeRef);
  }

  const str = params.toString();
  return str ? `?${str}` : "";
}
