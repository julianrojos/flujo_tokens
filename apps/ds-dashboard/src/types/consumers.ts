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
  enabled: boolean;
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
}

// Simulation types
export interface AffectedConsumer {
  consumerId: string;
  consumerName: string;
  consumerFileKey: string;
  nodeCount: number;
  sampleNodeIds: string[];
  sampleLinks: string[];
  lastSyncedAt: string;
  freshnessHours: number;
}

export interface SimulationWarning {
  code: string;
  message: string;
  consumerId?: string;
}

export interface SimulationResult {
  variableKey: string;
  variableName: string;
  variableType: string;
  proposedValue: unknown;
  totalNodes: number;
  totalConsumers: number;
  impactLevel: ImpactLevel;
  affectedConsumers: AffectedConsumer[];
  warnings: SimulationWarning[];
  disclaimer: string;
}

// Request types
export interface AddConsumerRequest {
  dsFileKey?: string;
  dsFileUrl?: string;
  consumerFileKey?: string;
  consumerFileUrl?: string;
  consumerName: string;
  enabled?: boolean;
}

export interface SyncConsumersRequest {
  dsFileKey: string;
  consumerIds?: string[];
  force?: boolean;
}

export interface SimulateVariableChangeRequest {
  dsFileKey: string;
  variableKey: string;
  proposedValue: unknown;
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

export interface SimulationResponse {
  ok: true;
  data: SimulationResult;
}

export interface SyncRunsResponse {
  ok: true;
  data: DsSyncRun[];
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
