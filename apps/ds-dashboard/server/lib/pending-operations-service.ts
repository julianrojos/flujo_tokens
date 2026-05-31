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
import {
  pruneEmptyAncestorDirs,
  removeExistingPathsWithOptions,
  type FsSync,
} from './system-route-handler-service.js';

export interface ReconcileResult {
  completed: string[];
  abandoned: string[];
  errors: Array<{ id: string; error: string }>;
}

export interface ReconcileDeleteDsOpsArgs {
  sql: Sql;
  fsSync: FsSync;
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

function toTrimmedStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

function replayPendingFilesystemCleanup(
  attemptedChanges: string[],
  repoRoot: string,
  fsSync: FsSync,
): string[] {
  if (!repoRoot || attemptedChanges.length === 0) return [];

  const removedPaths = removeExistingPathsWithOptions(attemptedChanges, fsSync, {
    repoRoot,
    protectedTopLevelDirs: ['docs', 'input', 'output'],
  });
  const prunedDirs = pruneEmptyAncestorDirs(removedPaths, { repoRoot, fsSync });
  return [...removedPaths, ...prunedDirs];
}

async function repairDefaultSystemIfNeeded(
  designSystemRepository: ReconcileDeleteDsOpsArgs['designSystemRepository'],
  config: DesignSystemsConfig,
  systemId: string,
): Promise<void> {
  if (config.defaultSystem !== systemId) return;
  const remaining = config.systems.filter((s) => s.id !== systemId);
  await designSystemRepository.setDefaultSystemId(remaining[0]?.id ?? null);
}

export async function reconcileDeleteDesignSystemOps(
  args: ReconcileDeleteDsOpsArgs,
): Promise<ReconcileResult> {
  const {
    sql,
    fsSync,
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
      const repoRoot =
        typeof payload?.repoRoot === 'string' ? payload.repoRoot.trim() : '';
      const attemptedChanges = toTrimmedStringArray(payload?.attemptedChanges);
      const hasFilesystemTail = attemptedChanges.length > 0;

      if (!systemId || !figmaFileId) {
        await pendingOpsRepo.abandon(op.id);
        result.abandoned.push(op.id);
        continue;
      }
      const config = await designSystemRepository.getConfig();
      const hasDS = config.systems.some((s) => s.id === systemId);
      const consumers = await dependencyRepo.listConsumers(figmaFileId);
      const hasConsumers = consumers.length > 0;

      if (hasFilesystemTail && !repoRoot) {
        throw new Error(`Missing repoRoot for pending delete replay: ${op.id}`);
      }

      if (hasDS && hasConsumers) {
        await pendingOpsRepo.abandon(op.id);
        result.abandoned.push(op.id);
      } else if (hasDS && !hasConsumers) {
        await designSystemRepository.delete(systemId);
        await repairDefaultSystemIfNeeded(designSystemRepository, config, systemId);
        replayPendingFilesystemCleanup(attemptedChanges, repoRoot, fsSync);
        await pendingOpsRepo.complete(op.id);
        result.completed.push(op.id);
      } else if (!hasDS && hasConsumers) {
        await dependencyRepo.removeAllByDsFileKey(figmaFileId);
        await repairDefaultSystemIfNeeded(designSystemRepository, config, systemId);
        replayPendingFilesystemCleanup(attemptedChanges, repoRoot, fsSync);
        await pendingOpsRepo.complete(op.id);
        result.completed.push(op.id);
      } else {
        await repairDefaultSystemIfNeeded(designSystemRepository, config, systemId);
        replayPendingFilesystemCleanup(attemptedChanges, repoRoot, fsSync);
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
