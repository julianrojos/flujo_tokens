import { DependencyRepository } from '../db/dependency-repository.js';

// Types for analysis reports
export interface ImpactLevel {
  level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
}

export interface ComponentUsage {
  componentKey: string;
  componentName: string;
  totalInstances: number;
  consumers: ConsumerUsage[];
  impactLevel: ImpactLevel;
  sampleLinks: string[];
}

export interface VariableUsage {
  variableKey: string;
  variableName: string;
  variableType: string;
  totalNodes: number;
  consumers: ConsumerUsage[];
  impactLevel: ImpactLevel;
  sampleLinks: string[];
}

export interface ConsumerUsage {
  consumerId: string;
  consumerName: string;
  consumerFileKey: string;
  instanceCount?: number;  // For components
  nodeCount?: number;      // For variables
  sampleNodeIds: string[];
  lastSyncedAt: string;
  sampleLinks: string[];
}

export interface FileReport {
  consumerId: string;
  consumerName: string;
  consumerFileKey: string;
  lastSyncedAt: string;
  status: 'ok' | 'error' | 'partial' | 'skipped';
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
  impactLevel: ImpactLevel;
  localComponentUsedCount?: number | null;
  parentDerivedComponentCount?: number | null;
  localVariableDefinedCount?: number | null;
  localVariableUsedCount?: number | null;
  adoptionRate?: number | null;
}

export interface AnalysisOptions {
  nodeCountThresholds?: {
    critical?: number;
    high?: number;
    medium?: number;
  };
  fileCountThresholds?: {
    critical?: number;
    high?: number;
    medium?: number;
  };
  maxSampleLinks?: number;
}

const DEFAULT_THRESHOLDS = {
  nodeCount: {
    critical: 50,
    high: 20,
    medium: 5,
  },
  fileCount: {
    critical: 3,
    high: 2,
    medium: 1,
  },
  maxSampleLinks: 5,
} as const;

const PARENT_CONSUMER_ID_PREFIX = 'parent:' as const;

/**
 * Analysis service for dependency data
 */
export class DependencyAnalysisService {
  constructor(private repository: DependencyRepository) { }

  /**
   * Generate report by consumer file
   */
  async reportByFile(dsFileKey: string, options: AnalysisOptions = {}): Promise<FileReport[]> {
    const opts = this.mergeOptions(options);
    const consumers = await this.repository.listConsumers(dsFileKey);

    // Query usage data once (not per consumer) to avoid N+1 queries
    const allComponentUsage = await this.repository.getLatestComponentUsage(dsFileKey);
    const allVariableUsage = await this.repository.getLatestVariableUsage(dsFileKey);

    // Pre-group by consumer_file_key
    const componentsByConsumer = new Map<string, typeof allComponentUsage>();
    for (const usage of allComponentUsage) {
      const key = usage.consumer_file_key;
      if (!componentsByConsumer.has(key)) componentsByConsumer.set(key, []);
      componentsByConsumer.get(key)!.push(usage);
    }
    const variablesByConsumer = new Map<string, typeof allVariableUsage>();
    for (const usage of allVariableUsage) {
      const key = usage.consumer_file_key;
      if (!variablesByConsumer.has(key)) variablesByConsumer.set(key, []);
      variablesByConsumer.get(key)!.push(usage);
    }

    // Helper to compute adoption rate (SC-4)
    const computeAdoptionRate = (
      dsUsed: number,
      localUsed: number | null | undefined,
    ): number | null => {
      if (localUsed == null) return null;
      const total = dsUsed + localUsed;
      return total === 0 ? null : dsUsed / total;
    };

    return Promise.all(consumers.map(async consumer => {
      const latestSync = await this.repository.getLatestSyncRun(consumer.id);

      if (!latestSync) {
        return {
          consumerId: consumer.id,
          consumerName: consumer.consumer_name,
          consumerFileKey: consumer.consumer_file_key,
          lastSyncedAt: consumer.created_at,
          status: 'skipped' as const,
          componentCount: 0,
          variableCount: 0,
          warningCount: 0,
          topComponents: [],
          topVariables: [],
          impactLevel: { level: 'LOW' as const, description: 'No usage data' },
          localComponentUsedCount: null,
          parentDerivedComponentCount: null,
          localVariableDefinedCount: null,
          localVariableUsedCount: null,
          adoptionRate: null,
        };
      }

      const componentUsage = (componentsByConsumer.get(consumer.consumer_file_key) ?? []).slice(0, 10);
      const variableUsage = (variablesByConsumer.get(consumer.consumer_file_key) ?? []).slice(0, 10);

      // Calculate impact level
      const totalUsage = latestSync.component_count + latestSync.variable_count;
      const impactLevel = this.computeImpactLevel(totalUsage, 1, opts);

      // Compute adoption rate (SC-3: aggregate across components + variables)
      const dsComponentUsed = latestSync.component_count;
      const dsVariableUsed = latestSync.variable_count;
      const localCompUsed = latestSync.local_component_used_count ?? null;
      const localVarUsed = latestSync.local_variable_used_count ?? null;
      const totalDsUsed = dsComponentUsed + dsVariableUsed;
      const totalLocalUsed = localCompUsed !== null && localVarUsed !== null
        ? localCompUsed + localVarUsed
        : null;
      const adoptionRate = computeAdoptionRate(totalDsUsed, totalLocalUsed);

      return {
        consumerId: consumer.id,
        consumerName: consumer.consumer_name,
        consumerFileKey: consumer.consumer_file_key,
        lastSyncedAt: latestSync.synced_at,
        status: latestSync.status,
        componentCount: latestSync.component_count,
        variableCount: latestSync.variable_count,
        warningCount: latestSync.warning_count,
        topComponents: componentUsage.map(comp => ({
          componentKey: comp.component_key,
          componentName: comp.component_name,
          instanceCount: comp.instance_count,
          sampleLinks: this.buildSampleLinks(comp.consumer_file_key, comp.sample_node_ids_json, opts.maxSampleLinks),
        })),
        topVariables: variableUsage.map(variable => ({
          variableKey: variable.variable_key,
          variableName: variable.variable_name,
          variableType: variable.variable_type,
          nodeCount: variable.node_count,
          sampleLinks: this.buildSampleLinks(variable.consumer_file_key, variable.sample_node_ids_json, opts.maxSampleLinks),
        })),
        impactLevel,
        localComponentUsedCount: latestSync.local_component_used_count,
        parentDerivedComponentCount: latestSync.parent_derived_component_count,
        localVariableDefinedCount: latestSync.local_variable_defined_count,
        localVariableUsedCount: latestSync.local_variable_used_count,
        adoptionRate,
      };
    }));
  }

  /**
   * Generate report by component
   */
  async reportByComponent(dsFileKey: string, componentKey?: string, options: AnalysisOptions = {}): Promise<ComponentUsage[]> {
    const opts = this.mergeOptions(options);
    const componentUsage = await this.repository.getLatestComponentUsage(dsFileKey);

    // Filter by specific component if provided
    const filteredUsage = componentKey
      ? componentUsage.filter(usage => usage.component_key === componentKey)
      : componentUsage;

    // Group by component
    const componentGroups = new Map<string, typeof componentUsage>();

    for (const usage of filteredUsage) {
      if (!componentGroups.has(usage.component_key)) {
        componentGroups.set(usage.component_key, []);
      }
      componentGroups.get(usage.component_key)!.push(usage);
    }

    // Convert to ComponentUsage array
    return Array.from(componentGroups.entries()).map(([compKey, usages]) => {
      const totalInstances = usages.reduce((sum, usage) => sum + usage.instance_count, 0);
      const consumers: ConsumerUsage[] = usages.map(usage => ({
        consumerId: usage.consumer_id,
        consumerName: usage.consumer_name,
        consumerFileKey: usage.consumer_file_key,
        instanceCount: usage.instance_count,
        sampleNodeIds: this.parseSampleNodeIds(usage.sample_node_ids_json),
        lastSyncedAt: usage.synced_at,
        sampleLinks: this.buildSampleLinks(usage.consumer_file_key, usage.sample_node_ids_json, opts.maxSampleLinks),
      }));

      const impactLevel = this.computeImpactLevel(totalInstances, usages.length, opts);
      const sampleLinks = this.buildSampleLinks(usages[0].consumer_file_key, usages[0].sample_node_ids_json, opts.maxSampleLinks);

      return {
        componentKey: compKey,
        componentName: usages[0].component_name,
        totalInstances,
        consumers,
        impactLevel,
        sampleLinks,
      };
    });
  }

  /**
   * Generate report by variable
   */
  async reportByVariable(dsFileKey: string, variableKey?: string, options: AnalysisOptions = {}): Promise<VariableUsage[]> {
    const opts = this.mergeOptions(options);
    const variableUsage = await this.repository.getLatestVariableUsage(dsFileKey);
    const parentVariableUsage = await this.repository.getParentVariableUsage(dsFileKey);

    // Filter by specific variable if provided
    const filteredUsage = variableKey
      ? variableUsage.filter(usage => usage.variable_key === variableKey)
      : variableUsage;
    const filteredParentUsage = variableKey
      ? parentVariableUsage.filter((usage) => usage.variable_key === variableKey)
      : parentVariableUsage;

    // Group by variable
    const variableGroups = new Map<string, typeof variableUsage>();

    for (const usage of filteredUsage) {
      if (!variableGroups.has(usage.variable_key)) {
        variableGroups.set(usage.variable_key, []);
      }
      variableGroups.get(usage.variable_key)!.push(usage);
    }

    // Include variables that are present only in parent usage snapshot.
    for (const parent of filteredParentUsage) {
      if (!variableGroups.has(parent.variable_key)) {
        variableGroups.set(parent.variable_key, []);
      }
    }

    const parentByVariableKey = new Map(
      filteredParentUsage.map((usage) => [usage.variable_key, usage]),
    );

    // Convert to VariableUsage array
    return Array.from(variableGroups.entries()).map(([varId, usages]) => {
      const totalNodes = usages.reduce((sum, usage) => sum + usage.node_count, 0);
      const consumers: ConsumerUsage[] = usages.map(usage => ({
        consumerId: usage.consumer_id,
        consumerName: usage.consumer_name,
        consumerFileKey: usage.consumer_file_key,
        nodeCount: usage.node_count,
        sampleNodeIds: this.parseSampleNodeIds(usage.sample_node_ids_json),
        lastSyncedAt: usage.synced_at,
        sampleLinks: this.buildSampleLinks(usage.consumer_file_key, usage.sample_node_ids_json, opts.maxSampleLinks),
      }));

      const parentUsage = parentByVariableKey.get(varId);
      const parentNodeCount = parentUsage?.node_count ?? 0;
      if (parentUsage && parentNodeCount > 0) {
        consumers.push({
          consumerId: `${PARENT_CONSUMER_ID_PREFIX}${dsFileKey}`,
          consumerName: 'Parent file',
          consumerFileKey: dsFileKey,
          nodeCount: parentNodeCount,
          sampleNodeIds: this.parseSampleNodeIds(parentUsage.sample_node_ids_json),
          lastSyncedAt: parentUsage.captured_at,
          sampleLinks: this.buildSampleLinks(dsFileKey, parentUsage.sample_node_ids_json, opts.maxSampleLinks),
        });
      }

      const totalNodesWithoutParent = totalNodes;
      // Exclude the parent file from the file count: the parent IS the DS,
      // not an adopting consumer file. Including it inflates adoption metrics.
      const consumerFileCount = consumers.filter(
        (c) => !c.consumerId.startsWith(PARENT_CONSUMER_ID_PREFIX),
      ).length;

      const impactLevel = this.computeImpactLevel(totalNodesWithoutParent, consumerFileCount, opts);
      const sampleLinks = parentUsage
        ? this.buildSampleLinks(dsFileKey, parentUsage.sample_node_ids_json, opts.maxSampleLinks)
        : usages.length > 0
          ? this.buildSampleLinks(usages[0].consumer_file_key, usages[0].sample_node_ids_json, opts.maxSampleLinks)
          : [];
      const fallbackName = parentUsage?.variable_name || 'Unknown variable';
      const fallbackType = parentUsage?.variable_type || 'UNKNOWN';

      return {
        variableKey: varId,
        variableName: usages[0]?.variable_name || fallbackName,
        variableType: usages[0]?.variable_type || fallbackType,
        totalNodes: totalNodesWithoutParent,
        consumers,
        impactLevel,
        sampleLinks,
      };
    });
  }

  /**
   * Compute impact level based on node count and file count
   */
  private computeImpactLevel(nodeCount: number, fileCount: number, options: AnalysisOptions): ImpactLevel {
    const thresholds = options.nodeCountThresholds || DEFAULT_THRESHOLDS.nodeCount;
    const fileThresholds = options.fileCountThresholds || DEFAULT_THRESHOLDS.fileCount;

    // Critical if exceeds either node or file threshold
    if (nodeCount > (thresholds.critical ?? DEFAULT_THRESHOLDS.nodeCount.critical) ||
      fileCount > (fileThresholds.critical ?? DEFAULT_THRESHOLDS.fileCount.critical)) {
      return {
        level: 'CRITICAL',
        description: `High impact: ${nodeCount} nodes across ${fileCount} files`,
      };
    }

    // High if exceeds either high threshold
    if (nodeCount > (thresholds.high ?? DEFAULT_THRESHOLDS.nodeCount.high) ||
      fileCount > (fileThresholds.high ?? DEFAULT_THRESHOLDS.fileCount.high)) {
      return {
        level: 'HIGH',
        description: `Medium-high impact: ${nodeCount} nodes across ${fileCount} files`,
      };
    }

    // Medium if exceeds either medium threshold
    if (nodeCount > (thresholds.medium ?? DEFAULT_THRESHOLDS.nodeCount.medium) ||
      fileCount > (fileThresholds.medium ?? DEFAULT_THRESHOLDS.fileCount.medium)) {
      return {
        level: 'MEDIUM',
        description: `Medium impact: ${nodeCount} nodes across ${fileCount} files`,
      };
    }

    // Otherwise low
    return {
      level: 'LOW',
      description: `Low impact: ${nodeCount} nodes across ${fileCount} files`,
    };
  }

  /**
   * Build Figma links from sample node IDs
   */
  private buildSampleLinks(fileKey: string, sampleNodeIdsJson: unknown, maxLinks: number): string[] {
    const nodeIds = this.parseSampleNodeIds(sampleNodeIdsJson);
    return nodeIds
      .slice(0, maxLinks)
      .map(nodeId => this.buildFigmaLink(fileKey, nodeId));
  }

  /**
   * Parse sample node IDs from JSON
   */
  private parseSampleNodeIds(raw: unknown): string[] {
    if (!raw) {
      return [];
    }

    if (Array.isArray(raw)) {
      return raw
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }

    if (typeof raw === 'string') {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          return [];
        }
        return parsed
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      } catch {
        return [];
      }
    }

    return [];
  }

  /**
   * Build Figma design link
   */
  private buildFigmaLink(fileKey: string, nodeId: string): string {
    return `https://www.figma.com/design/${fileKey}?node-id=${nodeId}`;
  }

  /**
   * Merge user options with defaults
   */
  private mergeOptions(options: AnalysisOptions): Required<AnalysisOptions> {
    return {
      nodeCountThresholds: {
        ...DEFAULT_THRESHOLDS.nodeCount,
        ...options.nodeCountThresholds,
      },
      fileCountThresholds: {
        ...DEFAULT_THRESHOLDS.fileCount,
        ...options.fileCountThresholds,
      },
      maxSampleLinks: options.maxSampleLinks ?? DEFAULT_THRESHOLDS.maxSampleLinks,
    };
  }
}
