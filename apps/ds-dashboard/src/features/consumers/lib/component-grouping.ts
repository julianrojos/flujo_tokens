/**
 * Component grouping utilities for Consumers feature
 *
 * Pure functions for grouping Figma component variants by parent component.
 * No React dependencies — safe for unit testing and reuse.
 */

import type { ImpactLevel, SampleNodeRef } from "@/types/consumers";
import { IMPACT_SORT_ORDER } from "@/lib/impact-level";
import { dedupeSampleNodes } from "@/lib/sample-node-utils";
import { splitComponentName } from "@/lib/component-identity";

/**
 * Internal component variant representation
 */
export interface ComponentVariant {
  componentKey: string;
  componentName: string;   // nombre completo Figma
  variantLabel: string;    // parte tras el primer "/", o "" si no hay "/"
  instances: number;
  impactLevel: { level: ImpactLevel; description: string };
  sampleLinks: string[];
  sampleNodes: SampleNodeRef[];
}

/**
 * Grouped component with aggregated metadata
 */
export interface ComponentGroup {
  parentName: string;        // parte antes del primer "/", o nombre completo
  totalInstances: number;
  worstImpactLevel: { level: ImpactLevel; description: string };
  sampleLinks: string[];     // union deduplicada de todas las variantes
  sampleNodes: SampleNodeRef[];
  variants: ComponentVariant[]; // sorted: more severe first (CRITICAL → LOW), then instances desc
}

/**
 * Consumer component type (subset of ComponentUsageReport)
 * Used as input for groupByParentComponent
 */
export interface ConsumerComponent {
  componentKey: string;
  componentName: string;
  instances: number;
  impactLevel: { level: ImpactLevel; description: string };
  sampleLinks: string[];
  sampleNodes?: SampleNodeRef[];
}

/**
 * Group component variants by parent component name
 *
 * @param components - Array of component usage records
 * @param filterZeroInstances - If true (default), hide variants with 0 instances for this consumer
 * @returns Grouped components sorted by worst impact (more severe first: CRITICAL → LOW), then total instances desc
 */
export function groupByParentComponent(
  components: ReadonlyArray<ConsumerComponent>,
  filterZeroInstances: boolean = true
): ComponentGroup[] {
  if (components.length === 0) {
    return [];
  }

  // Group variants by parent name
  const variantsByParent = new Map<string, ComponentVariant[]>();

  for (const comp of components) {
    // Filter out variants with 0 instances if requested
    if (filterZeroInstances && comp.instances === 0) {
      continue;
    }

    const { parentName, variantLabel, isBareVariantAssignment } = splitComponentName(comp.componentName);

    // Skip bare variant assignments with no identifiable parent (e.g. "State=Active", "Size=Small")
    if (isBareVariantAssignment) {
      continue;
    }

    const variant: ComponentVariant = {
      componentKey: comp.componentKey,
      componentName: comp.componentName,
      variantLabel,
      instances: comp.instances,
      impactLevel: comp.impactLevel,
      sampleLinks: comp.sampleLinks,
      sampleNodes: dedupeSampleNodes(comp.sampleNodes ?? [], 20),
    };

    if (!variantsByParent.has(parentName)) {
      variantsByParent.set(parentName, []);
    }
    variantsByParent.get(parentName)!.push(variant);
  }

  // Convert to ComponentGroup[]
  const groups: ComponentGroup[] = [];

  for (const [parentName, variants] of variantsByParent.entries()) {
    // Sort variants within group: more severe impact first (CRITICAL → LOW), then instances desc
    variants.sort((a, b) => {
      const impactDiff = IMPACT_SORT_ORDER[a.impactLevel.level] - IMPACT_SORT_ORDER[b.impactLevel.level];
      if (impactDiff !== 0) return impactDiff;
      return b.instances - a.instances;
    });

    // Compute aggregated metadata
    const totalInstances = variants.reduce((sum, v) => sum + v.instances, 0);

    // Worst impact = first variant (already sorted)
    const worstImpactLevel = variants[0].impactLevel;

    // Deduplicate sample links across all variants
    const sampleLinks = [...new Set(variants.flatMap(v => v.sampleLinks))];
    const sampleNodes = dedupeSampleNodes(variants.flatMap((variant) => variant.sampleNodes), 20);

    groups.push({
      parentName,
      totalInstances,
      worstImpactLevel,
      sampleLinks,
      sampleNodes,
      variants,
    });
  }

  // Sort groups: more severe impact first (CRITICAL → LOW), then by total instances desc
  groups.sort((a, b) => {
    const impactDiff = IMPACT_SORT_ORDER[a.worstImpactLevel.level] - IMPACT_SORT_ORDER[b.worstImpactLevel.level];
    if (impactDiff !== 0) return impactDiff;
    return b.totalInstances - a.totalInstances;
  });

  return groups;
}
