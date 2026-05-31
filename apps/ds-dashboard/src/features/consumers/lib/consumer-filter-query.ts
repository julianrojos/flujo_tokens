export interface ConsumerFilterState {
  searchQuery: string;
}

export function readConsumerFilterState(params: URLSearchParams): ConsumerFilterState {
  return {
    searchQuery: params.get("q") || "",
  };
}

export function writeSearchQuery(params: URLSearchParams, value: string): URLSearchParams {
  const next = new URLSearchParams(params);
  const normalized = String(value || "").trim();
  if (normalized) next.set("q", normalized);
  else next.delete("q");
  return next;
}
