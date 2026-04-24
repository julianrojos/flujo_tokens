/**
 * Capture System Bootstrap
 *
 * Handles system repository initialization and token bootstrap for capture pipeline.
 */

import * as path from 'node:path';

import { PROJECT_ROOT } from '../utils/system-context.js';
import { createDesignSystemRepository } from '../../scripts/lib/system-repository.mjs';
import { syncFigmaTokensToDatabase } from './figma-token-sync.js';
import type { FigmaVariableSource } from './figma-token-sync.js';

// Cache for system repositories (CLI-only: safe for short-lived processes)
// NOTE: For long-running servers, consider adding a cleanup mechanism or LRU eviction.
const _systemRepositories = new Map<string, ReturnType<typeof createDesignSystemRepository>>();

type SystemRepositoryFactory = (options: { repoRoot: string }) => ReturnType<typeof createDesignSystemRepository>;

let _systemRepositoryFactory: SystemRepositoryFactory = ({ repoRoot }) =>
  createDesignSystemRepository({ repoRoot });

/**
 * Override the system repository factory.
 *
 * Intended for tests that need to avoid a live database connection.
 */
export function setSystemRepositoryFactory(
  factory: SystemRepositoryFactory | null,
): void {
  _systemRepositoryFactory = factory ?? (({ repoRoot }) => createDesignSystemRepository({ repoRoot }));
  _systemRepositories.clear();
}

/**
 * Get or create system repository for repo root.
 */
export function getSystemRepository(repoRoot: string): ReturnType<typeof createDesignSystemRepository> {
  const key = path.resolve(repoRoot || PROJECT_ROOT);
  if (!_systemRepositories.has(key)) {
    _systemRepositories.set(key, _systemRepositoryFactory({ repoRoot: key }));
  }
  return _systemRepositories.get(key)!;
}

/**
 * Get system configuration by ID.
 */
export async function getSystemConfig(params: {
  repoRoot: string;
  systemId?: string;
}): Promise<Record<string, unknown> | null> {
  const { repoRoot, systemId } = params;

  if (!systemId) return null;

  try {
    // Use resolveSystemContext instead of non-existent getSystem
    const system = await getSystemRepository(repoRoot).resolveSystemContext(systemId);
    return system as Record<string, unknown> || null;
  } catch {
    return null;
  }
}

/**
 * Bootstrap token rows from Figma variables into the database.
 */
export async function bootstrapFigmaTokensToDatabase(params: {
  repoRoot: string;
  system?: Record<string, unknown> | null;
  fileKey?: string;
  figmaFileUrl?: string;
  figmaToken: string;
  tokensSource?: FigmaVariableSource;
  syncFigmaTokensToDatabaseFn?: typeof syncFigmaTokensToDatabase;
}): Promise<{
  attempted: boolean;
  created: boolean;
  reason: string;
  collections?: string[];
  tokens_written?: number;
  tokens_total?: number;
  error?: string;
}> {
  const {
    repoRoot,
    system,
    fileKey,
    figmaFileUrl,
    figmaToken,
    tokensSource = 'mcp',
    syncFigmaTokensToDatabaseFn,
  } = params;
  const syncFigmaTokensToDatabaseImpl = syncFigmaTokensToDatabaseFn || syncFigmaTokensToDatabase;

  if (!system) {
    return { attempted: false, created: false, reason: 'system-missing' };
  }

  const databaseUrl = String((system as { paths?: { databaseUrl?: string } })?.paths?.databaseUrl || '').trim();
  if (!databaseUrl) {
    return { attempted: false, created: false, reason: 'system-database-url-missing' };
  }

  if (!fileKey) {
    return { attempted: false, created: false, reason: 'figma-file-key-missing' };
  }

  const syncResult = await syncFigmaTokensToDatabaseImpl({
    repoRoot,
    system,
    fileKey,
    figmaToken,
    force: false,
    merge: false,
    dryRun: false,
    source: tokensSource,
    mcpFileUrl: figmaFileUrl,
  });

  if (syncResult.collections && syncResult.collections.length > 0 && system && typeof system.id === 'string') {
    try {
      const repository = getSystemRepository(repoRoot);
      const current = await repository.getById(system.id);
      if (current && (!Array.isArray(current.collections) || current.collections.length === 0)) {
        await repository.update(system.id, { collections: syncResult.collections });
      }
    } catch {
      // Keep token sync successful even if collection metadata update fails.
    }
  }

  return {
    attempted: syncResult.attempted ?? true,
    created: (syncResult.tokens_written ?? syncResult.tokens_total ?? 0) > 0,
    reason: syncResult.reason ?? 'persisted',
    collections: syncResult.collections ?? [],
    tokens_written: syncResult.tokens_written ?? syncResult.tokens_total ?? 0,
    tokens_total: syncResult.tokens_total ?? syncResult.tokens_written ?? 0,
    error: syncResult.error,
  };
}
