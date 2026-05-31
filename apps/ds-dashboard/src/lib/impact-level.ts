/**
 * Impact Level Ordering
 *
 * Shared severity ordering for consumer impact levels.
 * Lower number = more severe.
 */

import type { ImpactLevel } from "@/types/consumers";

/**
 * Impact severity ordering (lower = more severe)
 */
export const IMPACT_SORT_ORDER: Record<ImpactLevel, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};
