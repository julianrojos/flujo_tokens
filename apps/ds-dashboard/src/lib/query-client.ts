import { QueryClient } from "@tanstack/react-query";

export const QUERY_DEFAULTS = {
  staleTime: 30_000,
  gcTime: 5 * 60_000,
  refetchOnWindowFocus: false,
  retry: 1,
  retryDelay: 400,
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: QUERY_DEFAULTS,
  },
});
