/**
 * Types for cross-file dependency tracking feature
 * Matches backend API responses with frontend-friendly camelCase naming
 */

// Core entity types
export interface DsConsumer {
  id: string;
  dsFileKey: string;
  consumerFileKey: string;
  consumerName: string;
  createdAt: string;
}

export interface DsSyncRun {
  id: string;
  consumerId: string;
  syncedAt: string;
  durationMs: number;
  status: 'ok' | 'error' | 'partial' | 'skipped';
  errorMessage?: string;
  dsLastModified?: string;
  consumerLastModified?: string;
  componentCount: number;
  variableCount: number;
  warningCount: number;
  localComponentUsedCount?: number | null;
  parentDerivedComponentCount?: number | null;
  localVariableDefinedCount?: number | null;
  localVariableUsedCount?: number | null;
  usageDetails?: ConsumerUsageDetails | null;
}

export type UsageScope = "page" | "local-component" | "nested-local-component";

export interface SampleNodeRef {
  nodeId: string;
  pageName: string;
}

export interface ConsumerUsageDetails {
  parentComponentUsages: Array<{
    localComponentKey: string;
    localComponentName: string;
    parentComponentKey: string;
    parentComponentName: string;
    usageScope: UsageScope;
    usageCount: number;
    sampleNodeIds: string[];
  }>;
  localComponentGraph: Array<{
    parentComponentKey: string;
    parentComponentName: string;
    childComponentKey: string;
    childComponentName: string;
    usageCount: number;
    sampleNodeIds: string[];
  }>;
  componentPropertyUsages: Array<{
    nodeId: string;
    nodeName: string;
    componentKey: string;
    componentName: string;
    usageScope: UsageScope;
    localComponentKey?: string;
    localComponentName?: string;
    properties: Array<{
      name: string;
      value: string;
      valueType: string;
    }>;
  }>;
  tokenBindingDetails: Array<{
    nodeId: string;
    nodeName: string;
    usageScope: UsageScope;
    localComponentKey?: string;
    localComponentName?: string;
    bindings: Array<{
      field: string;
      variableId: string;
      variableKey: string | null;
      variableName: string | null;
      variableType: string | null;
      status: "resolved" | "unresolved";
      resolvedTokenPath: string | null;
    }>;
  }>;
  usageShape: {
    components: {
      page: number;
      localComponent: number;
      nestedLocalComponent: number;
    };
    tokens: {
      page: number;
      localComponent: number;
      nestedLocalComponent: number;
    };
  };
}

// API response wrappers
export interface ConsumersResponse {
  ok: true;
  data: DsConsumer[];
}

export interface SyncRunSummary {
  ok: true;
  data: {
    totalConsumers: number;
    syncedCount: number;
    errorCount: number;
    skippedCount: number;
    partialCount: number;
    totalDuration: number;
    results: Array<{
      consumerId: string;
      consumerName: string;
      status: DsSyncRun['status'];
      errorMessage?: string;
      durationMs: number;
      componentCount: number;
      variableCount: number;
      warningCount: number;
      localComponentUsedCount?: number | null;
      parentDerivedComponentCount?: number | null;
      localVariableDefinedCount?: number | null;
      localVariableUsedCount?: number | null;
    }>;
  };
}

export interface SyncResult {
  ok: true;
  data: SyncRunSummary['data'];
}

// Analysis report types
export type ImpactLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface ConsumerUsage {
  consumerId: string;
  consumerName: string;
  consumerFileKey: string;
  instanceCount?: number; // For components
  nodeCount?: number; // For variables
  sampleNodeIds: string[];
  sampleNodes?: SampleNodeRef[];
  lastSyncedAt: string;
  sampleLinks: string[];
}

export interface ComponentUsageReport {
  componentKey: string;
  componentName: string;
  totalInstances: number;
  consumers: ConsumerUsage[];
  impactLevel: {
    level: ImpactLevel;
    description: string;
  };
  sampleLinks: string[];
}

export interface VariableUsageReport {
  variableKey: string;
  variableName: string;
  variableType: string;
  totalNodes: number;
  consumers: ConsumerUsage[];
  impactLevel: {
    level: ImpactLevel;
    description: string;
  };
  sampleLinks: string[];
}

export interface FileReport {
  consumerId: string;
  consumerName: string;
  consumerFileKey: string;
  lastSyncedAt: string;
  status: DsSyncRun['status'];
  componentCount: number;
  variableCount: number;
  warningCount: number;
  topComponents: Array<{
    componentKey: string;
    componentName: string;
    instanceCount: number;
    sampleLinks: string[];
  }>;
  topVariables: Array<{
    variableKey: string;
    variableName: string;
    variableType: string;
    nodeCount: number;
    sampleLinks: string[];
  }>;
  impactLevel: {
    level: ImpactLevel;
    description: string;
  };
  localComponentUsedCount?: number | null;
  parentDerivedComponentCount?: number | null;
  localVariableDefinedCount?: number | null;
  localVariableUsedCount?: number | null;
}

// Request types
export interface AddConsumerRequest {
  dsFileKey?: string;
  consumerFileKey?: string;
  consumerFileUrl?: string;
  consumerName: string;
}

export interface SyncConsumersRequest {
  dsFileKey: string;
  consumerIds?: string[];
  force?: boolean;
}

// Response types for API endpoints
export interface ByFileReportResponse {
  ok: true;
  data: FileReport[];
}

export interface ByComponentReportResponse {
  ok: true;
  data: ComponentUsageReport[];
}

export interface ByVariableReportResponse {
  ok: true;
  data: VariableUsageReport[];
}

// Common filter/sort types
export interface ConsumerFilters {
  search?: string;
  severity?: ImpactLevel;
  stale?: boolean;
}

export interface ConsumerSort {
  field: 'name' | 'lastSyncedAt' | 'componentCount' | 'variableCount';
  direction: 'asc' | 'desc';
}
