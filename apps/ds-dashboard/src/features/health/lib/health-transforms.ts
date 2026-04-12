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
 * Labels for history range options
 */
export const RANGE_LABEL: Record<HealthHistoryRange, string> = {
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 90 days",
};
