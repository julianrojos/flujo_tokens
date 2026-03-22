import type { ImpactLevel } from "@/types/consumers";

export interface ConsumerFilterState {
  searchQuery: string;
  severityFilter: ImpactLevel | "all";
  staleFilter: boolean;
}

export function readConsumerFilterState(params: URLSearchParams): ConsumerFilterState {
  return {
    searchQuery: params.get("q") || "",
    severityFilter: (params.get("severity") as ImpactLevel | "all") || "all",
    staleFilter: params.get("stale") === "true",
  };
}

export function writeSearchQuery(params: URLSearchParams, value: string): URLSearchParams {
  const next = new URLSearchParams(params);
  const normalized = String(value || "").trim();
  if (normalized) next.set("q", normalized);
  else next.delete("q");
  return next;
}

export function writeSeverityFilter(
  params: URLSearchParams,
  value: ImpactLevel | "all",
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value === "all") next.delete("severity");
  else next.set("severity", value);
  return next;
}

export function writeStaleFilter(params: URLSearchParams, value: boolean): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value) next.set("stale", "true");
  else next.delete("stale");
  return next;
}
