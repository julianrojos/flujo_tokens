/**
 * Capture System Bootstrap
 *
 * Handles system repository initialization and token bootstrap for capture pipeline.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { PROJECT_ROOT } from '../utils/system-context.js';
import { createDesignSystemRepository } from '../../scripts/lib/system-repository.mjs';
import { syncFigmaTokensToDatabase } from './figma-token-sync.js';
import type { FigmaVariableSource } from './figma-token-sync.js';

/**
 * Convert raw value to collection label (title case).
 */
export function toCollectionLabel(rawValue: unknown): string {
  return String(rawValue || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Infer collection names from input directory JSON files.
 */
export function inferCollectionsFromInputDir(repoRoot: string, inputDir?: string): string[] {
  const resolvedDir = path.resolve(repoRoot, inputDir || '');
  if (!fs.existsSync(resolvedDir)) return [];

  const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
  return Array.from(
    new Set(
      entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map((entry) => toCollectionLabel(entry.name))
        .filter(Boolean),
    ),
  );
}

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
 * Ensure collections are configured for system.
 */
export async function ensureCollectionsConfigured(params: {
  repoRoot: string;
  systemId?: string;
}): Promise<void> {
  const { repoRoot, systemId } = params;

  if (!systemId) return;

  const repository = getSystemRepository(repoRoot);
  const target = await repository.getById(systemId);
  if (!target) return;
  if (Array.isArray(target.collections) && target.collections.length > 0) return;

  const systemContext = await repository.resolveSystemContext(systemId);
  const inferred = inferCollectionsFromInputDir(repoRoot, systemContext.paths.input);
  if (inferred.length === 0) return;

  await repository.update(systemId, { collections: inferred });
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
export async function bootstrapInputJsonFromFigmaVariables(params: {
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
