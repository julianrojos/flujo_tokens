import type { ComponentUsageReport } from "@/types/consumers";
import { IMPACT_SORT_ORDER, splitVariantName } from "./component-grouping";

export interface ComponentSetVariantView {
  componentKey: string;
  componentName: string;
  variantLabel: string;
  totalInstances: number;
  consumerCount: number;
  impactLevel: ComponentUsageReport["impactLevel"];
  sampleLinks: string[];
}

/**
 * Derive variant rows for a component-set detail page from by-component reports.
 * Sorted by impact level (CRITICAL → LOW), then by total instances desc.
 */
export function deriveComponentSetVariants(
  reports: ReadonlyArray<ComponentUsageReport>,
  componentSetName: string,
): ComponentSetVariantView[] {
  const normalizedTarget = String(componentSetName || "").trim().toLowerCase();
  if (!normalizedTarget) return [];

  return reports
    .filter((report) => {
      const { parentName } = splitVariantName(report.componentName);
      return parentName.trim().toLowerCase() === normalizedTarget;
    })
    .map((report) => {
      const { variantLabel } = splitVariantName(report.componentName);
      const fullName = String(report.componentName || "").trim();

      return {
        componentKey: report.componentKey,
        componentName: report.componentName,
        variantLabel,
        totalInstances: report.totalInstances ?? 0,
        consumerCount: Array.isArray(report.consumers) ? report.consumers.length : 0,
        impactLevel: report.impactLevel,
        sampleLinks: report.sampleLinks ?? [],
      };
    })
    .sort((left, right) => {
      // Sort by impact level first (CRITICAL → LOW), then by total instances desc
      const impactDiff = IMPACT_SORT_ORDER[left.impactLevel.level] - IMPACT_SORT_ORDER[right.impactLevel.level];
      if (impactDiff !== 0) return impactDiff;
      const instanceDiff = right.totalInstances - left.totalInstances;
      if (instanceDiff !== 0) return instanceDiff;
      const nameDiff = left.componentName.localeCompare(right.componentName, "en", { sensitivity: "base" });
      if (nameDiff !== 0) return nameDiff;
      return left.componentKey.localeCompare(right.componentKey, "en", { sensitivity: "base" });
    });
}
