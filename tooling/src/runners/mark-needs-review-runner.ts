#!/usr/bin/env node

/**
 * Mark Needs Review Runner
 *
 * Marks component markdown docs as `needs-review` when traceability hashes drift.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

import { getStringArg, parseArgs, printUsage } from '../utils/parse-args.js';
import { resolveRunnerSystemContextOrExit } from '../utils/runner-system-context.js';
import { logger } from '../utils/logger.js';
import { parseMarkdownFrontmatter } from '../utils/parse-frontmatter.js';

const HASH_RE = /^[a-f0-9]{64}$/i;

const CLI_CONFIG = {
  command: 'ds:mark-needs-review [options]',
  description:
    'Mark component markdown docs as `needs-review` when traceability hashes drift from current spec or token registry.',
  options: [
    {
      name: '--docs-root',
      description: 'Component docs directory or a parent docs directory.',
      defaultValue: 'docs/components',
    },
    {
      name: '--spec-root',
      description: 'Component spec directory.',
      defaultValue: 'docs/_spec/components',
    },
    {
      name: '--registry',
      description: 'Token registry JSON path used for traceability checks.',
      defaultValue: 'docs/_generated/token-registry.json',
    },
    {
      name: '--file',
      description: 'Single component markdown file to inspect.',
    },
    {
      name: '--spec-file',
      description: 'Explicit spec file path for --file mode.',
    },
    {
      name: '--dry-run',
      description: 'Report changes without writing files.',
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

function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function isValidHash(raw: string | null | undefined): boolean {
  return HASH_RE.test(String(raw || '').trim());
}

function collectComponentMarkdownFiles(docsRoot: string, explicitFilePath: string): string[] {
  if (explicitFilePath) return [path.resolve(explicitFilePath)];
  const resolvedRoot = path.resolve(docsRoot);
  if (!fs.existsSync(resolvedRoot)) return [];

  const componentDir =
    path.basename(resolvedRoot) === 'components'
      ? resolvedRoot
      : path.join(resolvedRoot, 'components');
  if (!fs.existsSync(componentDir)) return [];

  return fs
    .readdirSync(componentDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.md') &&
        entry.name !== 'overview.md',
    )
    .map((entry) => path.join(componentDir, entry.name))
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

interface DriftDetectionOptions {
  frontmatter: Record<string, unknown>;
  specPath: string;
  registryPath: string;
  registryHash: string;
}

function detectDriftReasons(options: DriftDetectionOptions): string[] {
  const { frontmatter, specPath, registryPath, registryHash } = options;
  const reasons: string[] = [];
  const pipeline = (frontmatter as any)?.pipeline;
  const dsComponentDoc =
    pipeline && typeof pipeline === 'object' && !Array.isArray(pipeline)
      ? pipeline.ds_component_doc
      : null;

  if (
    !dsComponentDoc ||
    typeof dsComponentDoc !== 'object' ||
    Array.isArray(dsComponentDoc)
  ) {
    reasons.push('missing_traceability_block');
    return reasons;
  }

  const specHashFrontmatter = String((dsComponentDoc as any).spec_sha256 || '').trim();
  const tokenHashFrontmatter = String(
    (dsComponentDoc as any).token_registry_sha256 || '',
  ).trim();

  if (!fs.existsSync(specPath)) {
    reasons.push('missing_linked_spec');
  } else {
    const currentSpecHash = sha256File(specPath);
    if (!specHashFrontmatter) {
      reasons.push('missing_spec_sha256');
    } else if (!isValidHash(specHashFrontmatter)) {
      reasons.push('invalid_spec_sha256');
    } else if (specHashFrontmatter !== currentSpecHash) {
      reasons.push('spec_sha256_drift');
    }
  }

  if (!fs.existsSync(registryPath)) {
    reasons.push('missing_token_registry');
  } else if (!tokenHashFrontmatter) {
    reasons.push('missing_token_registry_sha256');
  } else if (!isValidHash(tokenHashFrontmatter)) {
    reasons.push('invalid_token_registry_sha256');
  } else if (tokenHashFrontmatter !== registryHash) {
    reasons.push('token_registry_sha256_drift');
  }

  return reasons;
}

function orderFrontmatter(frontmatter: Record<string, unknown>): Record<string, unknown> {
  const preferred = ['doc_type', 'doc_status', 'figma', 'pipeline', 'version'];
  const ordered: Record<string, unknown> = {};
  for (const key of preferred) {
    if (key in frontmatter) ordered[key] = frontmatter[key];
  }
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!(key in ordered)) ordered[key] = value;
  }
  return ordered;
}

function buildMarkdown(frontmatter: Record<string, unknown>, content: string): string {
  const yamlText = yaml.dump(orderFrontmatter(frontmatter), {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
  const normalizedContent = String(content || '').replace(/^\n+/, '');
  return `---\n${yamlText.trimEnd()}\n---\n\n${normalizedContent}`;
}

interface FileUpdate {
  file: string;
  from: string;
  to: string;
  reasons: string[];
}

interface FileError {
  file: string;
  error: string;
}

interface ExecutionReport {
  ok: boolean;
  dryRun: boolean;
  docsRoot: string;
  specRoot: string;
  registryPath: string;
  summary: {
    filesChecked: number;
    updated: number;
    unchanged: number;
    errors: number;
  };
  updates: FileUpdate[];
  errors: FileError[];
}

export async function runMarkNeedsReview(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const ctx = resolveRunnerSystemContextOrExit({ parsedArgs: parsed, logger });

  const docsRootInput = path.resolve(String(getStringArg(parsed, 'docs-root') || ctx.paths.docs));
  const specRoot = path.resolve(String(getStringArg(parsed, 'spec-root') || ctx.paths.specs));
  const registryPath = path.resolve(String(getStringArg(parsed, 'registry') || ctx.paths.tokenRegistry));
  const fileArg = getStringArg(parsed, 'file');
  const specFileArg = getStringArg(parsed, 'spec-file');
  const explicitFilePath = fileArg ? path.resolve(fileArg) : '';
  const explicitSpecFilePath = specFileArg ? path.resolve(specFileArg) : '';
  const dryRun = String(parsed['dry-run'] || 'false') === 'true';

  const files = collectComponentMarkdownFiles(docsRootInput, explicitFilePath);
  if (files.length === 0) {
    console.error(
      explicitFilePath
        ? `Component markdown file not found: ${explicitFilePath}`
        : `No component markdown files found in: ${docsRootInput}`,
    );
    process.exit(1);
  }

  const registryHash = fs.existsSync(registryPath) ? sha256File(registryPath) : '';
  const updates: FileUpdate[] = [];
  const unchanged: Array<{ file: string; doc_status: string; reasons: string[] }> = [];
  const errors: FileError[] = [];

  for (const markdownPath of files) {
    let raw = '';
    let frontmatter: Record<string, unknown> = {};
    let content = '';

    try {
      raw = fs.readFileSync(markdownPath, 'utf8');
      const parsed = parseMarkdownFrontmatter(raw);
      frontmatter = parsed.frontmatter;
      content = parsed.content;
    } catch (error) {
      errors.push({
        file: markdownPath,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const fileSlug = path.basename(markdownPath, path.extname(markdownPath));
    const specPath = explicitSpecFilePath || path.join(specRoot, `${fileSlug}.yml`);
    const reasons = detectDriftReasons({
      frontmatter,
      specPath,
      registryPath,
      registryHash,
    });

    const currentStatus = String((frontmatter as any).doc_status || '').trim().toLowerCase();
    if (reasons.length === 0 || currentStatus === 'needs-review') {
      unchanged.push({
        file: markdownPath,
        doc_status: currentStatus || '<missing>',
        reasons,
      });
      continue;
    }

    const nextFrontmatter =
      frontmatter && typeof frontmatter === 'object' && !Array.isArray(frontmatter)
        ? { ...frontmatter, doc_status: 'needs-review' }
        : { doc_status: 'needs-review' };
    const nextMarkdown = buildMarkdown(nextFrontmatter, content);

    if (!dryRun && nextMarkdown !== raw) {
      fs.writeFileSync(markdownPath, nextMarkdown, 'utf8');
    }

    updates.push({
      file: markdownPath,
      from: currentStatus || '<missing>',
      to: 'needs-review',
      reasons,
    });
  }

  const report: ExecutionReport = {
    ok: errors.length === 0,
    dryRun,
    docsRoot: docsRootInput,
    specRoot,
    registryPath,
    summary: {
      filesChecked: files.length,
      updated: updates.length,
      unchanged: unchanged.length,
      errors: errors.length,
    },
    updates,
    errors,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runMarkNeedsReview(process.argv.slice(2)).catch((error) => {
    console.error(`FATAL: ${error.message}`);
    process.exit(1);
  });
}
