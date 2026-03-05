#!/usr/bin/env node

/**
 * Token Health Runner
 *
 * I/O operations and CLI entry point for the token health service.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { getStringArg, parseArgs, printUsage } from '../utils/parse-args.js';
import { resolveSystemContextSafe } from '../utils/system-context.js';
import { logger } from '../utils/logger.js';

import { loadTokenRegistry } from '../services/token-utils.js';
import { generateHealthReport } from '../services/token-health.js';

const CLI_CONFIG = {
  command: 'ds:token-health [options]',
  description:
    'Build an operational health summary for token-registry entries (usage, coupling, broken aliases, broken refs, WCAG pairs).',
  options: [
    {
      name: '--registry',
      description: 'Token registry input path.',
      defaultValue: 'docs/_generated/token-registry.json',
    },
    {
      name: '--usage-index',
      description: 'Token usage index input path.',
      defaultValue: 'docs/_generated/token-usage-index.json',
    },
    {
      name: '--graph-viz',
      description: 'Token graph viz input path.',
      defaultValue: 'docs/_generated/token-graph.viz.json',
    },
    {
      name: '--wcag-pairs',
      description: 'WCAG pairs config input path (JSON).',
      defaultValue: 'tooling/config/wcag-pairs.json',
    },
    {
      name: '--out-json',
      description: 'Output JSON path.',
      defaultValue: 'docs/_generated/token-health.json',
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
      name: '--system',
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
  rawValue: string | undefined | null,
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

  const ctx = resolveSystemContextSafe({ system: getStringArg(parsed, 'system') });

  const registryPath = path.resolve(
    String(getStringArg(parsed, 'registry') || ctx.paths.tokenRegistry),
  );
  const usageIndexPath = path.resolve(
    String(getStringArg(parsed, 'usage-index') || ctx.paths.generated + '/token-usage-index.json'),
  );
  const graphVizPath = path.resolve(
    String(parsed['graph-viz'] || ctx.paths.generated + '/token-graph.viz.json'),
  );
  const wcagPairsPath = path.resolve(
    String(parsed['wcag-pairs'] || 'tooling/config/wcag-pairs.json'),
  );
  const outJson = path.resolve(String(parsed['out-json'] || ctx.paths.generated + '/token-health.json'));
  const format = String(parsed.format || 'json');
  const maxItems = parsePositiveInteger(String(parsed['max-items']), '--max-items', 100);
  const highUsageThreshold = parsePositiveInteger(String(parsed['high-usage-threshold']), '--high-usage-threshold', 25);
  const highIndegreeThreshold = parsePositiveInteger(String(parsed['high-indegree-threshold']), '--high-indegree-threshold', 15);
  const dryRun = parseBooleanOption(String(parsed['dry-run']), '--dry-run', false);

  // Load registry
  const registry = loadTokenRegistry(registryPath);

  // Load usage index (optional)
  let usageIndex: any = null;
  if (fs.existsSync(usageIndexPath)) {
    usageIndex = JSON.parse(fs.readFileSync(usageIndexPath, 'utf8'));
  }

  // Load graph viz (optional)
  let graph: any = null;
  if (fs.existsSync(graphVizPath)) {
    graph = JSON.parse(fs.readFileSync(graphVizPath, 'utf8'));
  }

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
