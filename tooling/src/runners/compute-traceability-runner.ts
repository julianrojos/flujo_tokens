#!/usr/bin/env node

/**
 * Compute Traceability Runner
 *
 * Computes and updates content_sha256 traceability field in component documentation.
 * Useful for detecting manual changes post-generation (drift detection).
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

import { parseArgs, printUsage } from '../utils/parse-args.js';
import { isMain } from '../utils/index.js';
import { logger } from '../utils/logger.js';

// Import from existing lib during migration
import { parseMarkdownFrontmatter } from '../utils/parse-frontmatter.js';
import { isPlainObject } from '../utils/is-plain-object.js';

const CLI_CONFIG = {
  command: 'ds:compute-traceability [options]',
  description:
    'Compute and update content_sha256 traceability field in component documentation.',
  options: [
    {
      name: '--file',
      description: 'Component markdown file path (required).',
    },
    {
      name: '--update',
      description: 'Write changes back to file (default: dry-run).',
      defaultValue: 'false',
    },
    {
      name: '--json',
      description: 'Output JSON result (suitable for piping).',
      defaultValue: 'false',
    },
    {
      name: '--registry',
      description:
        'Token registry path (for future feature: semantic hashing).',
    },
    {
      name: '--help',
      description: 'Show this help message.',
    },
  ],
};

/**
 * Compute SHA-256 hash of a string.
 */
function sha256String(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Extract content body from markdown (everything after the frontmatter block).
 * Returns the body string, trimmed but preserving internal structure.
 */
function extractMarkdownBody(rawMarkdown: string): string {
  const parsed = parseMarkdownFrontmatter(rawMarkdown);
  if (!parsed.content) {
    return String(rawMarkdown || '').trim();
  }
  return String(parsed.content || '').trim();
}

/**
 * Compute content_sha256 for a markdown file.
 * Returns { body, hash }.
 */
function computeContentSha256(rawMarkdown: string): {
  body: string;
  hash: string;
} {
  const body = extractMarkdownBody(rawMarkdown);
  const hash = sha256String(body);
  return { body, hash };
}

/**
 * Update pipeline.ds_component_doc.content_sha256 in frontmatter.
 * Preserves other pipeline fields.
 */
function updateContentSha256Frontmatter(
  rawMarkdown: string,
  contentHash: string,
): { oldHash: string | null; newHash: string; nextMarkdown: string } {
  const parsed = parseMarkdownFrontmatter(rawMarkdown);
  if (!parsed.frontmatter || typeof parsed.frontmatter !== 'object') {
    logger.error('ERROR: Could not parse frontmatter');
    process.exit(1);
  }

  const fm: Record<string, unknown> = isPlainObject(parsed.frontmatter)
    ? parsed.frontmatter
    : {};

  if (!fm.pipeline) fm.pipeline = {};
  if (!isPlainObject(fm.pipeline)) fm.pipeline = {};
  if (!(fm.pipeline as Record<string, unknown>).ds_component_doc) {
    (fm.pipeline as Record<string, unknown>).ds_component_doc = {};
  }

  const oldHash = (
    (fm.pipeline as Record<string, unknown>).ds_component_doc as Record<
      string,
      unknown
    >
  ).content_sha256 as string | null;
  (
    (fm.pipeline as Record<string, unknown>).ds_component_doc as Record<
      string,
      unknown
    >
  ).content_sha256 = contentHash;

  const frontmatterYaml = yaml.dump(fm, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });

  const body = extractMarkdownBody(rawMarkdown);
  const nextMarkdown = `---\n${frontmatterYaml.trimEnd()}\n---\n\n${body}`;

  return { oldHash: oldHash ?? null, newHash: contentHash, nextMarkdown };
}

export interface TraceabilityResult {
  file: string;
  hash: string;
  oldHash: string | null;
  updated: boolean;
  drift: boolean;
  newHash?: string;
}

/**
 * Main entry point.
 */
export async function runComputeTraceability(
  args: string[] = [],
): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const filePath = parsed.file ? path.resolve(String(parsed.file)) : null;
  const doUpdate = String(parsed.update || 'false') === 'true';
  const jsonOutput = String(parsed.json || 'false') === 'true';

  if (!filePath) {
    logger.error('ERROR: --file <path> is required');
    printUsage(CLI_CONFIG);
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    logger.error(`ERROR: File not found: ${filePath}`);
    process.exit(1);
  }

  const rawMarkdown = fs.readFileSync(filePath, 'utf8');
  const { hash: contentHash } = computeContentSha256(rawMarkdown);

  let result: TraceabilityResult = {
    file: path.relative(process.cwd(), filePath),
    hash: contentHash,
    oldHash: null,
    updated: false,
    drift: false,
  };

  if (doUpdate) {
    const { oldHash, newHash, nextMarkdown } = updateContentSha256Frontmatter(
      rawMarkdown,
      contentHash,
    );

    result.oldHash = oldHash;
    result.newHash = newHash;
    result.updated = true;
    result.drift = oldHash !== null && oldHash !== newHash;

    fs.writeFileSync(filePath, nextMarkdown, 'utf8');
  }

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\n📄  File: ${result.file}`);
    console.log(`   SHA-256: ${result.hash}`);

    if (result.updated) {
      if (result.drift) {
        console.warn(
          `   ⚠️  DRIFT DETECTED: ${result.oldHash} → ${result.newHash}`,
        );
      } else {
        console.log(
          `   ✅ Updated: ${result.oldHash ?? 'none'} → ${result.newHash}`,
        );
      }
    } else {
      console.log(`   (Dry-run — use --update to write changes)`);
    }
    console.log('');
  }
}

// CLI entry point
if (isMain(import.meta.url)) {
  runComputeTraceability(process.argv.slice(2)).catch((error) => {
    logger.error('Compute traceability runner failed:', error);
    process.exit(1);
  });
}
