#!/usr/bin/env node

/**
 * Token Health Runner
 *
 * I/O operations and CLI entry point for the token health service.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { getStringArg, parseArgs, printUsage } from '../utils/parse-args.js';
import { logger } from '../utils/logger.js';
import { resolveRunnerSystemContextOrExit } from '../utils/runner-system-context.js';
import { loadDesignSystemsConfigAsync } from '../utils/system-context.js';

import { buildAliasChains, extractCssReferences, generateUsageIndex } from '../services/token-usage-index.js';
import { loadTokenCatalogFromDatabase } from '../services/token-catalog-db.js';
import { generateGraphReport } from '../services/token-graph.js';
import { generateHealthReport } from '../services/token-health.js';

const CLI_CONFIG = {
  command: 'ds:token-health [options]',
  description:
    'Build an operational health summary from the active system database, CSS alias chains, and WCAG pairs.',
  options: [
    {
      name: '--css-files',
      description: 'Comma-separated CSS files to scan for var(--token) references.',
      defaultValue: '<system>/output/primitives.css,<system>/output/tokens.css',
    },
    {
      name: '--figma-alias-graph',
      description: 'Path to figma-alias-graph.json file.',
      defaultValue: '<active-system-docs>/_generated/figma-alias-graph.json',
    },
    {
      name: '--usage-index',
      description: 'Legacy usage index input path. Overrides database-backed generation when present.',
    },
    {
      name: '--graph-viz',
      description: 'Legacy graph viz JSON input path. Overrides database-backed graph generation when present.',
    },
    {
      name: '--wcag-pairs',
      description: 'WCAG pairs config input path (JSON).',
      defaultValue: 'tooling/config/wcag-pairs.json',
    },
    {
      name: '--out-json',
      description: 'Output JSON path.',
      defaultValue: '<active-system-docs>/_generated/token-health.json',
    },
    {
      name: '--format',
      description: 'Stdout format.',
      defaultValue: 'json',
    },
    {
      name: '--max-items',
      description: 'Max items per list section.',
      defaultValue: '100',
    },
    {
      name: '--high-usage-threshold',
      description: 'Flag tokens with usageCount >= threshold as high coupling.',
      defaultValue: '25',
    },
    {
      name: '--high-indegree-threshold',
      description: 'Flag tokens with inDegree >= threshold as high coupling.',
      defaultValue: '15',
    },
    {
      name: '--dry-run',
      description: 'Compute and report without writing output file.',
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

function parsePositiveInteger(
  rawValue: string | undefined | null,
  optionName: string,
  fallback: number = 0,
): number {
  const normalized = String(rawValue ?? fallback).trim();
  const parsed = parseInt(normalized, 10);
  if (isNaN(parsed) || parsed < 0) {
    throw new Error(
      `Invalid ${optionName} value: ${rawValue}. Must be a positive integer.`,
    );
  }
  return parsed;
}

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

export async function runTokenHealth(args: string[] = []): Promise<void> {
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
  const figmaAliasGraphPath = path.resolve(
    String(getStringArg(parsed, 'figma-alias-graph') || ctx.paths.figmaAliasGraph)
  );
  const wcagPairsPath = path.resolve(
    String(parsed['wcag-pairs'] || 'tooling/config/wcag-pairs.json'),
  );
  const outJson = path.resolve(String(parsed['out-json'] || ctx.paths.generated + '/token-health.json'));
  const format = String(parsed.format || 'json');
  const maxItems = parsePositiveInteger(String(parsed['max-items']), '--max-items', 100);
  const highUsageThreshold = parsePositiveInteger(String(parsed['high-usage-threshold']), '--high-usage-threshold', 25);
  const highIndegreeThreshold = parsePositiveInteger(String(parsed['high-indegree-threshold']), '--high-indegree-threshold', 15);
  const dryRun = parseBooleanOption(parsed['dry-run'], '--dry-run', false);
  const usageIndexPathArg = getStringArg(parsed, 'usage-index');
  const graphVizPathArg = getStringArg(parsed, 'graph-viz');
  const usageIndexPath = usageIndexPathArg ? path.resolve(usageIndexPathArg) : '';
  const graphVizPath = graphVizPathArg ? path.resolve(graphVizPathArg) : '';

  if (usageIndexPathArg && !usageIndexPath) {
    throw new Error('Invalid --usage-index path: value is empty.');
  }
  if (usageIndexPathArg && !fs.existsSync(usageIndexPath)) {
    throw new Error(`Invalid --usage-index path: ${usageIndexPath}`);
  }
  if (graphVizPathArg && !graphVizPath) {
    throw new Error('Invalid --graph-viz path: value is empty.');
  }
  if (graphVizPathArg && !fs.existsSync(graphVizPath)) {
    throw new Error(`Invalid --graph-viz path: ${graphVizPath}`);
  }

  const registry = await loadTokenCatalogFromDatabase({
    databaseUrl: ctx.paths.databaseUrl,
    systemId: ctx.id,
  });

  const usageIndex = usageIndexPath
    ? JSON.parse(fs.readFileSync(usageIndexPath, 'utf8'))
    : generateUsageIndex(
        registry,
        extractCssReferences(cssFiles, registry),
        buildAliasChains(cssFiles, registry),
        figmaAliasGraphPath,
      );
  const graph = graphVizPath
    ? JSON.parse(fs.readFileSync(graphVizPath, 'utf8'))
    : generateGraphReport(registry, {
        indirectionThreshold: 3,
        maxItems,
      }).graph;

  // Load WCAG pairs (optional)
  let wcagPairs: any[] = [];
  if (fs.existsSync(wcagPairsPath)) {
    wcagPairs = JSON.parse(fs.readFileSync(wcagPairsPath, 'utf8'));
  }

  // Generate health report
  const report = generateHealthReport(registry, usageIndex, graph, wcagPairs, {
    maxItems,
    highUsageThreshold,
    highIndegreeThreshold,
  });

  // Output to stdout
  if (format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    // Text format
    console.log('\n=== Token Health Summary ===\n');
    console.log(`Status: ${report.status}`);
    console.log(`Total tokens: ${report.summary.totalTokens}`);
    console.log(`Healthy: ${report.summary.healthyTokens}`);
    console.log(`Errors: ${report.summary.errorTokens}`);
    console.log(`Warnings: ${report.summary.warningTokens}`);
    console.log(`Broken aliases: ${report.summary.brokenAliases}`);
    console.log(`Broken refs: ${report.summary.brokenRefs}`);
    console.log(`WCAG failures: ${report.summary.wcagFailures}`);
    console.log(`High coupling: ${report.summary.highCouplingTokens}`);
  }

  // Write output file
  if (!dryRun) {
    const outDir = path.dirname(outJson);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(outJson, JSON.stringify(report, null, 2), 'utf8');
    console.error(`✅ Report saved to ${outJson}`);
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runTokenHealth(process.argv.slice(2)).catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Token health runner failed: ${errorMessage}`);
    process.exit(1);
  });
}
