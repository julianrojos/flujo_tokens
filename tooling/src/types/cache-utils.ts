/**
 * Type definitions for cache-utils module.
 */

/**
 * Sync state task entry.
 */
export interface SyncStateTask {
  fingerprint: string;
  outputs: string[];
  metadata: Record<string, unknown>;
  updatedAt: string;
}

/**
 * Sync state structure.
 */
export interface SyncState {
  version: number;
  tasks: Record<string, SyncStateTask>;
}

/**
 * Options for computing a fingerprint.
 */
export interface FingerprintOptions {
  files?: string[];
  values?: Record<string, unknown>;
}

/**
 * Options for checking if a task should be skipped.
 */
export interface SkipTaskOptions {
  taskId?: string;
  fingerprint?: string;
  outputs?: string[];
  force?: boolean;
  statePath?: string;
}

/**
 * Result of skip task check.
 */
export interface SkipTaskResult {
  skip: boolean;
  reason: string;
  missingOutputs: string[];
}

/**
 * Options for updating task state.
 */
export interface UpdateTaskOptions {
  taskId?: string;
  fingerprint?: string;
  outputs?: string[];
  metadata?: Record<string, unknown>;
  statePath?: string;
}
