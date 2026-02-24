export const SERVER_QUERY_POLICY = {
  staleTimeMs: 30_000,
  gcTimeMs: 5 * 60_000,
  refetchOnWindowFocus: false,
  retry: 1,
  retryDelayMs: 400,
} as const;
