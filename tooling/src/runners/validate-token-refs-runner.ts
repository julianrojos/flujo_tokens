#!/usr/bin/env node

/**
 * Validate Token Refs Runner
 *
 * Validates token references in specs and markdown against the token registry.
 * Reports unresolved, wrong format, case mismatch, and deprecated tokens.
 */

import * as path from 'node:path';

import { getStringArg, parseArgs, printUsage } from '../utils/parse-args.js';
import { isMain } from '../utils/index.js';
import { logger } from '../utils/logger.js';
import { resolveRunnerSystemContextOrExit } from '../utils/runner-system-context.js';

// Import from existing lib during migration
import { validateDocs } from '../services/docs-validator.js';
import { DEFAULT_TOKEN_REGISTRY_PATH } from '../services/token-registry.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TokenFinding {
  code: string;
  message: string;
  token?: string;
  file?: string;
  line?: number | null;
  suggested?: string | null;
  rule_ids?: string[];
}

interface TokenEntry {
  token: string;
  file: string;
  line: number | null;
  message: string;
  suggested: string | null;
  source_code: string;
  rule_ids: string[];
}

// ─── Codes that indicate token-reference problems ────────────────────────────

// TOK01: token path not found in registry (prose markdown)
// TOK02: deprecated token usage (markdown)
// TOK03: VariableID:* forbidden format (markdown)
// SPEC01: token path not found in registry (spec YAML token_mapping)
const TOKEN_ERROR_CODES = new Set(['TOK01', 'TOK02', 'TOK03', 'SPEC01']);
const UNRESOLVED_CODES = new Set(['TOK01', 'SPEC01']);
const DEPRECATED_CODES = new Set(['TOK02']);
const WRONG_FORMAT_CODES = new Set(['TOK03']);

const CLI_CONFIG = {
  command: 'ds:validate-token-refs [options]',
  description:
    'Validate token references in specs and markdown against the token registry.',
  options: [
    {
      name: '--component-name',
      description:
        'Component name to validate (infers spec and markdown files).',
    },
    {
      name: '--file',
      description: 'Explicit markdown file path to validate.',
    },
    {
      name: '--spec-file',
      description: 'Explicit spec YAML file path to validate.',
    },
    {
      name: '--registry',
      description: 'Token registry JSON path.',
      defaultValue: '<active-system-docs>/_generated/token-registry.json',
    },
    {
      name: '--docs-root',
      description: 'Component docs root directory (resolves from system context if not provided).',
    },
    {
      name: '--json',
      description: 'Output machine-readable JSON.',
      defaultValue: 'false',
    },
    {
      name: '--no-specs',
      description: 'Skip spec YAML files.',
      defaultValue: 'false',
    },
    {
      name: '--no-markdown',
      description: 'Skip markdown files.',
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

// ─── Classification helpers ──────────────────────────────────────────────────

function classifyFinding(finding: TokenFinding): string | null {
  const code = String(finding?.code || '').trim();
  const message = String(finding?.message || '').toLowerCase();
  const hasSuggested =
    typeof finding?.suggested === 'string' && finding.suggested.length > 0;

  if (WRONG_FORMAT_CODES.has(code)) return 'wrong_format';
  if (DEPRECATED_CODES.has(code)) return 'deprecated';

  if (UNRESOLVED_CODES.has(code)) {
    // A suggested fix indicates a case mismatch (the token exists, just differently cased)
    if (hasSuggested || message.includes('case mismatch'))
      return 'case_mismatch';
    return 'unresolved';
  }

  return null;
}

function buildTokenEntry(finding: TokenFinding): TokenEntry {
  return {
    token: finding.token || extractTokenFromMessage(finding.message),
    file: path.relative(process.cwd(), finding.file || ''),
    line: finding.line ?? null,
    message: finding.message,
    suggested: finding.suggested ?? null,
    source_code: finding.code,
    rule_ids: finding.rule_ids ?? [],
  };
}

function extractTokenFromMessage(message: string): string {
  // Extract backtick-wrapped token from messages like:
  //   "Token reference not found in registry: `Semantic.Color.Foo`."
  //   "Token mapping `token_mapping.container.background`: Token reference not found..."
  const match = String(message || '').match(/`([^`]+)`[^`]*$/);
  return match?.[1] ?? '';
}

// ─── Report projection ───────────────────────────────────────────────────────

function projectTokenRefsReport(baseReport: {
  errors: TokenFinding[];
  warnings: TokenFinding[];
  generatedAt: string;
  summary: {
    filesChecked: number;
    specFilesChecked: number;
    tokenRefsChecked: number;
  };
}) {
  const allFindings = [...baseReport.errors, ...baseReport.warnings];
  const tokenFindings = allFindings.filter((f) =>
    TOKEN_ERROR_CODES.has(String(f?.code || '').trim()),
  );

  const buckets: Record<string, TokenEntry[]> = {
    unresolved: [],
    wrong_format: [],
    case_mismatch: [],
    deprecated: [],
  };

  for (const finding of tokenFindings) {
    const category = classifyFinding(finding);
    if (category) buckets[category].push(buildTokenEntry(finding));
  }

  // Deduplicate by token path within each bucket
  for (const [key, entries] of Object.entries(buckets)) {
    const seen = new Set();
    buckets[key as keyof typeof buckets] = entries.filter((entry) => {
      const dedupeKey = `${entry.token}|${entry.file}|${entry.line}`;
      if (seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    });
  }

  const hasBlockingErrors =
    buckets.unresolved.length > 0 || buckets.wrong_format.length > 0;

  return {
    ok: !hasBlockingErrors,
    generatedAt: baseReport.generatedAt,
    summary: {
      files_checked: baseReport.summary.filesChecked,
      spec_files_checked: baseReport.summary.specFilesChecked,
      token_refs_checked: baseReport.summary.tokenRefsChecked,
      unresolved_tokens: buckets.unresolved.length,
      wrong_format_tokens: buckets.wrong_format.length,
      case_mismatch_tokens: buckets.case_mismatch.length,
      deprecated_tokens: buckets.deprecated.length,
    },
    // Blocking (CI must fail):
    unresolved_tokens: buckets.unresolved,
    wrong_format_tokens: buckets.wrong_format,
    // Non-blocking (warnings):
    case_mismatch_tokens: buckets.case_mismatch,
    deprecated_tokens: buckets.deprecated,
  };
}

// ─── Human-readable console output ──────────────────────────────────────────

function printHumanReport(report: {
  ok: boolean;
  generatedAt: string;
  summary: {
    files_checked: number;
    spec_files_checked: number;
    token_refs_checked: number;
    unresolved_tokens: number;
    wrong_format_tokens: number;
    case_mismatch_tokens: number;
    deprecated_tokens: number;
  };
  unresolved_tokens: TokenEntry[];
  wrong_format_tokens: TokenEntry[];
  case_mismatch_tokens: TokenEntry[];
  deprecated_tokens: TokenEntry[];
}) {
  const { summary } = report;

  const statusIcon = report.ok ? '✅' : '❌';
  console.log(
    `\n${statusIcon}  Token reference validation — ${new Date(report.generatedAt).toLocaleTimeString()}`,
  );
  console.log(
    `   Checked: ${summary.files_checked} markdown file(s), ${summary.spec_files_checked} spec YAML file(s), ${summary.token_refs_checked} token ref(s)\n`,
  );

  if (report.unresolved_tokens.length > 0) {
    console.error(
      `🔴  UNRESOLVED tokens (${report.unresolved_tokens.length}) — BLOCKING`,
    );
    for (const entry of report.unresolved_tokens) {
      const loc = entry.line ? `:${entry.line}` : '';
      console.error(
        `     ${entry.file}${loc}  →  ${entry.token || entry.message}`,
      );
      if (entry.suggested) {
        console.error(`        Did you mean: ${entry.suggested}`);
      }
    }
    console.error('');
  }

  if (report.wrong_format_tokens.length > 0) {
    console.error(
      `🔴  WRONG FORMAT tokens (${report.wrong_format_tokens.length}) — BLOCKING`,
    );
    for (const entry of report.wrong_format_tokens) {
      const loc = entry.line ? `:${entry.line}` : '';
      console.error(`     ${entry.file}${loc}  →  ${entry.message}`);
    }
    console.error('');
  }

  if (report.case_mismatch_tokens.length > 0) {
    console.warn(
      `🟡  CASE MISMATCH tokens (${report.case_mismatch_tokens.length}) — non-blocking`,
    );
    for (const entry of report.case_mismatch_tokens) {
      const loc = entry.line ? `:${entry.line}` : '';
      console.warn(`     ${entry.file}${loc}  →  ${entry.token}`);
      if (entry.suggested)
        console.warn(`        Fix: rename to ${entry.suggested}`);
    }
    console.warn('');
  }

  if (report.deprecated_tokens.length > 0) {
    console.warn(
      `🟡  DEPRECATED tokens (${report.deprecated_tokens.length}) — non-blocking`,
    );
    for (const entry of report.deprecated_tokens) {
      const loc = entry.line ? `:${entry.line}` : '';
      console.warn(
        `     ${entry.file}${loc}  →  ${entry.token || entry.message}`,
      );
    }
    console.warn('');
  }

  if (report.ok) {
    console.log('   All token references are valid.\n');
  } else {
    const fix = buildFixSuggestion(report);
    if (fix) console.error(`💡  Next: ${fix}\n`);
  }
}

function buildFixSuggestion(report: {
  unresolved_tokens: TokenEntry[];
  wrong_format_tokens: TokenEntry[];
}): string | null {
  if (report.unresolved_tokens.length > 0) {
    const sample = report.unresolved_tokens[0];
    if (sample?.file?.endsWith('.yml')) {
      const slug = path.basename(sample.file, '.yml');
      return `npm run ds:audit-consistency -- --component-name ${slug}`;
    }
    return 'npm run ds:audit-consistency  (identify stale token paths)';
  }
  if (report.wrong_format_tokens.length > 0) {
    return 'Replace VariableID:* references with canonical token paths from token-registry.json';
  }
  return null;
}

// ─── Exit code logic ─────────────────────────────────────────────────────────

function computeExitCode(report: {
  unresolved_tokens: TokenEntry[];
  wrong_format_tokens: TokenEntry[];
}): number {
  const hasUnresolved = report.unresolved_tokens.length > 0;
  const hasWrongFormat = report.wrong_format_tokens.length > 0;
  if (hasUnresolved && hasWrongFormat) return 3;
  if (hasUnresolved) return 1;
  if (hasWrongFormat) return 2;
  return 0;
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function runValidateTokenRefs(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const ctx = resolveRunnerSystemContextOrExit({ parsedArgs: parsed, logger });

  const componentName = getStringArg(parsed, 'component-name') || getStringArg(parsed, 'component') || null;
  const registryPath = String(getStringArg(parsed, 'registry') || DEFAULT_TOKEN_REGISTRY_PATH);
  const jsonOutput = String(getStringArg(parsed, 'json') || 'false') === 'true';
  const noSpecs = String(getStringArg(parsed, 'no-specs') || 'false') === 'true';
  const noMarkdown = String(getStringArg(parsed, 'no-markdown') || 'false') === 'true';

  // Resolve target files from component name or explicit paths
  const fileArg = getStringArg(parsed, 'file');
  let filePath: string | null = fileArg ? path.resolve(fileArg) : null;
  const specFileArg = getStringArg(parsed, 'spec-file');
  let specFilePath: string | null = specFileArg ? path.resolve(specFileArg) : null;

  if (componentName && !filePath && !specFilePath) {
    const snake = componentName
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[\s-]+/g, '_')
      .toLowerCase();
    filePath = noMarkdown ? null : path.join(ctx.paths.docs, `${snake}.md`);
    specFilePath = noSpecs ? null : path.join(ctx.paths.specs, `${snake}.yml`);
  }

  const docsRoot = noMarkdown ? undefined : (getStringArg(parsed, 'docs-root') || ctx.paths.docs);

  let baseReport: any;
  try {
    baseReport = validateDocs({
      docsRoot: filePath ? undefined : docsRoot,
      registryPath,
      filePath: filePath ?? undefined,
      specFilePath: specFilePath ?? undefined,
      checkOverview: false,
      checkSpecs: !noSpecs,
      allowExtraH2: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Fatal: ${message}`);
    process.exit(1);
  }

  const report = projectTokenRefsReport(baseReport);

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  process.exit(computeExitCode(report));
}

// CLI entry point
if (isMain(import.meta.url)) {
  runValidateTokenRefs(process.argv.slice(2)).catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Validate token refs runner failed: ${errorMessage}`);
    process.exit(1);
  });
}
