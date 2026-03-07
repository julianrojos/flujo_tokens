/**
 * Capture System Bootstrap
 *
 * Handles system repository initialization and token compilation for capture pipeline.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { PROJECT_ROOT } from '../utils/system-context.js';
import { createDesignSystemRepository } from '../../scripts/lib/system-repository.mjs';
import {
  hasInputJsonFiles,
  runTokensCompile,
  syncFigmaTokensToInput,
} from './figma-token-sync.js';
import type { DesignSystemConfigEntry } from '../../scripts/lib/system-repository.mjs';

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

/**
 * Get or create system repository for repo root.
 */
export function getSystemRepository(repoRoot: string): ReturnType<typeof createDesignSystemRepository> {
  const key = path.resolve(repoRoot || PROJECT_ROOT);
  if (!_systemRepositories.has(key)) {
    _systemRepositories.set(key, createDesignSystemRepository({ repoRoot: key }));
  }
  return _systemRepositories.get(key)!;
}

/**
 * Ensure collections are configured for system.
 */
export function ensureCollectionsConfigured(params: {
  repoRoot: string;
  systemId?: string;
}): void {
  const { repoRoot, systemId } = params;

  if (!systemId || systemId === '_legacy') return;

  const repository = getSystemRepository(repoRoot);
  const config = repository.getConfig();

  if (!config || typeof config !== 'object' || !Array.isArray(config.systems)) return;

  const targetIndex = config.systems.findIndex(
    (item) => String((item as { id?: unknown })?.id || '').trim() === systemId,
  );
  if (targetIndex < 0) return;

  const target = config.systems[targetIndex] as DesignSystemConfigEntry;
  if (Array.isArray(target.collections) && target.collections.length > 0) return;

  const inferred = inferCollectionsFromInputDir(repoRoot, target.inputDir);
  if (inferred.length === 0) return;

  target.collections = inferred;
  config.systems[targetIndex] = target;
  repository.saveConfig(config);
}

/**
 * Get system configuration by ID.
 */
export function getSystemConfig(params: {
  repoRoot: string;
  systemId?: string;
}): Record<string, unknown> | null {
  const { repoRoot, systemId } = params;

  if (!systemId || systemId === '_legacy') return null;

  try {
    // Use resolveSystemContext instead of non-existent getSystem
    const system = getSystemRepository(repoRoot).resolveSystemContext(systemId);
    return system as Record<string, unknown> || null;
  } catch {
    return null;
  }
}

/**
 * Bootstrap input JSON from Figma variables.
 */
export async function bootstrapInputJsonFromFigmaVariables(params: {
  repoRoot: string;
  system?: Record<string, unknown> | null;
  fileKey?: string;
  figmaToken: string;
  syncFigmaTokensToInputFn?: typeof syncFigmaTokensToInput;
}): Promise<{
  attempted: boolean;
  created: boolean;
  reason: string;
  files_written?: number;
  tokens_written?: number;
  tokens_total?: number;
  files?: string[];
  error?: string;
}> {
  const {
    repoRoot,
    system,
    fileKey,
    figmaToken,
    syncFigmaTokensToInputFn = syncFigmaTokensToInput,
  } = params;
  
  if (!system) {
    return { attempted: false, created: false, reason: 'system-missing' };
  }

  const inputDir = String(system.inputDir || '').trim();
  if (!inputDir) {
    return { attempted: false, created: false, reason: 'system-input-dir-missing' };
  }
  if (hasInputJsonFiles(repoRoot, inputDir)) {
    return { attempted: false, created: false, reason: 'input-json-exists' };
  }
  if (!fileKey) {
    return { attempted: false, created: false, reason: 'figma-file-key-missing' };
  }

  const syncResult = await syncFigmaTokensToInputFn({
    repoRoot,
    system,
    fileKey,
    figmaToken,
    force: false,
    merge: false,
    dryRun: false,
  });

  return {
    attempted: syncResult.attempted ?? true,
    created: (syncResult.files_written ?? 0) > 0,
    reason: syncResult.reason ?? 'bootstrapped',
    files_written: syncResult.files_written ?? 0,
    tokens_written: syncResult.tokens_written ?? 0,
    tokens_total: syncResult.tokens_total ?? syncResult.tokens_written ?? 0,
    files: syncResult.files ?? [],
    error: syncResult.error,
  };
}

/**
 * Run tokens compile if needed.
 */
export function runTokensCompileIfNeeded(params: {
  repoRoot: string;
  system?: Record<string, unknown> | null;
}): {
  attempted: boolean;
  compiled: boolean;
  reason: string;
  stderr?: string;
  output?: string;
} {
  const { repoRoot, system } = params;
  
  if (!system) return { attempted: false, compiled: false, reason: 'system-missing' };
  
  const enabled = system.compileVariablesOnCapture !== false;
  if (!enabled) return { attempted: false, compiled: false, reason: 'disabled-by-config' };

  const compileResult = runTokensCompile({ repoRoot, system });
  return {
    attempted: compileResult.attempted,
    compiled: compileResult.compiled ?? false,
    reason: compileResult.reason ?? (compileResult.compiled ? 'compiled' : 'unknown'),
    stderr: compileResult.stderr,
    output: compileResult.output,
  };
}
