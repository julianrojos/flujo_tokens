import type {
  ComponentUsageReport,
  DsConsumer,
  DsSyncRun,
  ImpactLevel,
  VariableUsageReport,
} from "@/types/consumers";
import { computeCoveragePercent, countUniqueConsumerIds, toNonNegativeInt } from "./consumer-math";

export interface ConsumerOverviewSummary {
  activeConsumers: number;
  totalComponentUsage: number;
  totalVariableUsage: number;
}

export interface ConsumerOverviewRow {
  consumerId: string;
  consumerName: string;
  consumerFileKey: string;
  latestSync?: DsSyncRun;
  componentUsage: {
    used: number;
    total: number;
    adoptionPercent: number | null;
  };
  variableUsage: {
    used: number;
    total: number;
    adoptionPercent: number | null;
  };
}

export interface ConsumerComponentRankingRow {
  componentKey: string;
  componentName: string;
  impactLevel: {
    level: ImpactLevel;
    description: string;
  };
  coveragePercent: number | null;
  totalInstances: number;
  consumers: number;
}

export interface ConsumerVariableRankingRow {
  variableKey: string;
  variableName: string;
  impactLevel: {
    level: ImpactLevel;
    description: string;
  };
  coveragePercent: number | null;
  totalNodes: number;
  consumers: number;
}

function computeAdoptionPercent(used: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((used / total) * 100);
}

function computeDsUsage(total: number, localCount: number | null | undefined): number {
  const normalizedTotal = toNonNegativeInt(total);
  const normalizedLocal = localCount == null ? 0 : toNonNegativeInt(localCount);
  return Math.max(0, normalizedTotal - normalizedLocal);
}

export function buildConsumerOverviewSummary(
  consumers: ReadonlyArray<DsConsumer & { latestSync?: DsSyncRun }>,
): ConsumerOverviewSummary {
  let totalComponentUsage = 0;
  let totalVariableUsage = 0;

  for (const consumer of consumers) {
    const latestSync = consumer.latestSync;
    if (!latestSync) continue;
    totalComponentUsage += computeDsUsage(
      latestSync.componentCount,
      latestSync.localComponentUsedCount ?? null,
    );
    totalVariableUsage += computeDsUsage(
      latestSync.variableCount,
      latestSync.localVariableUsedCount ?? null,
    );
  }

  return {
    activeConsumers: consumers.length,
    totalComponentUsage,
    totalVariableUsage,
  };
}

export function buildConsumerOverviewRows(
  consumers: ReadonlyArray<DsConsumer & { latestSync?: DsSyncRun }>,
): ConsumerOverviewRow[] {
  return [...consumers]
    .map((consumer) => {
      const latestSync = consumer.latestSync;
      const componentTotal = toNonNegativeInt(latestSync?.componentCount);
      const variableTotal = toNonNegativeInt(latestSync?.variableCount);
      const componentUsed = latestSync
        ? computeDsUsage(latestSync.componentCount, latestSync.localComponentUsedCount ?? null)
        : 0;
      const variableUsed = latestSync
        ? computeDsUsage(latestSync.variableCount, latestSync.localVariableUsedCount ?? null)
        : 0;

      return {
        consumerId: consumer.id,
        consumerName: consumer.consumerName,
        consumerFileKey: consumer.consumerFileKey,
        latestSync,
        componentUsage: {
          used: componentUsed,
          total: componentTotal,
          adoptionPercent: computeAdoptionPercent(componentUsed, componentTotal),
        },
        variableUsage: {
          used: variableUsed,
          total: variableTotal,
          adoptionPercent: computeAdoptionPercent(variableUsed, variableTotal),
        },
      };
    })
    .sort((left, right) => {
      if (right.componentUsage.used !== left.componentUsage.used) {
        return right.componentUsage.used - left.componentUsage.used;
      }
      if (right.variableUsage.used !== left.variableUsage.used) {
        return right.variableUsage.used - left.variableUsage.used;
      }
      const nameComparison = left.consumerName.localeCompare(right.consumerName);
      if (nameComparison !== 0) return nameComparison;
      return left.consumerId.localeCompare(right.consumerId);
    });
}

export function buildConsumerComponentRankingRows(
  reports: ReadonlyArray<ComponentUsageReport>,
  totalConsumers: number,
): ConsumerComponentRankingRow[] {
  return [...reports]
    .map((report) => {
      const uniqueConsumers = countUniqueConsumerIds(report.consumers);
      return {
        componentKey: report.componentKey,
        componentName: report.componentName,
        impactLevel: report.impactLevel,
        coveragePercent: computeCoveragePercent(uniqueConsumers, totalConsumers),
        totalInstances: toNonNegativeInt(report.totalInstances),
        consumers: uniqueConsumers,
      };
    })
    .sort((left, right) => {
      if (right.totalInstances !== left.totalInstances) {
        return right.totalInstances - left.totalInstances;
      }
      if (right.consumers !== left.consumers) {
        return right.consumers - left.consumers;
      }
      return left.componentName.localeCompare(right.componentName);
    });
}

export function buildConsumerVariableRankingRows(
  reports: ReadonlyArray<VariableUsageReport>,
  totalConsumers: number,
): ConsumerVariableRankingRow[] {
  return [...reports]
    .map((report) => {
      const uniqueConsumers = countUniqueConsumerIds(report.consumers);
      return {
        variableKey: report.variableKey,
        variableName: report.variableName,
        impactLevel: report.impactLevel,
        coveragePercent: computeCoveragePercent(uniqueConsumers, totalConsumers),
        totalNodes: toNonNegativeInt(report.totalNodes),
        consumers: uniqueConsumers,
      };
    })
    .sort((left, right) => {
      if (right.totalNodes !== left.totalNodes) {
        return right.totalNodes - left.totalNodes;
      }
      if (right.consumers !== left.consumers) {
        return right.consumers - left.consumers;
      }
      return left.variableName.localeCompare(right.variableName);
    });
}
