/**
 * Adoption metrics utilities for Consumers feature
 *
 * Pure functions for computing DS vs Non-DS adoption states.
 * No React dependencies — safe for unit testing and reuse.
 */

import type { FileReport } from "@/types/consumers";

/**
 * Display state for adoption UI
 * Encapsulates all rendering decisions in one type
 */
export interface AdoptionDisplayState {
  /** DS usage count (components + variables) */
  totalDsUsed: number;
  /** Non-DS usage count (local + other libraries), or null if unavailable */
  totalLocalUsed: number | null;
  /** Adoption percentage (0-100), or null if unavailable */
  percentage: number | null;
  /** Show "N/A" badge (zero total usage) */
  showNA: boolean;
  /** Show "—" unavailable indicator */
  showUnavailable: boolean;
  /** Show adoption bar */
  showBar: boolean;
  /** Show "Partial" badge (some local counts missing) */
  showPartial: boolean;
  /** Percentage label for display (e.g., "78%") */
  percentageLabel: string;
}

/**
 * Compute adoption rate safely with null handling
 * Returns null when local usage is unavailable
 */
export function computeAdoptionRateSafe(
  dsUsed: number,
  localUsed: number | null | undefined,
): number | null {
  if (localUsed == null) return null;
  const total = dsUsed + localUsed;
  if (total === 0) return null;
  return dsUsed / total;
}

/**
 * Check if local usage data is partial (some dimensions available, some not)
 */
export function isPartialLocalUsage(
  localComponentUsedCount: number | null | undefined,
  localVariableUsedCount: number | null | undefined,
): boolean {
  const hasComponent = localComponentUsedCount != null;
  const hasVariable = localVariableUsedCount != null;
  return (hasComponent || hasVariable) && !(hasComponent && hasVariable);
}

/**
 * Build adoption display state for aggregate (table row)
 * Uses backend adoptionRate when available, derives state around it
 */
export function buildAggregateAdoptionState(report: FileReport): AdoptionDisplayState {
  const hasAllLocal =
    report.localComponentUsedCount != null && report.localVariableUsedCount != null;
  const isPartial = isPartialLocalUsage(
    report.localComponentUsedCount,
    report.localVariableUsedCount,
  );

  const totalDsUsed = report.componentCount + report.variableCount;
  const totalLocalUsed =
    report.localComponentUsedCount != null && report.localVariableUsedCount != null
      ? report.localComponentUsedCount + report.localVariableUsedCount
      : null;

  // Use backend adoptionRate when available
  const percentage = report.adoptionRate != null ? report.adoptionRate * 100 : null;

  // Determine display state
  const isZeroTotal =
    hasAllLocal && totalDsUsed === 0 && totalLocalUsed === 0;

  return {
    totalDsUsed,
    totalLocalUsed,
    percentage,
    showNA: report.adoptionRate == null && isZeroTotal,
    showUnavailable: report.adoptionRate == null && !isZeroTotal,
    showBar: report.adoptionRate != null,
    showPartial: isPartial,
    percentageLabel: percentage != null ? `${Math.round(percentage)}%` : "",
  };
}

/**
 * Build adoption display state for single dimension (detail page bars)
 * Used for components-only or variables-only breakdown
 */
export function buildDimensionAdoptionState(
  dsUsed: number,
  localUsed: number | null | undefined,
): AdoptionDisplayState {
  const normalizedLocalUsed = localUsed ?? null;
  const ratio = computeAdoptionRateSafe(dsUsed, normalizedLocalUsed);
  const percentage = ratio != null ? ratio * 100 : null;
  const hasData = normalizedLocalUsed != null;
  const total = dsUsed + (normalizedLocalUsed ?? 0);
  const isZeroTotal = hasData && total === 0;

  return {
    totalDsUsed: dsUsed,
    totalLocalUsed: normalizedLocalUsed,
    percentage,
    showNA: isZeroTotal,
    showUnavailable: !hasData,
    showBar: hasData && total > 0,
    showPartial: false, // Per-dimension, no partial state
    percentageLabel: percentage != null ? `${Math.round(percentage)}%` : "",
  };
}

/**
 * Format percentage for display with rounding
 */
export function formatAdoptionPercentage(rate: number | null): string {
  if (rate == null) return "";
  return `${Math.round(rate * 100)}%`;
}

