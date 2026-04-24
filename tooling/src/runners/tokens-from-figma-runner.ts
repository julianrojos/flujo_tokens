#!/usr/bin/env node

/**
 * Tokens From Figma Runner
 *
 * Imports Figma local variables from the Figma API into the PostgreSQL token database.
 */

import { parseArgs, printUsage } from '../utils/parse-args.js';
import {
  loadDesignSystemsConfig,
  loadDesignSystemsConfigAsync,
  PROJECT_ROOT,
  type DesignSystemConfig,
} from '../utils/system-context.js';
import { logger } from '../utils/logger.js';
import { resolveRunnerSystemContextOrExit } from '../utils/runner-system-context.js';
import { resolveEnvRef } from '../utils/env-ref.js';
import type { FigmaVariableSource } from 'ds-types';
import { resolveParseFigmaVariableSource } from '../utils/figma-variable-source.js';

import {
  syncFigmaTokensToDatabase,
  isFatalSyncReason,
} from '../services/figma-token-sync.js';

const parseFigmaVariableSource = resolveParseFigmaVariableSource() as (
  rawValue: unknown,
  options?: { defaultValue?: FigmaVariableSource; optionName?: string },
) => FigmaVariableSource;

const CLI_CONFIG = {
  command: 'ds:tokens-from-figma [options]',
  description:
    'Imports Figma local variables into the database.',
  options: [
    {
      name: '--system <id>',
      description: 'Design system identifier (from PostgreSQL design_systems).',
      required: true,
    },
    {
      name: '--url',
      description:
        'Full Figma file URL (https://www.figma.com/design/<fileKey>/...).',
    },
    {
      name: '--file-key',
      description: 'Figma file key (alternative to --url).',
    },
    {
      name: '--figma-token',
      description:
        'Figma personal access token (fallback: FIGMA_TOKEN env var).',
    },
    {
      name: '--source',
      description: 'Variables source: auto, mcp or rest.',
      defaultValue: 'auto',
    },
    {
      name: '--force',
      description: 'Overwrite existing persisted token rows.',
      defaultValue: 'false',
    },
    {
      name: '--merge',
      description: 'Merge incoming variables into existing token rows (requires --force true).',
      defaultValue: 'false',
    },
    {
      name: '--dry-run',
      description: 'Preview what would be written without making any changes.',
      defaultValue: 'false',
    },
    {
      name: '--help',
      description: 'Show this help message.',
    },
  ],
};

function parseBooleanArg(rawValue: unknown, fallback: boolean): boolean {
  const normalized = String(rawValue ?? fallback)
    .trim()
    .toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`Expected true or false, got: ${rawValue}`);
}

function extractFileKeyFromUrl(rawUrl: unknown): string | null {
  const value = String(rawUrl || '').trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const segments = parsed.pathname.split('/').filter(Boolean);
    for (let i = 0; i < segments.length - 1; i += 1) {
      if (segments[i] === 'file' || segments[i] === 'design') {
        return segments[i + 1] || null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Resolve the effective source used for reporting.
 * `auto` is a selection mode, not an actual data source, so we emit `unknown`
 * when the sync layer cannot determine the concrete source.
 */
export function resolveReportedSourceUsed(
  sourceRequested: FigmaVariableSource,
  sourceUsed?: Exclude<FigmaVariableSource, 'auto'>,
): Exclude<FigmaVariableSource, 'auto'> | 'unknown' {
  if (sourceUsed) return sourceUsed;
  if (sourceRequested === 'auto') return 'unknown';
  return sourceRequested;
}

export async function runTokensFromFigma(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  // ── Resolve system ───────────────────────────────────────────────────────
  const hasExplicitSystem = Object.prototype.hasOwnProperty.call(
    parsed,
    'system',
  );
  if (!hasExplicitSystem) {
    console.error('[ds:tokens-from-figma] --system is required.');
    printUsage(CLI_CONFIG);
    process.exit(1);
  }
  await loadDesignSystemsConfigAsync();
  const systemCtx = resolveRunnerSystemContextOrExit({
    parsedArgs: parsed,
    logger,
  });
  const systemId = systemCtx.id;

  let system: DesignSystemConfig;
  try {
    const config = loadDesignSystemsConfig();
    const resolved = config.systems.find(
      (entry) => String(entry.id || '').trim() === systemId,
    );
    if (!resolved) {
      throw new Error(
        `System "${systemId}" not found in PostgreSQL design_systems table`,
      );
    }
    system = resolved;
  } catch (err) {
    logger.error(
      `Cannot resolve system "${systemId}": ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  // ── Resolve Figma file key ───────────────────────────────────────────────
  const fileKeyFromUrl = extractFileKeyFromUrl(parsed.url);
  const fileKeyFromArg = String(parsed['file-key'] || '').trim() || null;
  const fileKeyFromSystem = String(system.figmaFileId || '').trim() || null;
  const fileKey = fileKeyFromArg || fileKeyFromUrl || fileKeyFromSystem;

  if (!fileKey) {
    console.error(
      '[ds:tokens-from-figma] Could not extract Figma file key. Provide --url or --file-key.',
    );
    process.exit(1);
  }

  // ── Resolve Figma API token ──────────────────────────────────────────────
  const figmaTokenArg = String(parsed['figma-token'] || '').trim();
  const figmaTokenSystem = String(system.figmaApiToken || '').trim();
  const figmaTokenEnv = String(process.env.FIGMA_TOKEN || '').trim();
  const figmaToken = resolveEnvRef(
    figmaTokenArg || figmaTokenSystem || figmaTokenEnv,
  );

  // ── Resolve source mode ──────────────────────────────────────────────────
  const source = parseFigmaVariableSource(parsed.source, {
    defaultValue: 'auto',
    optionName: '--source',
  });

  if (source === 'rest' && !figmaToken) {
    console.error(
      '[ds:tokens-from-figma] Figma token is required for --source rest. Provide --figma-token or set FIGMA_TOKEN env var.',
    );
    process.exit(1);
  }

  // ── Resolve flags ────────────────────────────────────────────────────────
  const force = parseBooleanArg(parsed.force, false);
  const merge = parseBooleanArg(parsed.merge, false);
  const dryRun = parseBooleanArg(parsed.dryRun, false);

  if (merge && !force) {
    console.error('[ds:tokens-from-figma] --merge true requires --force true.');
    process.exit(1);
  }

  // ── Sync tokens from Figma ───────────────────────────────────────────────
  try {
    const syncResult = await syncFigmaTokensToDatabase({
      system: {
        id: systemId,
        paths: {
          databaseUrl: systemCtx.paths.databaseUrl,
        },
      },
      fileKey,
      figmaToken,
      force,
      merge,
      dryRun,
      source,
      mcpFileUrl: String(parsed.url || '').trim() || undefined,
    });

    if (syncResult.reason) {
      if (isFatalSyncReason(syncResult.reason)) {
        logger.error(
          `Sync failed: ${syncResult.reason}${syncResult.error ? ` - ${syncResult.error}` : ''}`,
        );
        process.exit(1);
      }
      // Non-fatal reasons are just informational.
    }

    if (dryRun) {
      console.log(
        '[dry-run] Sync preview:',
        JSON.stringify(syncResult, null, 2),
      );
      return;
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun,
          system: systemId,
          fileKey,
          tokensImported: syncResult.tokens_written || 0,
          sourceRequested: source,
          sourceUsed: resolveReportedSourceUsed(source, syncResult.source_used),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    logger.error(
      `Tokens from Figma failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runTokensFromFigma(process.argv.slice(2)).catch((error) => {
    logger.error(
      `Tokens from Figma runner failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
