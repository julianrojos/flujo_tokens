#!/usr/bin/env node

/**
 * Registry Validate Runner (DB-only)
 *
 * Validates that DB-backed component registry can be projected from sources.
 */

import * as path from 'node:path';

import { getStringArg, parseArgs, printUsage } from '../utils/parse-args.js';
import { logger } from '../utils/logger.js';
import { resolveRunnerSystemContextOrExit } from '../utils/runner-system-context.js';
import { compareComponentRegistryToSources } from '../services/component-registry-index.js';

const CLI_CONFIG = {
  command: 'ds:registry:validate [options]',
  description:
    'Validate DB-backed component registry consistency against source artifacts.',
  options: [
    {
      name: '--spec-root',
      description:
        'Component spec directory (resolves from system context if not provided).',
    },
    {
      name: '--docs-root',
      description:
        'Component docs directory (resolves from system context if not provided).',
    },
    {
      name: '--proof-dir',
      description: 'Visual proof assets directory.',
      defaultValue: '<active-system-docs>/_generated/visual-proofs',
    },
    {
      name: '--strict',
      description: 'Fail on detected drift (default true).',
      defaultValue: 'true',
    },
    {
      name: '--system <id>',
      description: 'Target design system context.',
    },
    {
      name: '--help',
      description: 'Show this help message.',
    },
  ],
};

function parseBooleanOption(
  rawValue: unknown,
  optionName: string,
  fallback: boolean = false,
): boolean {
  const normalized = String(rawValue ?? fallback)
    .trim()
    .toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(
    `Invalid ${optionName} value: ${rawValue}. Allowed: true, false.`,
  );
}

export async function runRegistryValidate(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const strict = parseBooleanOption(parsed.strict, '--strict', true);
  const ctx = resolveRunnerSystemContextOrExit({ parsedArgs: parsed, logger });

  try {
    const comparison = await compareComponentRegistryToSources({
      databaseUrl: ctx.paths.databaseUrl,
      systemId: ctx.id,
      specsDir: path.resolve(
        String(getStringArg(parsed, 'spec-root') || ctx.paths.specs),
      ),
      docsDir: path.resolve(
        String(getStringArg(parsed, 'docs-root') || ctx.paths.docs),
      ),
      proofsDir: path.resolve(
        String(
          getStringArg(parsed, 'proof-dir') ||
            path.join(ctx.paths.generated, 'visual-proofs'),
        ),
      ),
    });

    const report = {
      ok: comparison.exists && comparison.matches,
      exists: comparison.exists,
      strict,
      databaseUrl: ctx.paths.databaseUrl,
      expectedFingerprint: comparison.expected.fingerprint_sha256,
      currentFingerprint: comparison.current?.fingerprint_sha256 || null,
      summary: comparison.expected.summary,
      drift: comparison.exists ? !comparison.matches : true,
      hint: comparison.exists
        ? comparison.matches
          ? 'DB registry is synchronized.'
          : 'Run `npm run ds:registry:refresh` to sync DB-backed registry.'
        : 'Run `npm run ds:registry:refresh` to initialize DB-backed registry.',
    };

    console.log(JSON.stringify(report, null, 2));

    if (strict && !report.ok) {
      process.exit(1);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Registry validate failed: ${errorMessage}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runRegistryValidate(process.argv.slice(2)).catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Registry validate runner failed: ${errorMessage}`);
    process.exit(1);
  });
}
