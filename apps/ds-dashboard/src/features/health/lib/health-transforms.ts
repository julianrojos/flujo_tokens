/**
 * Pure utility functions for health-dashboard feature.
 * No React hooks, no JSX — pure transformations only.
 */

import type { HealthHistoryRange } from "@/types/health-history";

/**
 * Format ISO date string to locale string
 */
export function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

/**
 * Get badge variant for component status
 */
export function componentStatusBadge(status: string): "success" | "warning" | "neutral" {
  if (status === "ready") return "success" as const;
  if (status === "needs-review") return "warning" as const;
  return "neutral" as const;
}

/**
 * Get order index for pipeline stage (for sorting)
 */
export function stageOrder(stage: string): number {
  const order: Record<string, number> = {
    "missing-spec": 0,
    spec: 1,
    markdown: 2,
    render: 3,
    "visual-proof": 4,
  };
  return order[stage] ?? 99;
}

/**
 * Labels for history range options
 */
export const RANGE_LABEL: Record<HealthHistoryRange, string> = {
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 90 days",
};
