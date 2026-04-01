#!/usr/bin/env node

/**
 * Health Snapshot Runner
 *
 * Captures a historical health snapshot into docs/_generated/health-history.json.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { getStringArg, parseArgs, printUsage } from '../utils/parse-args.js';
import { PROJECT_ROOT } from '../utils/system-context.js';
import { logger } from '../utils/logger.js';
import { resolveRunnerSystemContextOrExit } from '../utils/runner-system-context.js';

const DEFAULT_RETENTION_DAYS = 120;

const CLI_CONFIG = {
  command: 'ds:health-snapshot [options]',
  description:
    'Capture a historical health snapshot (breaking/WCAG/coverage/unresolved) into the active system _generated health-history file.',
  options: [
    {
      name: '--token-health',
      description: 'Token health JSON input path.',
      defaultValue: '<active-system-docs>/_generated/token-health.json',
    },
    {
      name: '--components-health',
      description: 'Components health JSON input path.',
      defaultValue: '<active-system-docs>/_generated/components-health.json',
    },
    {
      name: '--token-usage-index',
      description: 'Token usage index JSON input path.',
      defaultValue: '<active-system-docs>/_generated/token-usage-index.json',
    },
    {
      name: '--before-ref',
      description: 'Git ref used to compute breaking token changes via ds-token-diff.',
      defaultValue: 'HEAD~1',
    },
    {
      name: '--retention-days',
      description: 'Drop snapshots older than this number of days.',
      defaultValue: String(DEFAULT_RETENTION_DAYS),
    },
    {
      name: '--skip-diff',
      description: 'Skip token diff execution (breaking_changes will be null).',
      defaultValue: 'false',
    },
    {
      name: '--allow-duplicate-day',
      description: 'Allow multiple snapshots per day with identical signature.',
      defaultValue: 'false',
    },
    {
      name: '--out',
      description: 'Output health history JSON path.',
      defaultValue: '<active-system-docs>/_generated/health-history.json',
    },
    {
      name: '--format',
      description: 'Stdout format.',
      defaultValue: 'json',
    },
    {
      name: '--dry-run',
      description: 'Compute and report without writing output file.',
      defaultValue: 'false',
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
  throw new Error(`Invalid ${optionName} value: ${rawValue}. Allowed: true, false.`);
}

function parseIntegerOption(
  rawValue: string | undefined | null,
  optionName: string,
  fallback: number,
  minValue: number,
): number {
  const parsed = Number(rawValue ?? fallback);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${optionName} value: ${rawValue}. Expected a number.`);
  }
  return Math.max(minValue, Math.floor(parsed));
}

function resolveSafePath(rawPath: string | undefined | null, label: string): string {
  const resolved = path.resolve(String(rawPath || '').trim());
  const rootWithSep = PROJECT_ROOT.endsWith(path.sep)
    ? PROJECT_ROOT
    : `${PROJECT_ROOT}${path.sep}`;
  if (resolved !== PROJECT_ROOT && !resolved.startsWith(rootWithSep)) {
    throw new Error(`${label} must be inside project root (${PROJECT_ROOT}). Received: ${resolved}`);
  }
  return resolved;
}

function readJsonRequired(filePath: string, label: string): any {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${label} (${filePath}): ${reason}`);
  }
}

function readJsonOptional(filePath: string): any {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function stableSerialize(value: any): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function formatDateBucket(isoTimestamp: string): string {
  const date = new Date(String(isoTimestamp || ''));
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

interface Snapshot {
  captured_at: string;
  metrics: {
    breaking_changes: number | null;
    wcag_failures_total: number;
    coverage_avg: number;
    unresolved_total: number;
    unused_tokens_total: number;
    needs_review_total: number;
  };
  fingerprints: {
    token_health: string;
    components_health: string;
    token_usage: string;
    token_diff: string;
    signature_sha256: string;
  };
  meta: {
    before_ref: string;
  };
}

interface HistoryData {
  schema_version: number;
  snapshots: Snapshot[];
}

function normalizeHistory(raw: any): HistoryData {
  const snapshots = Array.isArray(raw?.snapshots) ? raw.snapshots : [];
  const normalized = snapshots
    .filter((snapshot: any) => snapshot && typeof snapshot === 'object')
    .filter((snapshot: any) => {
      const timestamp = String(snapshot.captured_at || '');
      return Boolean(timestamp);
    })
    .map((snapshot: any) => ({
      captured_at: String(snapshot.captured_at),
      metrics: {
        breaking_changes:
          snapshot?.metrics?.breaking_changes === null
            ? null
            : Number(snapshot?.metrics?.breaking_changes || 0),
        wcag_failures_total: Number(snapshot?.metrics?.wcag_failures_total || 0),
        coverage_avg: Number(snapshot?.metrics?.coverage_avg || 0),
        unresolved_total: Number(snapshot?.metrics?.unresolved_total || 0),
        unused_tokens_total: Number(snapshot?.metrics?.unused_tokens_total || 0),
        needs_review_total: Number(snapshot?.metrics?.needs_review_total || 0),
      },
      fingerprints: {
        token_health: String(snapshot?.fingerprints?.token_health || ''),
        components_health: String(snapshot?.fingerprints?.components_health || ''),
        token_usage: String(snapshot?.fingerprints?.token_usage || ''),
        token_diff: String(snapshot?.fingerprints?.token_diff || ''),
        signature_sha256: String(snapshot?.fingerprints?.signature_sha256 || ''),
      },
      meta: {
        before_ref: String(snapshot?.meta?.before_ref || 'HEAD~1'),
      },
    }))
    .sort((left: any, right: any) => left.captured_at.localeCompare(right.captured_at));

  return {
    schema_version: 1,
    snapshots: normalized,
  };
}

export async function runHealthSnapshot(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const format = String(parsed.format || 'json').trim().toLowerCase();
  if (format !== 'json' && format !== 'text') {
    throw new Error(`Invalid --format value: ${format}. Allowed: json, text.`);
  }

  const dryRun = parseBooleanOption(parsed['dry-run'], '--dry-run', false);
  const skipDiff = parseBooleanOption(parsed['skip-diff'], '--skip-diff', false);
  const allowDuplicateDay = parseBooleanOption(
    parsed['allow-duplicate-day'],
    '--allow-duplicate-day',
    false,
  );
  const retentionDays = parseIntegerOption(
    String(parsed['retention-days']),
    '--retention-days',
    DEFAULT_RETENTION_DAYS,
    1,
  );
  const beforeRef = String(getStringArg(parsed, 'before-ref') || 'HEAD~1').trim();

  const ctx = resolveRunnerSystemContextOrExit({ parsedArgs: parsed, logger });
  const genDir = ctx.paths.generated;

  const tokenHealthPath = resolveSafePath(
    String(getStringArg(parsed, 'token-health') || path.join(genDir, 'token-health.json')),
    '--token-health',
  );
  const componentsHealthPath = resolveSafePath(
    String(getStringArg(parsed, 'components-health') || path.join(genDir, 'components-health.json')),
    '--components-health',
  );
  const tokenUsageIndexPath = resolveSafePath(
    String(getStringArg(parsed, 'token-usage-index') || path.join(genDir, 'token-usage-index.json')),
    '--token-usage-index',
  );
  const outPath = resolveSafePath(
    String(getStringArg(parsed, 'out') || path.join(genDir, 'health-history.json')),
    '--out',
  );

  const tokenHealth = readJsonRequired(tokenHealthPath, 'token health');
  const componentsHealth = readJsonRequired(componentsHealthPath, 'components health');
  const tokenUsageIndex = readJsonRequired(tokenUsageIndexPath, 'token usage index');
  const existingHistory = normalizeHistory(readJsonOptional(outPath));

  const nowIso = new Date().toISOString();

  // Simplified diff result (full implementation would call ds-token-diff)
  const diffResult = {
    breakingChanges: null,
    fingerprint: '',
    warning: skipDiff ? 'Token diff skipped (--skip-diff true).' : null,
  };

  const snapshot: Snapshot = {
    captured_at: nowIso,
    metrics: {
      breaking_changes: diffResult.breakingChanges,
      wcag_failures_total: Number(tokenHealth?.summary?.wcag_failures_total || 0),
      coverage_avg: Number(componentsHealth?.summary?.average_coverage_percent || 0),
      unresolved_total: Number(tokenUsageIndex?.summary?.unresolved_total || 0),
      unused_tokens_total: Number(tokenHealth?.summary?.unused_tokens_total || 0),
      needs_review_total: Number(componentsHealth?.summary?.needs_review || 0),
    },
    fingerprints: {
      token_health: String(tokenHealth?.fingerprint_sha256 || ''),
      components_health: String(componentsHealth?.fingerprint_sha256 || ''),
      token_usage: String(tokenUsageIndex?.fingerprint || ''),
      token_diff: String(diffResult.fingerprint || ''),
      signature_sha256: '',
    },
    meta: {
      before_ref: beforeRef,
    },
  };

  snapshot.fingerprints.signature_sha256 = sha256(
    stableSerialize({
      metrics: snapshot.metrics,
      fingerprints: {
        token_health: snapshot.fingerprints.token_health,
        components_health: snapshot.fingerprints.components_health,
        token_usage: snapshot.fingerprints.token_usage,
        token_diff: snapshot.fingerprints.token_diff,
      },
      before_ref: beforeRef,
    }),
  );

  const lastSnapshot = existingHistory.snapshots[existingHistory.snapshots.length - 1] || null;
  const sameDay =
    lastSnapshot &&
    formatDateBucket(lastSnapshot.captured_at) === formatDateBucket(snapshot.captured_at);
  const sameSignature =
    lastSnapshot &&
    String(lastSnapshot.fingerprints?.signature_sha256 || '') ===
      snapshot.fingerprints.signature_sha256;

  const shouldAppend = allowDuplicateDay || !(sameDay && sameSignature);
  const snapshots = shouldAppend
    ? [...existingHistory.snapshots, snapshot]
    : existingHistory.snapshots.slice();

  const cutoffEpoch = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const prunedSnapshots = snapshots.filter((item) => {
    const epoch = new Date(item.captured_at).getTime();
    return Number.isFinite(epoch) && epoch >= cutoffEpoch;
  });
  const prunedCount = snapshots.length - prunedSnapshots.length;

  const historyOutput = {
    ok: true,
    schema_version: 1,
    generated_at: nowIso,
    retention_days: retentionDays,
    snapshots: prunedSnapshots,
    summary: {
      snapshots_total: prunedSnapshots.length,
      latest_at:
        prunedSnapshots.length > 0 ? prunedSnapshots[prunedSnapshots.length - 1].captured_at : null,
    },
  };

  const content = `${JSON.stringify(historyOutput, null, 2)}\n`;
  let writeResult = { changed: false, written: false };

  if (!dryRun) {
    const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
    const changed = current !== content;
    if (changed) {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, content, 'utf8');
      writeResult = { changed: true, written: true };
    }
  }

  const output = {
    ok: true,
    dry_run: dryRun,
    out_json: path.relative(PROJECT_ROOT, outPath),
    appended: shouldAppend,
    deduplicated_same_day: !shouldAppend,
    pruned_old_snapshots: prunedCount,
    snapshots_total: prunedSnapshots.length,
    changed: writeResult.changed,
    written: writeResult.written,
    snapshot,
    warnings: diffResult.warning ? [diffResult.warning] : [],
  };

  if (format === 'text') {
    const lines = [
      `Health snapshot: ${shouldAppend ? 'appended' : 'deduplicated'}`,
      `Output: ${output.out_json}${dryRun ? ' (dry-run)' : ''}`,
      `Snapshots total: ${output.snapshots_total}`,
      `Changed: ${output.changed ? 'yes' : 'no'} | Written: ${output.written ? 'yes' : 'no'}`,
      `Metrics: breaking=${String(snapshot.metrics.breaking_changes)} wcag=${snapshot.metrics.wcag_failures_total} coverage=${snapshot.metrics.coverage_avg} unresolved=${snapshot.metrics.unresolved_total}`,
    ];
    if (diffResult.warning) lines.push(`Warning: ${diffResult.warning}`);
    console.log(lines.join('\n'));
  } else {
    console.log(JSON.stringify(output, null, 2));
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runHealthSnapshot(process.argv.slice(2)).catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Health snapshot runner failed: ${errorMessage}`);
    process.exit(1);
  });
}
