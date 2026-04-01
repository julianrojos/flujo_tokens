#!/usr/bin/env node

/**
 * Token Usage Index Runner
 *
 * I/O operations and CLI entry point for the token usage index service.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { getStringArg, parseArgs, printUsage } from '../utils/parse-args.js';
import { logger } from '../utils/logger.js';
import { resolveRunnerSystemContextOrExit } from '../utils/runner-system-context.js';

import {
  generateUsageIndexFromFile,
  extractSpecReferences,
  extractCssReferences,
  buildAliasChains,
  generateUsageIndex,
} from '../services/token-usage-index.js';
import type { TokenUsageIndex } from '../services/token-types.js';
import { loadTokenRegistry } from '../services/token-utils.js';

const CLI_CONFIG = {
  command: 'ds:token-usage-index [options]',
  description:
    'Generate a deterministic usage index for token-registry entries from component specs and CSS alias chains.',
  options: [
    {
      name: '--registry',
      description: 'Token registry JSON path.',
      defaultValue: 'docs/_generated/token-registry.json',
    },
    {
      name: '--spec-root',
      description: 'Directory containing component spec YAML files.',
      defaultValue: 'docs/_spec/components',
    },
    {
      name: '--css-files',
      description: 'Comma-separated CSS files to scan for var(--token) references.',
      defaultValue: '<system>/output/primitives.css,<system>/output/tokens.css',
    },
    {
      name: '--figma-alias-graph',
      description: 'Path to figma-alias-graph.json file.',
    },
    {
      name: '--out',
      description: 'Output JSON file path.',
      defaultValue: 'docs/_generated/token-usage-index.json',
    },
    {
      name: '--format',
      description: 'Stdout output format.',
      defaultValue: 'json',
    },
    {
      name: '--strict-unresolved',
      description: 'Exit non-zero when unresolved token references are found.',
      defaultValue: 'false',
    },
    {
      name: '--dry-run',
      description: 'Compute and print report without writing files.',
      defaultValue: 'false',
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
  const normalized = String(rawValue ?? fallback).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(
    `Invalid ${optionName} value: ${rawValue}. Allowed: true, false.`,
  );
}

export async function runTokenUsageIndex(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const ctx = resolveRunnerSystemContextOrExit({ parsedArgs: parsed, logger });

  const registryPath = path.resolve(
    String(getStringArg(parsed, 'registry') || ctx.paths.tokenRegistry),
  );
  const specRoot = path.resolve(
    String(getStringArg(parsed, 'spec-root') || ctx.paths.specs),
  );
  const cssFiles = String(parsed['css-files'] || `${path.join(ctx.paths.output, 'primitives.css')},${path.join(ctx.paths.output, 'tokens.css')}`)
    .split(',')
    .map((f: string) => path.resolve(f.trim()));
  const outPath = path.resolve(String(parsed.out || ctx.paths.generated + '/token-usage-index.json'));
  const figmaAliasGraphPath = path.resolve(
    String(getStringArg(parsed, 'figma-alias-graph') || ctx.paths.figmaAliasGraph)
  );
  const format = String(parsed.format || 'json');
  const strictUnresolved = parseBooleanOption(parsed['strict-unresolved'], '--strict-unresolved', false);
  const dryRun = parseBooleanOption(parsed['dry-run'], '--dry-run', false);

  // Generate usage index
  const report = generateUsageIndexFromFile(registryPath, specRoot, cssFiles, figmaAliasGraphPath) as TokenUsageIndex;

  // Output to stdout
  if (format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    // Text format
    console.log('\n=== Token Usage Index ===\n');
    console.log(`Total tokens: ${report.summary.totalTokens}`);
    console.log(`Tokens with usage: ${report.summary.tokensWithUsage}`);
    console.log(`Total references: ${report.summary.usage_links_total}`);
    console.log(`Warnings: ${report.warnings.length}`);
    console.log(`Unresolved references: ${report.unresolved.length}`);

    if (report.unresolved.length > 0) {
      console.log('\nUnresolved:');
      for (const item of report.unresolved.slice(0, 20)) {
        console.log(`  • ${item.ref} in ${item.file}`);
      }
    }
  }

  // Write output file
  if (!dryRun) {
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.error(`✅ Report saved to ${outPath}`);
  }

  // Exit with error if strict mode and unresolved refs
  if (strictUnresolved && report.unresolved.length > 0) {
    process.exit(1);
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runTokenUsageIndex(process.argv.slice(2)).catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Token usage index runner failed: ${errorMessage}`);
    process.exit(1);
  });
}
