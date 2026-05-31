import type { ComponentCatalogItem } from "@/types/component-catalog";
import type { ComponentUsageReport, ImpactLevel } from "@/types/consumers";
import { IMPACT_SORT_ORDER } from "@/lib/impact-level";
import {
  buildComponentLookupMap,
  extractComponentParentAlias,
  normalizeComponentLookupKey,
  resolveKnownComponentSlug,
  splitComponentName,
} from "@/lib/component-identity";
import { getComponentTableDisplayInfo } from "./component-table-display";
import { computeCoveragePercent, toNonNegativeInt } from "./consumer-math";

export interface ConsumerTopComponentRankingRow {
  componentKey: string;
  componentName: string;
  resolvedSlug: string | null;
  isUncatalogued: boolean;
  impactLevel: {
    level: ImpactLevel;
    description: string;
  };
  coveragePercent: number | null;
  totalInstances: number;
  consumers: number;
}

function pickWorstImpact(
  current: { level: ImpactLevel; description: string } | undefined,
  candidate: { level: ImpactLevel; description: string },
): { level: ImpactLevel; description: string } {
  if (!current) return candidate;
  return IMPACT_SORT_ORDER[candidate.level] < IMPACT_SORT_ORDER[current.level] ? candidate : current;
}

function buildComponentDisplayNameByVariantLookup(
  componentCatalog: ReadonlyArray<ComponentCatalogItem>,
): Map<string, string> {
  const lookup = new Map<string, string>();
  const ambiguous = new Set<string>();

  for (const item of componentCatalog) {
    const parentDisplayName = String(item.display_name || "").trim();
    if (!parentDisplayName) continue;

    for (const variant of item.figma?.variants || []) {
      const variantName = String(variant?.name || "").trim();
      if (!variantName) continue;

      const candidates = new Set<string>([variantName]);
      const parsedVariant = getComponentTableDisplayInfo({ componentName: variantName });
      if (parsedVariant.variantLabel) {
        candidates.add(parsedVariant.variantLabel);
      }

      for (const candidate of candidates) {
        const key = normalizeComponentLookupKey(extractComponentParentAlias(candidate));
        if (!key || ambiguous.has(key)) continue;
        const current = lookup.get(key);
        if (!current) {
          lookup.set(key, parentDisplayName);
          continue;
        }
        if (current !== parentDisplayName) {
          lookup.delete(key);
          ambiguous.add(key);
        }
      }
    }
  }

  return lookup;
}

export function buildConsumerTopComponentRankingRows(
  reports: ReadonlyArray<ComponentUsageReport>,
  totalConsumers: number,
  componentCatalog: ReadonlyArray<ComponentCatalogItem>,
): ConsumerTopComponentRankingRow[] {
  if (reports.length === 0) return [];

  const componentSlugByLookup = buildComponentLookupMap(componentCatalog);
  const componentDisplayNameBySlug = new Map(componentCatalog.map((item) => [item.slug, item.display_name]));
  const componentDisplayNameByVariant = buildComponentDisplayNameByVariantLookup(componentCatalog);

  const groups = new Map<
    string,
    {
      componentKey: string;
      componentName: string;
      resolvedSlug: string | null;
      hasCatalogSignal: boolean;
      impactLevel?: { level: ImpactLevel; description: string };
      totalInstances: number;
      consumerIds: Set<string>;
    }
  >();

  for (const report of reports) {
    const normalizedComponentName = normalizeComponentLookupKey(report.componentName);
    const splitName = splitComponentName(report.componentName);
    const resolvedSlug = resolveKnownComponentSlug({
      lookup: componentSlugByLookup,
      parentName: extractComponentParentAlias(report.componentName),
      variantName: report.componentName,
    });
    const parentDisplayName = resolvedSlug
      ? componentDisplayNameBySlug.get(resolvedSlug)
      : componentDisplayNameByVariant.get(normalizedComponentName);
    // When the report entry is a bare variant (e.g. "Icon_Position=Left") that maps
    // to a known parent display name but has no direct slug, recover the parent slug
    // so the detail-page link can still be rendered.
    const effectiveSlug =
      resolvedSlug ??
      (parentDisplayName
        ? (componentSlugByLookup[normalizeComponentLookupKey(parentDisplayName)] ?? null)
        : null);
    const displayInfo = getComponentTableDisplayInfo({
      componentName: report.componentName,
      parentDisplayName,
    });
    const displayName = displayInfo.componentLabel || parentDisplayName || report.componentName || "(unnamed component)";
    const isBareVariantAssignment = splitName.isBareVariantAssignment;
    if (isBareVariantAssignment && !resolvedSlug && !parentDisplayName) {
      continue;
    }

    const fallbackKey = normalizeComponentLookupKey(displayName) || normalizeComponentLookupKey(report.componentName);
    const internalKey =
      effectiveSlug !== null
        ? `slug:${effectiveSlug}`
        : parentDisplayName
          ? `catalog:${fallbackKey}`
          : fallbackKey
            ? `name:${fallbackKey}`
            : "";
    if (!internalKey) continue;

    const group = groups.get(internalKey);
    if (!group) {
      groups.set(internalKey, {
        componentKey: internalKey,
        componentName: displayName,
        resolvedSlug: effectiveSlug,
        hasCatalogSignal: Boolean(parentDisplayName || effectiveSlug),
        impactLevel: report.impactLevel,
        totalInstances: toNonNegativeInt(report.totalInstances),
        consumerIds: new Set(report.consumers.map((consumer) => consumer.consumerId)),
      });
      continue;
    }

    if (effectiveSlug) {
      if (!group.resolvedSlug) {
        group.resolvedSlug = effectiveSlug;
      } else if (group.resolvedSlug !== effectiveSlug) {
        group.resolvedSlug = null;
      }
    }
    if (parentDisplayName && !group.hasCatalogSignal) {
      group.componentName = displayName;
    }
    group.hasCatalogSignal = group.hasCatalogSignal || Boolean(parentDisplayName || effectiveSlug);
    group.impactLevel = pickWorstImpact(group.impactLevel, report.impactLevel);
    group.totalInstances += toNonNegativeInt(report.totalInstances);
    for (const consumer of report.consumers) {
      group.consumerIds.add(consumer.consumerId);
    }
  }

  return [...groups.values()]
    .map((group) => ({
      componentKey: group.componentKey,
      componentName: group.componentName,
      resolvedSlug: group.resolvedSlug,
      isUncatalogued: !group.resolvedSlug && !group.hasCatalogSignal,
      impactLevel: group.impactLevel ?? { level: "LOW", description: "" },
      coveragePercent: computeCoveragePercent(group.consumerIds.size, totalConsumers),
      totalInstances: group.totalInstances,
      consumers: group.consumerIds.size,
    }))
    .sort((left, right) => {
      if (right.totalInstances !== left.totalInstances) {
        return right.totalInstances - left.totalInstances;
      }
      if (right.consumers !== left.consumers) {
        return right.consumers - left.consumers;
      }
      const nameComparison = left.componentName.localeCompare(right.componentName);
      if (nameComparison !== 0) return nameComparison;
      return left.componentKey.localeCompare(right.componentKey);
    });
}
