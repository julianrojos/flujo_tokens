/**
 * Traceability Command Builder
 *
 * Utilities for building CLI commands for traceability regeneration.
 * Extracted from figma.ts for reuse across validation modules.
 */

import * as path from 'node:path';

// ============================================================================
// Public API
// ============================================================================

/**
 * Convert file path to CLI-friendly relative path.
 *
 * @param filePath - Absolute or relative file path
 * @returns Relative path from cwd, or absolute if outside project
 */
export function toCliPath(filePath: string): string {
  const resolved = path.resolve(String(filePath || ''));
  const relative = path.relative(process.cwd(), resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return resolved;
  }
  return relative;
}

/**
 * Build regeneration command for traceability issues.
 *
 * Returns an npm command that can be run to regenerate markdown
 * traceability from spec and registry.
 *
 * @param paths - Object with markdown, spec, and registry paths
 * @returns npm command string for regeneration
 */
export function buildTraceabilityRegenerationCommand(paths: {
  markdownPath: string;
  specPath: string;
  databaseUrl: string;
}): string {
  const specArg = JSON.stringify(toCliPath(paths.specPath));
  const outputArg = JSON.stringify(toCliPath(paths.markdownPath));
  const registryArg = JSON.stringify(toCliPath(paths.databaseUrl));
  return `Regenerate manually: update ${outputArg} from ${specArg} using the dashboard, then refresh registry data from ${registryArg}.`;
}
