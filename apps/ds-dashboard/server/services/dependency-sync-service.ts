import { DependencyRepository, type DsConsumer, type DsSyncRun } from '../db/dependency-repository.js';
import { buildDsCatalog, scanConsumerFile, fetchConsumerFileMetadata, type DsCatalog, type ConsumerScanResult } from './figma-rest-consumer-service.js';
import { resolveEnvRef } from '../lib/env-ref-utils.js';
import { DEFAULT_CONSUMER_STALE_HOURS } from '../lib/dependency-sync-constants.js';

// Types for sync operations
export interface SyncConsumersParams {
  dsFileKey: string;
  consumerIds?: string[];
  force?: boolean;
  token?: string;  // Optional override
  captureParentUsage?: boolean;
  signal?: AbortSignal;
}

export interface SyncRunSummary {
  consumerId: string;
  consumerName: string;
  status: DsSyncRun['status'];
  durationMs: number;
  componentCount: number;
  variableCount: number;
  warningCount: number;
  errorMessage?: string;
  skippedReason?: string;
  localComponentUsedCount?: number | null;
  parentDerivedComponentCount?: number | null;
  localVariableDefinedCount?: number | null;
  localVariableUsedCount?: number | null;
}

export interface SyncResult {
  synced: number;
  skipped: number;
  errored: number;
  runs: SyncRunSummary[];
  dsFileKey: string;
}

export interface SystemConfig {
  figmaApiToken: string;
}

/**
 * Main sync orchestration service
 */
export class DependencySyncService {
  constructor(
    private repository: DependencyRepository,
    private getSystemConfig: () => SystemConfig
  ) { }

  /**
   * Sync all or selected consumers for a DS
   */
  async syncConsumers(params: SyncConsumersParams): Promise<SyncResult> {
    const {
      dsFileKey,
      consumerIds,
      force = false,
      token: tokenOverride,
      captureParentUsage = false,
      signal,
    } = params;

    this.throwIfAborted(signal);

    // Resolve Figma token
    const token = tokenOverride || this.resolveFigmaToken();

    // Get consumers to sync
    const consumers = await this.getConsumersToSync(dsFileKey, consumerIds);
    this.throwIfAborted(signal);

    if (consumers.length === 0 && !captureParentUsage) {
      return {
        synced: 0,
        skipped: 0,
        errored: 0,
        runs: [],
        dsFileKey,
      };
    }

    // Build DS catalog once (shared across parent snapshot + all consumers)
    const dsCatalog = await this.buildDsCatalogWithRetry(dsFileKey, token, signal);
    this.throwIfAborted(signal);
    const dsMetadata = await this.fetchMetadataWithRetry(dsFileKey, token, signal);
    this.throwIfAborted(signal);
    if (captureParentUsage) {
      await this.captureParentVariableUsageSnapshot(dsFileKey, dsCatalog, token, signal);
      this.throwIfAborted(signal);
    }

    const result: SyncResult = {
      synced: 0,
      skipped: 0,
      errored: 0,
      runs: [],
      dsFileKey,
    };

    // Process consumers sequentially with rate limiting
    for (let i = 0; i < consumers.length; i++) {
      this.throwIfAborted(signal);
      const consumer = consumers[i];

      try {
        const summary = await this.syncConsumer(
          consumer,
          dsCatalog,
          token,
          force,
          dsMetadata.lastModified,
          signal,
        );
        result.runs.push(summary);

        if (summary.status === 'ok' || summary.status === 'partial') {
          result.synced++;
        } else if (summary.status === 'skipped') {
          result.skipped++;
        } else {
          result.errored++;
        }

        // Rate limiting: 1 second delay between consumers (except last one)
        if (i < consumers.length - 1) {
          await this.delay(1000, signal);
        }
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }
        // This should not happen due to error handling in syncConsumer
        result.errored++;
        result.runs.push({
          consumerId: consumer.id,
          consumerName: consumer.consumer_name,
          status: 'error',
          durationMs: 0,
          componentCount: 0,
          variableCount: 0,
          warningCount: 0,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  /**
   * Capture and persist variable usage from the DS parent file itself.
   * This keeps token-detail "Used In" data deterministic and DB-backed.
   */
  private async captureParentVariableUsageSnapshot(
    dsFileKey: string,
    dsCatalog: DsCatalog,
    token: string,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      this.throwIfAborted(signal);
      const scanResult = await this.scanFileWithRetry(dsFileKey, token, dsCatalog, signal);
      this.throwIfAborted(signal);
      await this.repository.replaceParentVariableUsage(
        dsFileKey,
        scanResult.variableBindings.map((binding) => ({
          variable_key: binding.variableKey,
          variable_name: binding.variableName,
          variable_type: binding.variableType,
          node_count: binding.totalNodeCount,
          sample_node_ids_json: JSON.stringify(binding.nodeIds),
        })),
      );
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      // Parent snapshot is best-effort and must not block consumer sync.
      console.warn(
        `[DependencySyncService] Failed to capture parent usage snapshot for ${dsFileKey}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Sync a single consumer
   */
  private async syncConsumer(
    consumer: DsConsumer,
    dsCatalog: DsCatalog,
    token: string,
    force: boolean,
    dsLastModified?: string,
    signal?: AbortSignal,
  ): Promise<SyncRunSummary> {
    const startTime = Date.now();
    let consumerMetadataLastModified: string | undefined;

    try {
      this.throwIfAborted(signal);
      // Check if we should skip this consumer (also returns metadata to avoid double fetch)
      if (!force) {
        const skipResult = await this.shouldSkipConsumer(consumer, token, signal);
        if (skipResult.skip) {
          return {
            consumerId: consumer.id,
            consumerName: consumer.consumer_name,
            status: 'skipped',
            durationMs: Date.now() - startTime,
            componentCount: 0,
            variableCount: 0,
            warningCount: 0,
            skippedReason: skipResult.reason,
          };
        }
        // Reuse metadata from skip check if available
        if (skipResult.metadata) {
          consumerMetadataLastModified = skipResult.metadata.lastModified;
        }
      }

      // Only fetch metadata if not already obtained from skip check
      if (!consumerMetadataLastModified) {
        const metadata = await fetchConsumerFileMetadata(consumer.consumer_file_key, token, signal);
        consumerMetadataLastModified = metadata.lastModified;
      }

      this.throwIfAborted(signal);
      // Scan the consumer file
      const scanResult = await this.scanConsumerWithRetry(consumer, dsCatalog, token, signal);

      this.throwIfAborted(signal);
      // Save the sync run
      const syncRun = await this.repository.saveSyncRun({
        consumer_id: consumer.id,
        duration_ms: Date.now() - startTime,
        status: scanResult.warnings.length > 0 ? 'partial' : 'ok',
        ds_last_modified: dsLastModified,
        consumer_last_modified: consumerMetadataLastModified,
        component_usage: scanResult.componentInstances.map(instance => ({
          component_key: instance.componentKey,
          component_name: instance.componentName,
          instance_count: instance.nodeIds.length,
          sample_node_ids_json: JSON.stringify(instance.nodeIds),
        })),
        variable_usage: scanResult.variableBindings.map(binding => ({
          variable_key: binding.variableKey,
          variable_name: binding.variableName,
          variable_type: binding.variableType,
          node_count: binding.totalNodeCount,
          sample_node_ids_json: JSON.stringify(binding.nodeIds),
        })),
        warnings: scanResult.warnings,
        local_component_used_count: scanResult.localComponentUsedCount,
        parent_derived_component_count: scanResult.parentDerivedComponentCount,
        local_variable_defined_count: scanResult.localVariableDefinedCount,
        local_variable_used_count: scanResult.localVariableUsedCount,
        consumer_usage_details_json: scanResult.usageDetails,
      });

      this.throwIfAborted(signal);
      // Prune old runs for this consumer
      await this.repository.pruneOldRuns(consumer.id, 20);

      return {
        consumerId: consumer.id,
        consumerName: consumer.consumer_name,
        status: syncRun.status,
        durationMs: syncRun.duration_ms,
        componentCount: syncRun.component_count,
        variableCount: syncRun.variable_count,
        warningCount: syncRun.warning_count,
        errorMessage: syncRun.error_message,
        localComponentUsedCount: syncRun.local_component_used_count,
        parentDerivedComponentCount: syncRun.parent_derived_component_count,
        localVariableDefinedCount: syncRun.local_variable_defined_count,
        localVariableUsedCount: syncRun.local_variable_used_count,
      };
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      // Save error run
      const syncRun = await this.repository.saveSyncRun({
        consumer_id: consumer.id,
        duration_ms: Date.now() - startTime,
        status: 'error',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        ds_last_modified: dsLastModified,
        consumer_last_modified: consumerMetadataLastModified,
        component_usage: [],
        variable_usage: [],
        warnings: [],
      });

      return {
        consumerId: consumer.id,
        consumerName: consumer.consumer_name,
        status: 'error',
        durationMs: syncRun.duration_ms,
        componentCount: 0,
        variableCount: 0,
        warningCount: 0,
        errorMessage: syncRun.error_message,
      };
    }
  }

  /**
   * Check if a consumer should be skipped based on lastModified.
   * Returns `{ skip: true, reason }` or `{ skip: false, metadata }` so that
   * the caller can reuse the fetched metadata without a second API call.
   */
  private async shouldSkipConsumer(
    consumer: DsConsumer,
    token: string,
    signal?: AbortSignal,
  ): Promise<{ skip: true; reason: string } | { skip: false; metadata?: { name: string; lastModified: string } }> {
    this.throwIfAborted(signal);
    // Get latest sync run for this consumer
    const latestRun = await this.repository.getLatestSyncRun(consumer.id);

    if (!latestRun) {
      return { skip: false }; // No previous sync, don't skip
    }

    if (latestRun.status === 'error') {
      return { skip: false }; // Previous sync failed, retry
    }

    // Check if consumer is stale (older than fixed threshold)
    const staleThreshold = DEFAULT_CONSUMER_STALE_HOURS * 60 * 60 * 1000; // Convert to ms
    const timeSinceLastSync = Date.now() - new Date(latestRun.synced_at).getTime();

    if (timeSinceLastSync > staleThreshold) {
      return { skip: false }; // Too stale, don't skip
    }

    try {
      this.throwIfAborted(signal);
      // Fetch current file metadata
      const metadata = await fetchConsumerFileMetadata(consumer.consumer_file_key, token, signal);

      // Compare with previous sync
      if (latestRun.consumer_last_modified === metadata.lastModified) {
        return { skip: true, reason: `File unchanged since ${latestRun.synced_at}` };
      }

      return { skip: false, metadata }; // File changed — pass metadata to avoid re-fetch
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      // If we can't fetch metadata, don't skip (better to sync and fail)
      return { skip: false };
    }
  }

  /**
   * Get consumers to sync, optionally filtered by consumerIds
   */
  private async getConsumersToSync(dsFileKey: string, consumerIds?: string[]): Promise<DsConsumer[]> {
    const allConsumers = await this.repository.listConsumers(dsFileKey);

    // Filter only by specific IDs when requested.
    return allConsumers.filter(consumer => {
      if (consumerIds && !consumerIds.includes(consumer.id)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Build DS catalog with retry logic
   */
  private async buildDsCatalogWithRetry(
    dsFileKey: string,
    token: string,
    signal?: AbortSignal,
  ): Promise<DsCatalog> {
    let lastError: Error | unknown;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        this.throwIfAborted(signal);
        return await buildDsCatalog(dsFileKey, token, signal);
      } catch (error) {
        lastError = error;
        if (signal?.aborted) {
          throw error;
        }

        // Check if it's a rate limit error
        if (this.isRateLimitError(error) && attempt < 3) {
          const retryAfter = this.getRetryAfterSeconds(error);
          await this.delay(retryAfter * 1000, signal);
          continue;
        }

        // For other errors or final attempt, throw
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Scan consumer file with retry logic
   */
  private async scanConsumerWithRetry(
    consumer: DsConsumer,
    dsCatalog: DsCatalog,
    token: string,
    signal?: AbortSignal,
  ): Promise<ConsumerScanResult> {
    let lastError: Error | unknown;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        this.throwIfAborted(signal);
        return await scanConsumerFile(consumer.consumer_file_key, token, dsCatalog, signal);
      } catch (error) {
        lastError = error;
        if (signal?.aborted) {
          throw error;
        }

        // Check if it's a rate limit error
        if (this.isRateLimitError(error) && attempt < 3) {
          const retryAfter = this.getRetryAfterSeconds(error);
          await this.delay(retryAfter * 1000, signal);
          continue;
        }

        // For other errors or final attempt, throw
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Scan a file (DS parent or consumer) with retry logic.
   */
  private async scanFileWithRetry(
    fileKey: string,
    token: string,
    dsCatalog: DsCatalog,
    signal?: AbortSignal,
  ): Promise<ConsumerScanResult> {
    let lastError: Error | unknown;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        this.throwIfAborted(signal);
        return await scanConsumerFile(fileKey, token, dsCatalog, signal);
      } catch (error) {
        lastError = error;
        if (signal?.aborted) {
          throw error;
        }
        if (this.isRateLimitError(error) && attempt < 3) {
          const retryAfter = this.getRetryAfterSeconds(error);
          await this.delay(retryAfter * 1000, signal);
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  /**
   * Fetch file metadata with retry logic.
   */
  private async fetchMetadataWithRetry(
    fileKey: string,
    token: string,
    signal?: AbortSignal,
  ): Promise<{ name: string; lastModified: string }> {
    let lastError: Error | unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        this.throwIfAborted(signal);
        return await fetchConsumerFileMetadata(fileKey, token, signal);
      } catch (error) {
        lastError = error;
        if (signal?.aborted) {
          throw error;
        }
        if (this.isRateLimitError(error) && attempt < 3) {
          const retryAfter = this.getRetryAfterSeconds(error);
          await this.delay(retryAfter * 1000, signal);
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  /**
   * Resolve Figma token from system config
   */
  private resolveFigmaToken(): string {
    try {
      const systemConfig = this.getSystemConfig();
      const rawTokenRef = systemConfig.figmaApiToken;
      const token = resolveEnvRef(rawTokenRef);

      if (!token) {
        throw {
          code: 'deps.sync.no_token',
          message: 'Figma API token not resolved from system config',
        };
      }

      return token;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        throw error;
      }

      throw {
        code: 'deps.sync.token_resolution_failed',
        message: `Failed to resolve Figma token: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: unknown): error is { status: 429; retryAfterSeconds?: number } {
    if (!error || typeof error !== 'object' || !('status' in error)) {
      return false;
    }
    const status = (error as any).status;
    return typeof status === 'number' && status === 429;
  }

  /**
   * Get retry after seconds from rate limit error
   */
  private getRetryAfterSeconds(error: unknown): number {
    if (error && typeof error === 'object' && 'retryAfterSeconds' in error) {
      const retryAfter = (error as any).retryAfterSeconds;
      return typeof retryAfter === 'number' && retryAfter > 0 ? retryAfter : 1;
    }
    return 1; // Default to 1 second
  }

  /**
   * Simple delay utility
   */
  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new Error('Operation aborted');
    }
  }

  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return Promise.reject(new Error('Operation aborted'));
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);

      const onAbort = () => {
        cleanup();
        reject(new Error('Operation aborted'));
      };

      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }
}
