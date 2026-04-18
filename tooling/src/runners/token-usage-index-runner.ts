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
import { loadDesignSystemsConfigAsync } from '../utils/system-context.js';

import {
  buildAliasChains,
  extractCssReferences,
  generateUsageIndexFromFile,
  generateUsageIndex,
} from '../services/token-usage-index.js';
import { loadTokenCatalogFromDatabase } from '../services/token-catalog-db.js';
import type { TokenUsageIndex } from '../services/token-types.js';

const CLI_CONFIG = {
  command: 'ds:token-usage-index [options]',
  description:
    'Generate a deterministic usage index from the active system database, CSS alias chains, and Figma aliases.',
  options: [
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
      name: '--registry',
      description: 'Legacy registry JSON input path. Overrides database-backed loading when present.',
    },
    {
      name: '--spec-root',
      description: 'Legacy spec root input path. Accepted for compatibility.',
    },
    {
      name: '--out',
      description: 'Output JSON file path.',
      defaultValue: '<active-system-docs>/_generated/token-usage-index.json',
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

  await loadDesignSystemsConfigAsync();
  const ctx = resolveRunnerSystemContextOrExit({ parsedArgs: parsed, logger });

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
  const registryPathArg = getStringArg(parsed, 'registry');
  const hasRegistryFlag = Object.prototype.hasOwnProperty.call(parsed, 'registry');
  const registryPath = registryPathArg ? path.resolve(registryPathArg) : '';

  if (hasRegistryFlag && !registryPath) {
    throw new Error('Invalid --registry path: value is empty.');
  }
  if (registryPathArg && !fs.existsSync(registryPath)) {
    throw new Error(`Invalid --registry path: ${registryPath}`);
  }

  const report = registryPath
    ? (generateUsageIndexFromFile(
        registryPath,
        cssFiles,
        figmaAliasGraphPath,
      ) as TokenUsageIndex)
    : (() => {
        const registry = loadTokenCatalogFromDatabase({
          databaseUrl: ctx.paths.databaseUrl,
          systemId: ctx.id,
        });
        return registry.then((loadedRegistry) => {
          const cssRefs = extractCssReferences(cssFiles, loadedRegistry);
          const aliasChains = buildAliasChains(cssFiles, loadedRegistry);
          return generateUsageIndex(
            loadedRegistry,
            cssRefs,
            aliasChains,
            figmaAliasGraphPath,
          ) as TokenUsageIndex;
        });
      })();

  const resolvedReport = await report;

  // Output to stdout
  if (format === 'json') {
    console.log(JSON.stringify(resolvedReport, null, 2));
  } else {
    // Text format
    console.log('\n=== Token Usage Index ===\n');
    console.log(`Total tokens: ${resolvedReport.summary.totalTokens}`);
    console.log(`Tokens with usage: ${resolvedReport.summary.tokensWithUsage}`);
    console.log(`Total references: ${resolvedReport.summary.usage_links_total}`);
    console.log(`Warnings: ${resolvedReport.warnings.length}`);
    console.log(`Unresolved references: ${resolvedReport.unresolved.length}`);

    if (resolvedReport.unresolved.length > 0) {
      console.log('\nUnresolved:');
      for (const item of resolvedReport.unresolved.slice(0, 20)) {
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
    fs.writeFileSync(outPath, JSON.stringify(resolvedReport, null, 2), 'utf8');
    console.error(`✅ Report saved to ${outPath}`);
  }

  // Exit with error if strict mode and unresolved refs
  if (strictUnresolved && resolvedReport.unresolved.length > 0) {
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
