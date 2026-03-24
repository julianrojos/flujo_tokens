import type { ImpactLevel } from "@/types/consumers";

export type SyncStatusFilter = "all" | "ok" | "partial" | "error" | "skipped";
const VALID_STATUS_FILTERS: SyncStatusFilter[] = ["all", "ok", "partial", "error", "skipped"];
const VALID_SEVERITY_FILTERS: Array<ImpactLevel | "all"> = ["all", "CRITICAL", "HIGH", "MEDIUM", "LOW"];

export interface ConsumerFilterState {
  searchQuery: string;
  severityFilter: ImpactLevel | "all";
  statusFilter: SyncStatusFilter;
}

export function readConsumerFilterState(params: URLSearchParams): ConsumerFilterState {
  const rawStatus = params.get("status");
  const rawSeverity = params.get("severity");

  return {
    searchQuery: params.get("q") || "",
    severityFilter: rawSeverity && VALID_SEVERITY_FILTERS.includes(rawSeverity as ImpactLevel | "all")
      ? (rawSeverity as ImpactLevel | "all")
      : "all",
    statusFilter: rawStatus && VALID_STATUS_FILTERS.includes(rawStatus as SyncStatusFilter)
      ? (rawStatus as SyncStatusFilter)
      : "all",
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

export function writeStatusFilter(
  params: URLSearchParams,
  value: SyncStatusFilter,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value === "all") next.delete("status");
  else next.set("status", value);
  return next;
}
