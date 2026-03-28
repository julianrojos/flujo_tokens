/**
 * System Utils
 *
 * Utility functions for design system operations.
 */

import * as path from 'node:path';

/**
 * Normalize system ID
 */
export function normalizeSystemId(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * Normalize collection list
 */
export function normalizeCollectionList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map((item) => String(item || '').trim()).filter(Boolean)));
}

/**
 * Ensure relative dir
 */
export function ensureRelativeDir(raw: unknown, fallback: string): string {
  const value = String(raw || '').trim() || fallback;
  const normalized = value.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '..')) return fallback;
  const cleaned = segments.join('/');
  return cleaned || fallback;
}

/**
 * Normalize Figma API token ref
 */
export function normalizeFigmaApiTokenRef(raw: unknown, fallback = ''): string {
  const value = String(raw || '').trim();
  if (value.startsWith('env:')) {
    const envVar = value.slice(4);
    const envValue = process.env[envVar];
    return envValue || fallback;
  }
  return value || fallback;
}

/**
 * Resolve safe system paths for deletion
 */
export function resolveSafeSystemPathsForDeletion(
  system: { id?: string } | undefined | null,
  repoRoot: string,
  survivingSystems: Array<{ id?: string }>,
): string[] {
  if (!system?.id) return [];
  
  const systemId = system.id;
  const paths = {
    inputDir: path.join(repoRoot, 'design-systems', systemId, 'input'),
    outputDir: path.join(repoRoot, 'design-systems', systemId, 'output'),
    docsDir: path.join(repoRoot, 'design-systems', systemId, 'docs'),
  };
  
  const survivingDirs = new Set(
    survivingSystems.flatMap((s) => {
      if (!s.id) return [];
      return [
        path.join(repoRoot, 'design-systems', s.id, 'input'),
        path.join(repoRoot, 'design-systems', s.id, 'output'),
        path.join(repoRoot, 'design-systems', s.id, 'docs'),
      ];
    }),
  );
  
  const safePaths: string[] = [];
  for (const candidate of [paths.inputDir, paths.outputDir, paths.docsDir]) {
    if (survivingDirs.has(candidate)) continue;
    safePaths.push(candidate);
  }
  return safePaths;
}

/**
 * Summarize design systems config
 */
export function summarizeDesignSystemsConfig(config: { systems?: Array<{ id?: string; name?: string }>; defaultSystem?: string }): Record<string, unknown> {
  return {
    systems: (Array.isArray(config.systems) ? config.systems : []).map((system) => ({
      id: String(system?.id || ''),
      name: String(system?.name || ''),
    })),
    defaultSystem: String(config.defaultSystem || ''),
  };
}
