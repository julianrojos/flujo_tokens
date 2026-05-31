import { useEffect, useMemo, useState } from "react";

import { fetchReportByComponent } from "@/lib/api";
import { useDsFileKey } from "@/hooks/use-ds-file-key";
import {
  buildComponentLookupMap,
  resolveKnownComponentSlug,
  extractComponentParentAlias,
} from "@/lib/component-identity";
import { IMPACT_SORT_ORDER } from "@/lib/impact-level";
import type { ComponentUsageReport, ImpactLevel } from "@/types/consumers";
import type { ComponentCatalogItem } from "@/types/component-catalog";

export interface AggregatedConsumer {
  id: string;
  name: string;
  fileKey: string;
  instances: number;
  lastSyncedAt: string | null;
}

export interface UseComponentAdoptionResult {
  reports: ComponentUsageReport[];
  totalInstances: number;
  consumerCount: number;
  worstImpactLevel: ImpactLevel | null;
  aggregatedConsumers: AggregatedConsumer[];
  loading: boolean;
  error: string | null;
}

/**
 * Load and filter component adoption reports from API.
 */
export async function loadComponentAdoptionReports(args: {
  slug: string | undefined;
  dsFileKey: string | null | undefined;
  allItems: ComponentCatalogItem[];
  fetcher?: typeof fetchReportByComponent;
}): Promise<ComponentUsageReport[]> {
  const { slug, dsFileKey, allItems, fetcher = fetchReportByComponent } = args;
  if (!slug || !dsFileKey) return [];

  const lookup = buildComponentLookupMap(allItems);
  const response = await fetcher(dsFileKey);
  const allReports = Array.isArray(response.data) ? response.data : [];

  return allReports.filter((report: ComponentUsageReport) => {
    const resolvedSlug = resolveKnownComponentSlug({
      lookup,
      parentName: extractComponentParentAlias(report.componentName),
      variantName: report.componentName,
    });
    return resolvedSlug === slug;
  });
}

export function aggregateComponentAdoption(
  reports: ReadonlyArray<ComponentUsageReport>,
): {
  totalInstances: number;
  consumerCount: number;
  worstImpactLevel: ImpactLevel | null;
  aggregatedConsumers: AggregatedConsumer[];
} {
  if (reports.length === 0) {
    return {
      totalInstances: 0,
      consumerCount: 0,
      worstImpactLevel: null,
      aggregatedConsumers: [],
    };
  }

  const totalInstances = reports.reduce((sum, report) => sum + report.totalInstances, 0);

  const consumerMap = new Map<string, AggregatedConsumer>();
  for (const report of reports) {
    for (const consumer of report.consumers) {
      const existing = consumerMap.get(consumer.consumerId);
      if (existing) {
        existing.instances += consumer.instanceCount ?? 0;
      } else {
        consumerMap.set(consumer.consumerId, {
          id: consumer.consumerId,
          name: consumer.consumerName,
          fileKey: consumer.consumerFileKey,
          instances: consumer.instanceCount ?? 0,
          lastSyncedAt: consumer.lastSyncedAt || null,
        });
      }
    }
  }

  let worstImpactLevel: ImpactLevel | null = null;
  let worstImpactRank = Infinity;
  for (const report of reports) {
    const rank = IMPACT_SORT_ORDER[report.impactLevel.level];
    if (rank < worstImpactRank) {
      worstImpactRank = rank;
      worstImpactLevel = report.impactLevel.level;
    }
  }

  const aggregatedConsumers = Array.from(consumerMap.values()).sort(
    (a, b) => b.instances - a.instances,
  );

  return {
    totalInstances,
    consumerCount: consumerMap.size,
    worstImpactLevel,
    aggregatedConsumers,
  };
}

export function useComponentAdoption(args: {
  slug: string | undefined;
  allItems: ComponentCatalogItem[];
}): UseComponentAdoptionResult {
  const { slug, allItems } = args;
  const { dsFileKey } = useDsFileKey();
  const [reports, setReports] = useState<ComponentUsageReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!slug || !dsFileKey) {
      setReports([]);
      setError(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);

    void loadComponentAdoptionReports({
      slug,
      dsFileKey,
      allItems,
    })
      .then((matchingReports) => {
        if (active) {
          setReports(matchingReports);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [slug, dsFileKey, allItems]);

  // Aggregate data from matching reports
  const aggregated = useMemo(() => {
    return aggregateComponentAdoption(reports);
  }, [reports]);

  return {
    reports,
    totalInstances: aggregated.totalInstances,
    consumerCount: aggregated.consumerCount,
    worstImpactLevel: aggregated.worstImpactLevel,
    aggregatedConsumers: aggregated.aggregatedConsumers,
    loading,
    error,
  };
}
