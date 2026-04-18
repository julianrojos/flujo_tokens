#!/usr/bin/env node

/**
 * Token Graph Runner
 *
 * I/O operations and CLI entry point for the token graph service.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { getStringArg, parseArgs, printUsage } from '../utils/parse-args.js';
import { logger } from '../utils/logger.js';
import { resolveRunnerSystemContextOrExit } from '../utils/runner-system-context.js';

import { loadTokenRegistry } from '../services/token-utils.js';
import { generateGraphReport } from '../services/token-graph.js';
import type { TokenGraph, TokenGraphReport } from '../services/token-types.js';

const CLI_CONFIG = {
  command: 'ds:token-graph [options]',
  description:
    'Build a deterministic token dependency graph from token-registry.json and report cycles, indirection chains, and unused primitive terminals.',
  options: [
    {
      name: '--registry',
      description: 'Token registry input path.',
      defaultValue: '<active-system-docs>/_generated/token-registry.json',
    },
    {
      name: '--out-json',
      description: 'JSON report output path.',
      defaultValue: '<active-system-docs>/_generated/token-graph.json',
    },
    {
      name: '--out-viz-json',
      description: 'JSON graph output optimized for UI visualization.',
      defaultValue: '<active-system-docs>/_generated/token-graph.viz.json',
    },
    {
      name: '--out-md',
      description: 'Markdown report output path.',
      defaultValue: '<active-system-docs>/_generated/token-graph.md',
    },
    {
      name: '--out-mermaid',
      description: 'Mermaid graph output path.',
      defaultValue: '<active-system-docs>/_generated/token-graph.mmd',
    },
    {
      name: '--format',
      description: 'Stdout format.',
      defaultValue: 'json',
    },
    {
      name: '--indirection-threshold',
      description: 'Report tokens with dependency chains longer than this number.',
      defaultValue: '3',
    },
    {
      name: '--max-items',
      description: 'Max report rows for detailed sections.',
      defaultValue: '100',
    },
    {
      name: '--strict-cycles',
      description: 'Exit non-zero when cycles are detected.',
      defaultValue: 'false',
    },
    {
      name: '--strict-high-indirection',
      description: 'Exit non-zero when high-indirection tokens are detected.',
      defaultValue: 'false',
    },
    {
      name: '--strict-unresolved',
      description: 'Exit non-zero when unresolved css var references are detected.',
      defaultValue: 'false',
    },
    {
      name: '--strict-collisions',
      description: 'Exit non-zero when token identity/cssVar collisions are detected.',
      defaultValue: 'false',
    },
    {
      name: '--mermaid-max-edges',
      description: 'Max edges in Mermaid graph output.',
      defaultValue: '2000',
    },
    {
      name: '--dry-run',
      description: 'Compute and report without writing files.',
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

function parsePositiveInteger(
  rawValue: unknown,
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

export async function runTokenGraph(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const ctx = resolveRunnerSystemContextOrExit({ parsedArgs: parsed, logger });

  const registryPath = path.resolve(
    String(getStringArg(parsed, 'registry') || ctx.paths.tokenRegistry),
  );
  const outJson = path.resolve(String(getStringArg(parsed, 'out-json') || ctx.paths.generated + '/token-graph.json'));
  const outVizJson = path.resolve(String(getStringArg(parsed, 'out-viz-json') || ctx.paths.generated + '/token-graph.viz.json'));
  const outMd = path.resolve(String(getStringArg(parsed, 'out-md') || ctx.paths.generated + '/token-graph.md'));
  const outMermaid = path.resolve(String(parsed['out-mermaid'] || ctx.paths.generated + '/token-graph.mmd'));
  const format = String(parsed.format || 'json');
  const indirectionThreshold = parsePositiveInteger(parsed['indirection-threshold'], '--indirection-threshold', 3);
  const maxItems = parsePositiveInteger(parsed['max-items'], '--max-items', 100);
  const strictCycles = parseBooleanOption(parsed['strict-cycles'], '--strict-cycles', false);
  const strictHighIndirection = parseBooleanOption(parsed['strict-high-indirection'], '--strict-high-indirection', false);
  const strictUnresolved = parseBooleanOption(parsed['strict-unresolved'], '--strict-unresolved', false);
  const strictCollisions = parseBooleanOption(parsed['strict-collisions'], '--strict-collisions', false);
  const dryRun = parseBooleanOption(parsed['dry-run'], '--dry-run', false);
  const mermaidMaxEdges = parsePositiveInteger(parsed['mermaid-max-edges'], '--mermaid-max-edges', 2000);

  // Load registry
  const registry = loadTokenRegistry(registryPath);

  // Generate report
  const report = generateGraphReport(registry, { indirectionThreshold, maxItems });

  // Output to stdout
  if (format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    // Text format
    console.log('\n=== Token Graph Summary ===\n');
    console.log(`Total nodes: ${report.summary.totalNodes}`);
    console.log(`Total edges: ${report.summary.totalEdges}`);
    console.log(`Cycles: ${report.summary.cycleCount}`);
    console.log(`High indirection: ${report.summary.highIndirectionCount}`);
    console.log(`Unused primitives: ${report.summary.unusedPrimitiveCount}`);
    console.log(`Unresolved aliases: ${report.summary.unresolvedAliasCount}`);
    console.log(`Collisions: ${report.summary.collisionCount}`);
  }

  // Write output files
  if (!dryRun) {
    const outDir = path.dirname(outJson);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // JSON report
    fs.writeFileSync(outJson, JSON.stringify(report, null, 2), 'utf8');

    // Viz JSON
    const vizData = {
      nodes: report.graph.nodes.map((n) => ({
        id: n.id,
        path: n.path,
        type: n.type,
        cssVar: n.cssVar,
        depth: n.depth,
        inDegree: n.inDegree,
        outDegree: n.outDegree,
      })),
      edges: report.graph.edges,
    };
    fs.writeFileSync(outVizJson, JSON.stringify(vizData, null, 2), 'utf8');

    // Markdown report
    const mdContent = generateMarkdownReport(report);
    fs.writeFileSync(outMd, mdContent, 'utf8');

    // Mermaid graph
    const mermaidContent = generateMermaidGraph(report.graph, mermaidMaxEdges);
    fs.writeFileSync(outMermaid, mermaidContent, 'utf8');

    console.error(`✅ Reports saved to ${outDir}`);
  }

  // Exit with error if strict mode and issues found
  const hasErrors =
    (strictCycles && report.summary.cycleCount > 0) ||
    (strictHighIndirection && report.summary.highIndirectionCount > 0) ||
    (strictUnresolved && report.summary.unresolvedAliasCount > 0) ||
    (strictCollisions && report.summary.collisionCount > 0);

  if (hasErrors) {
    process.exit(1);
  }
}

function generateMarkdownReport(report: TokenGraphReport): string {
  const lines: string[] = [];

  lines.push('# Token Graph Report\n');
  lines.push(`Generated: ${report.timestamp}\n`);

  lines.push('## Summary\n');
  lines.push(`- **Total tokens:** ${report.summary.totalNodes}`);
  lines.push(`- **Dependencies:** ${report.summary.totalEdges}`);
  lines.push(`- **Cycles:** ${report.summary.cycleCount}`);
  lines.push(`- **High indirection:** ${report.summary.highIndirectionCount}`);
  lines.push(`- **Unused primitives:** ${report.summary.unusedPrimitiveCount}`);
  lines.push(`- **Unresolved aliases:** ${report.summary.unresolvedAliasCount}`);
  lines.push(`- **Collisions:** ${report.summary.collisionCount}`);
  lines.push('');

  if (report.cycles.length > 0) {
    lines.push('## Cycles\n');
    for (const cycle of report.cycles.slice(0, 10)) {
      lines.push(`- ${cycle.join(' → ')}\n`);
    }
  }

  if (report.highIndirection.length > 0) {
    lines.push('## High Indirection Tokens\n');
    for (const item of report.highIndirection.slice(0, 10)) {
      lines.push(`- \`${item.tokenPath}\` (depth: ${item.chainLength})`);
    }
    lines.push('');
  }

  if (report.unusedPrimitives.length > 0) {
    lines.push('## Unused Primitive Tokens\n');
    for (const token of report.unusedPrimitives.slice(0, 20)) {
      lines.push(`- \`${token}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function generateMermaidGraph(graph: TokenGraph, maxEdges: number): string {
  const lines: string[] = [];
  lines.push('graph TD');

  // Add nodes
  for (const node of graph.nodes.slice(0, 500)) {
    const label = node.path.replace(/\./g, '_');
    lines.push(`  ${node.id}[${label}]`);
  }

  // Add edges
  let edgeCount = 0;
  for (const edge of graph.edges) {
    if (edgeCount >= maxEdges) break;
    lines.push(`  ${edge.from} --> ${edge.to}`);
    edgeCount++;
  }

  return lines.join('\n');
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runTokenGraph(process.argv.slice(2)).catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Token graph runner failed: ${errorMessage}`);
    process.exit(1);
  });
}
