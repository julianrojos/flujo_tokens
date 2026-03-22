import { DependencyRepository } from '../db/dependency-repository.js';

// Types for simulation results
export interface AffectedConsumer {
  consumerId: string;
  consumerName: string;
  consumerFileKey: string;
  nodeCount: number;
  sampleNodeIds: string[];
  sampleLinks: string[];
  lastSyncedAt: string;
  freshnessHours: number; // How old the data is
}

export interface SimulationResult {
  variableKey: string;
  variableName: string;
  variableType: string;
  proposedValue: unknown;
  totalNodes: number;
  totalConsumers: number;
  impactLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  affectedConsumers: AffectedConsumer[];
  warnings: SimulationWarning[];
  disclaimer: string;
}

export interface SimulationWarning {
  code: string;
  message: string;
  consumerId?: string;
}

export interface SimulationOptions {
  nodeCountThresholds?: {
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
  maxSampleLinks: 5,
} as const;

/**
 * Service for simulating variable changes and impact analysis
 */
export class DependencySimulateService {
  constructor(private repository: DependencyRepository) {}

  /**
   * Simulate the impact of changing a variable value
   */
  simulateVariableChange(
    dsFileKey: string,
    variableKey: string,
    proposedValue: unknown,
    options: SimulationOptions = {}
  ): SimulationResult {
    const opts = this.mergeOptions(options);

    // Get latest variable usage data
    const variableUsage = this.repository.getLatestVariableUsage(dsFileKey)
      .filter(usage => usage.variable_key === variableKey);

    if (variableUsage.length === 0) {
      return {
        variableKey,
        variableName: 'Unknown',
        variableType: 'UNKNOWN',
        proposedValue,
        totalNodes: 0,
        totalConsumers: 0,
        impactLevel: 'LOW',
        affectedConsumers: [],
        warnings: [
          {
            code: 'variable_not_found',
            message: `Variable ${variableKey} not found in latest sync data. It may not be used in any consumer files.`,
          },
        ],
        disclaimer: this.buildDisclaimer(),
      };
    }

    // Aggregate data across all consumers
    const totalNodes = variableUsage.reduce((sum, usage) => sum + usage.node_count, 0);
    const variableName = variableUsage[0].variable_name;
    const variableType = variableUsage[0].variable_type;

    // Build affected consumers list
    const affectedConsumers: AffectedConsumer[] = variableUsage.map(usage => {
      const sampleNodeIds = this.parseSampleNodeIds(usage.sample_node_ids_json);
      const lastSyncedAt = usage.synced_at;
      const freshnessHours = this.calculateFreshnessHours(lastSyncedAt);

      return {
        consumerId: usage.consumer_id,
        consumerName: usage.consumer_name,
        consumerFileKey: usage.consumer_file_key,
        nodeCount: usage.node_count,
        sampleNodeIds,
        sampleLinks: this.buildSampleLinks(usage.consumer_file_key, sampleNodeIds, opts.maxSampleLinks),
        lastSyncedAt,
        freshnessHours,
      };
    });

    // Calculate impact level
    const impactLevel = this.computeImpactLevel(totalNodes, affectedConsumers.length, opts);

    // Generate warnings
    const warnings = this.generateWarnings(dsFileKey, affectedConsumers, variableUsage);

    return {
      variableKey,
      variableName,
      variableType,
      proposedValue,
      totalNodes,
      totalConsumers: affectedConsumers.length,
      impactLevel,
      affectedConsumers,
      warnings,
      disclaimer: this.buildDisclaimer(),
    };
  }

  /**
   * Calculate impact level based on node count and consumer count
   */
  private computeImpactLevel(nodeCount: number, consumerCount: number, options: SimulationOptions): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    const thresholds = options.nodeCountThresholds || DEFAULT_THRESHOLDS.nodeCount;

    // Critical if exceeds node threshold or affects many consumers
    if (nodeCount > (thresholds.critical ?? DEFAULT_THRESHOLDS.nodeCount.critical) || consumerCount >= 5) {
      return 'CRITICAL';
    }

    // High if exceeds high threshold or affects multiple consumers
    if (nodeCount > (thresholds.high ?? DEFAULT_THRESHOLDS.nodeCount.high) || consumerCount >= 3) {
      return 'HIGH';
    }

    // Medium if exceeds medium threshold
    if (nodeCount > (thresholds.medium ?? DEFAULT_THRESHOLDS.nodeCount.medium)) {
      return 'MEDIUM';
    }

    // Otherwise low
    return 'LOW';
  }

  /**
   * Generate warnings for the simulation
   */
  private generateWarnings(dsFileKey: string, consumers: AffectedConsumer[], variableUsage: any[]): SimulationWarning[] {
    const warnings: SimulationWarning[] = [];

    // Check for stale data
    for (const consumer of consumers) {
      if (consumer.freshnessHours > 72) {
        warnings.push({
          code: 'stale_data',
          message: `Data for ${consumer.consumerName} is ${consumer.freshnessHours.toFixed(1)} hours old. Consider re-syncing.`,
          consumerId: consumer.consumerId,
        });
      }
    }

    // Check for consumers with warnings in their latest sync
    const latestWarningsByConsumer = this.repository.getLatestWarnings(dsFileKey);
    for (const usage of variableUsage) {
      const latestWarnings = latestWarningsByConsumer
        .filter(warning => warning.consumer_file_key === usage.consumer_file_key);
      
      if (latestWarnings.length > 0) {
        warnings.push({
          code: 'sync_warnings',
          message: `${usage.consumer_name} had ${latestWarnings.length} warnings during last sync.`,
          consumerId: usage.consumer_id,
        });
      }
    }

    // Check for detached instances (heuristic)
    const totalInstances = variableUsage.reduce((sum, usage) => sum + usage.node_count, 0);
    if (totalInstances > 0) {
      const detachedWarnings = variableUsage.filter(usage => 
        usage.node_count === 0 && usage.consumer_name.includes('detached')
      );
      
      if (detachedWarnings.length > 0) {
        warnings.push({
          code: 'possible_detached',
          message: `Some consumers may have detached instances not detected by the scan.`,
        });
      }
    }

    return warnings;
  }

  /**
   * Calculate how many hours old the data is
   */
  private calculateFreshnessHours(lastSyncedAt: string): number {
    if (!lastSyncedAt) {
      return 999; // Very old
    }

    const syncTime = new Date(lastSyncedAt).getTime();
    const now = Date.now();
    const diffMs = now - syncTime;
    
    return diffMs / (1000 * 60 * 60); // Convert to hours
  }

  /**
   * Parse sample node IDs from JSON
   */
  private parseSampleNodeIds(sampleNodeIdsJson: string | undefined): string[] {
    if (!sampleNodeIdsJson) {
      return [];
    }

    try {
      return JSON.parse(sampleNodeIdsJson) as string[];
    } catch {
      return [];
    }
  }

  /**
   * Build Figma links from sample node IDs
   */
  private buildSampleLinks(fileKey: string, nodeIds: string[], maxLinks: number): string[] {
    return nodeIds
      .slice(0, maxLinks)
      .map(nodeId => this.buildFigmaLink(fileKey, nodeId));
  }

  /**
   * Build Figma design link
   */
  private buildFigmaLink(fileKey: string, nodeId: string): string {
    return `https://www.figma.com/design/${fileKey}?node-id=${nodeId}`;
  }

  /**
   * Build disclaimer for simulation results
   */
  private buildDisclaimer(): string {
    return 'This simulation is based on the latest sync data. Actual impact may vary due to detached instances, conditional logic, or recent changes not yet synced.';
  }

  /**
   * Merge user options with defaults
   */
  private mergeOptions(options: SimulationOptions): Required<SimulationOptions> {
    return {
      nodeCountThresholds: {
        ...DEFAULT_THRESHOLDS.nodeCount,
        ...options.nodeCountThresholds,
      },
      maxSampleLinks: options.maxSampleLinks ?? DEFAULT_THRESHOLDS.maxSampleLinks,
    };
  }
}
