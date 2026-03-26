/**
 * Pending Operations Service
 *
 * Reconciles incomplete delete operations on server startup.
 * Ensures system consistency after crashes.
 */

import type { Database } from 'better-sqlite3';

import type { DesignSystemsConfig } from '../services/system-config-schema.js';
import { PendingOperationsRepository } from '../db/pending-operations-repository.js';
import { DependencyRepository } from '../db/dependency-repository.js';

/**
 * Reconcile result
 */
export interface ReconcileResult {
  completed: string[];   // op IDs
  abandoned: string[];
  errors: Array<{ id: string; error: string }>;
}

/**
 * Reconcile arguments
 */
export interface ReconcileDeleteDsOpsArgs {
  db: Database;
  pendingOpsRepo: PendingOperationsRepository;
  designSystemRepository: {
    getConfig(): DesignSystemsConfig;
    saveConfig(config: DesignSystemsConfig): void;
  };
  dependencyRepo?: Pick<DependencyRepository, 'listConsumers' | 'removeAllByDsFileKey'>;
}

/**
 * Reconcile incomplete delete_design_system operations
 *
 * For each in_progress operation, checks the actual state of the system
 * and brings the operation to a terminal state (completed/abandoned).
 *
 * Four possible states:
 * - configHasDS=Y, dbHasConsumers=Y → abandoned (crash pre-FS, nothing was touched)
 * - configHasDS=Y, dbHasConsumers=N → saveConfig(without DS) + complete (the gap we want to cover)
 * - configHasDS=N, dbHasConsumers=Y → cascade delete + complete (defensive for original bug)
 * - configHasDS=N, dbHasConsumers=N → complete (already finished)
 */
export function reconcileDeleteDesignSystemOps(args: ReconcileDeleteDsOpsArgs): ReconcileResult {
  const { db, pendingOpsRepo, designSystemRepository, dependencyRepo: injectedDependencyRepo } = args;
  const dependencyRepo =
    injectedDependencyRepo ??
    new DependencyRepository(db);
  const result: ReconcileResult = {
    completed: [],
    abandoned: [],
    errors: [],
  };

  const ops = pendingOpsRepo.listIncomplete('delete_design_system');

  for (const op of ops) {
    try {
      // Parse payload
      let payload: { systemId: string; figmaFileId: string };
      try {
        payload = JSON.parse(op.payload) as { systemId: string; figmaFileId: string };
      } catch (parseError) {
        console.warn(`[Reconcile] Malformed payload for op ${op.id}, abandoning`);
        pendingOpsRepo.abandon(op.id);
        result.abandoned.push(op.id);
        continue;
      }

      const { systemId, figmaFileId } = payload;

      // Skip if figmaFileId is empty
      if (!figmaFileId || figmaFileId.trim() === '') {
        console.warn(`[Reconcile] Op ${op.id} has empty figmaFileId, abandoning`);
        pendingOpsRepo.abandon(op.id);
        result.abandoned.push(op.id);
        continue;
      }

      // Check actual system state
      const config = designSystemRepository.getConfig();
      const configHasDS = config.systems.some((s) => s.id === systemId);

      const consumers = dependencyRepo.listConsumers(figmaFileId.trim());
      const dbHasConsumers = consumers.length > 0;

      // Four-way decision
      if (configHasDS && dbHasConsumers) {
        // Y+Y: Nothing was done, crash pre-FS
        console.warn(`[Reconcile] Op ${op.id}: DS ${systemId} still in config with consumers - abandoning (user should retry)`);
        pendingOpsRepo.abandon(op.id);
        result.abandoned.push(op.id);
      } else if (configHasDS && !dbHasConsumers) {
        // Y+N: Consumers deleted but config intact - this is the gap we want to cover
        const nextConfig: DesignSystemsConfig = {
          ...config,
          systems: config.systems.filter((s) => s.id !== systemId),
          defaultSystem: config.defaultSystem === systemId ? '' : config.defaultSystem,
        };
        designSystemRepository.saveConfig(nextConfig);
        pendingOpsRepo.complete(op.id);
        result.completed.push(op.id);
        console.log(`[Reconcile] Op ${op.id}: Completed - removed DS ${systemId} from config`);
      } else if (!configHasDS && dbHasConsumers) {
        // N+Y: Config cleaned but consumers remain - defensive cleanup
        try {
          dependencyRepo.removeAllByDsFileKey(figmaFileId.trim());
          pendingOpsRepo.complete(op.id);
          result.completed.push(op.id);
          console.log(`[Reconcile] Op ${op.id}: Completed - cleaned up consumers for ${figmaFileId}`);
        } catch (cascadeError) {
          console.warn(`[Reconcile] Op ${op.id}: Cascade delete failed`, cascadeError);
          throw cascadeError;
        }
      } else {
        // N+N: Already finished
        pendingOpsRepo.complete(op.id);
        result.completed.push(op.id);
        console.log(`[Reconcile] Op ${op.id}: Already complete - nothing to do`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push({ id: op.id, error: errorMessage });
      console.error(`[Reconcile] Error processing op ${op.id}:`, errorMessage);
    }
  }

  return result;
}
