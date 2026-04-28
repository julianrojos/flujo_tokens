import type {
  ConsumerUsageDetails,
  DsConsumer,
  DsSyncRun,
  UsageScope,
} from "@/types/consumers";

export type ConsumerWithUsageDetails = DsConsumer & { latestSync?: DsSyncRun };

export interface UsageScopeSummary {
  page: number;
  localComponent: number;
  nestedLocalComponent: number;
}

export interface ConsumerUsageSnapshotSummary {
  componentShape: UsageScopeSummary;
  tokenShape: UsageScopeSummary;
  directParentUsageCount: number;
  localComponentGraphCount: number;
}

export interface ComponentUsageScopeSummary {
  wrapperCount: number;
  usageScope: UsageScopeSummary;
}

export interface ComponentLocalDependencySummary {
  componentKey: string;
  componentName: string;
  usageCount: number;
  consumerCount: number;
}

export interface VariableUsageScopeSummary {
  bindingOccurrenceCount: number;
  usageScope: UsageScopeSummary;
}

function createEmptyScopeSummary(): UsageScopeSummary {
  return { page: 0, localComponent: 0, nestedLocalComponent: 0 };
}

function incrementScope(summary: UsageScopeSummary, scope: UsageScope, amount = 1): void {
  if (scope === "local-component") {
    summary.localComponent += amount;
    return;
  }
  if (scope === "nested-local-component") {
    summary.nestedLocalComponent += amount;
    return;
  }
  summary.page += amount;
}

export function summarizeUsageDetails(
  usageDetails: ConsumerUsageDetails | null | undefined,
): ConsumerUsageSnapshotSummary | null {
  if (!usageDetails) return null;

  return {
    componentShape: usageDetails.usageShape.components,
    tokenShape: usageDetails.usageShape.tokens,
    directParentUsageCount: usageDetails.parentComponentUsages.length,
    localComponentGraphCount: usageDetails.localComponentGraph.length,
  };
}

export function buildComponentUsageScopeSummary(
  consumers: ConsumerWithUsageDetails[],
): Map<string, ComponentUsageScopeSummary> {
  const aggregates = new Map<
    string,
    {
      wrapperKeys: Set<string>;
      usageScope: UsageScopeSummary;
    }
  >();

  for (const consumer of consumers) {
    const usageDetails = consumer.latestSync?.usageDetails;
    if (!usageDetails) continue;

    for (const entry of usageDetails.parentComponentUsages) {
      if (!entry.parentComponentKey) continue;
      const current = aggregates.get(entry.parentComponentKey) || {
        wrapperKeys: new Set<string>(),
        usageScope: createEmptyScopeSummary(),
      };
      current.wrapperKeys.add(`${consumer.id}\u0000${entry.localComponentKey}`);
      incrementScope(current.usageScope, entry.usageScope, entry.usageCount);
      aggregates.set(entry.parentComponentKey, current);
    }
  }

  return new Map(
    Array.from(aggregates.entries(), ([componentKey, entry]) => [
      componentKey,
      {
        wrapperCount: entry.wrapperKeys.size,
        usageScope: entry.usageScope,
      },
    ]),
  );
}

export function buildComponentLocalDependencySummary(
  consumers: ConsumerWithUsageDetails[],
): Map<string, Map<string, ComponentLocalDependencySummary>> {
  const aggregates = new Map<
    string,
    Map<
      string,
      {
        usageCount: number;
        localComponentName: string;
        consumerIds: Set<string>;
      }
    >
  >();

  for (const consumer of consumers) {
    const usageDetails = consumer.latestSync?.usageDetails;
    if (!usageDetails) continue;

    for (const entry of usageDetails.localComponentGraph) {
      if (!entry.parentComponentKey || !entry.childComponentKey) continue;
      const parentEntry = aggregates.get(entry.childComponentKey) || new Map();
      const current = parentEntry.get(entry.parentComponentKey) || {
        usageCount: 0,
        localComponentName: entry.parentComponentName,
        consumerIds: new Set<string>(),
      };
      current.usageCount += entry.usageCount;
      if (!current.localComponentName) {
        current.localComponentName = entry.parentComponentName;
      }
      current.consumerIds.add(consumer.id);
      parentEntry.set(entry.parentComponentKey, current);
      aggregates.set(entry.childComponentKey, parentEntry);
    }
  }

  return new Map(
    Array.from(aggregates.entries(), ([childComponentKey, children]) => [
      childComponentKey,
      new Map(
        Array.from(children.entries(), ([parentComponentKey, entry]) => [
          parentComponentKey,
          {
            componentKey: parentComponentKey,
            componentName: entry.localComponentName,
            usageCount: entry.usageCount,
            consumerCount: entry.consumerIds.size,
          },
        ]),
      ),
    ]),
  );
}

export function buildVariableUsageScopeSummary(
  consumers: ConsumerWithUsageDetails[],
): Map<string, VariableUsageScopeSummary> {
  const aggregates = new Map<
    string,
    {
      bindingOccurrenceCount: number;
      usageScope: UsageScopeSummary;
    }
  >();

  for (const consumer of consumers) {
    const usageDetails = consumer.latestSync?.usageDetails;
    if (!usageDetails) continue;

    for (const entry of usageDetails.tokenBindingDetails) {
      for (const binding of entry.bindings) {
        if (!binding.variableKey) continue;
        const current = aggregates.get(binding.variableKey) || {
          bindingOccurrenceCount: 0,
          usageScope: createEmptyScopeSummary(),
        };
        current.bindingOccurrenceCount += 1;
        incrementScope(current.usageScope, entry.usageScope);
        aggregates.set(binding.variableKey, current);
      }
    }
  }

  return new Map(
    Array.from(aggregates.entries(), ([variableKey, entry]) => [
      variableKey,
      {
        bindingOccurrenceCount: entry.bindingOccurrenceCount,
        usageScope: entry.usageScope,
      },
    ]),
  );
}
