/**
 * Pending Operations Service
 *
 * Reconciles incomplete delete operations on server startup.
 * Ensures system consistency after crashes.
 */

import type { Sql } from 'postgres';

import { PendingOperationsRepository } from '../db/pending-operations-repository.js';
import { DependencyRepository } from '../db/dependency-repository.js';
import type { DesignSystemsConfig } from '../db/design-system-repository.js';

export interface ReconcileResult {
  completed: string[];
  abandoned: string[];
  errors: Array<{ id: string; error: string }>;
}

export interface ReconcileDeleteDsOpsArgs {
  sql: Sql;
  pendingOpsRepo: PendingOperationsRepository;
  designSystemRepository: {
    getConfig(): Promise<DesignSystemsConfig>;
    delete(id: string): Promise<boolean>;
    setDefaultSystemId(id: string | null): Promise<void>;
  };
  dependencyRepo?: Pick<
    DependencyRepository,
    'listConsumers' | 'removeAllByDsFileKey'
  >;
}

export async function reconcileDeleteDesignSystemOps(
  args: ReconcileDeleteDsOpsArgs,
): Promise<ReconcileResult> {
  const {
    sql,
    pendingOpsRepo,
    designSystemRepository,
    dependencyRepo: injectedDependencyRepo,
  } = args;
  const dependencyRepo =
    injectedDependencyRepo ?? new DependencyRepository(sql);
  const result: ReconcileResult = {
    completed: [],
    abandoned: [],
    errors: [],
  };

  const ops = await pendingOpsRepo.listIncomplete('delete_design_system');

  for (const op of ops) {
    try {
      const payload = op.payload as Record<string, unknown> | null;
      const systemId = typeof payload?.systemId === 'string' ? payload.systemId.trim() : '';
      const figmaFileId =
        typeof payload?.figmaFileId === 'string'
          ? payload.figmaFileId.trim()
          : systemId;

      if (!systemId || !figmaFileId) {
        await pendingOpsRepo.abandon(op.id);
        result.abandoned.push(op.id);
        continue;
      }
      const config = await designSystemRepository.getConfig();
      const hasDS = config.systems.some((s) => s.id === systemId);
      const consumers = await dependencyRepo.listConsumers(figmaFileId);
      const hasConsumers = consumers.length > 0;

      if (hasDS && hasConsumers) {
        await pendingOpsRepo.abandon(op.id);
        result.abandoned.push(op.id);
      } else if (hasDS && !hasConsumers) {
        await designSystemRepository.delete(systemId);
        if (config.defaultSystem === systemId) {
          const remaining = config.systems.filter((s) => s.id !== systemId);
          await designSystemRepository.setDefaultSystemId(
            remaining[0]?.id ?? null,
          );
        }
        await pendingOpsRepo.complete(op.id);
        result.completed.push(op.id);
      } else if (!hasDS && hasConsumers) {
        await dependencyRepo.removeAllByDsFileKey(figmaFileId);
        await pendingOpsRepo.complete(op.id);
        result.completed.push(op.id);
      } else {
        await pendingOpsRepo.complete(op.id);
        result.completed.push(op.id);
      }
    } catch (error) {
      result.errors.push({
        id: op.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
