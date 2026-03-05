#!/usr/bin/env node

/**
 * Registry Validate Runner
 *
 * Validates component-registry.json schema and verifies it matches current source artifacts.
 */

import * as path from 'node:path';

import { parseArgs, printUsage } from '../utils/parse-args.js';
import { logger } from '../utils/logger.js';

// Import from existing lib during migration period
import {
  compareComponentRegistryToSources,
  DEFAULT_COMPONENT_DOCS_DIR,
  DEFAULT_COMPONENT_REGISTRY_PATH,
  DEFAULT_COMPONENT_SPECS_DIR,
  DEFAULT_RENDER_PAYLOADS_DIR,
  DEFAULT_VISUAL_PROOFS_DIR,
} from '../services/component-registry-index.js';

const CLI_CONFIG = {
  command: 'ds:registry:validate [options]',
  description:
    'Validate component-registry.json schema and verify it matches current source artifacts.',
  options: [
    {
      name: '--registry',
      description: 'Component registry path.',
      defaultValue: 'docs/_generated/component-registry.json',
    },
    {
      name: '--spec-root',
      description: 'Component spec directory.',
      defaultValue: 'docs/_spec/components',
    },
    {
      name: '--docs-root',
      description: 'Component docs directory.',
      defaultValue: 'docs/components',
    },
    {
      name: '--render-dir',
      description: 'Directory for markdown->Figma render payload files.',
      defaultValue: 'docs/_generated/figma_doc_models',
    },
    {
      name: '--proof-dir',
      description: 'Directory for visual proof metadata files.',
      defaultValue: 'docs/_generated/visual-proofs',
    },
    {
      name: '--strict',
      description: 'Fail on drift (default true).',
      defaultValue: 'true',
    },
    {
      name: '--help',
      description: 'Show this help message.',
    },
  ],
};

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

export async function runRegistryValidate(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const strict = parseBooleanOption(String(parsed.strict), '--strict', true);

  try {
    const comparison = compareComponentRegistryToSources({
      registryPath: path.resolve(String(parsed.registry || DEFAULT_COMPONENT_REGISTRY_PATH)),
      specsDir: path.resolve(String(parsed['spec-root'] || DEFAULT_COMPONENT_SPECS_DIR)),
      docsDir: path.resolve(String(parsed['docs-root'] || DEFAULT_COMPONENT_DOCS_DIR)),
      renderDir: path.resolve(String(parsed['render-dir'] || DEFAULT_RENDER_PAYLOADS_DIR)),
      proofsDir: path.resolve(String(parsed['proof-dir'] || DEFAULT_VISUAL_PROOFS_DIR)),
    });

    const report = {
      ok: comparison.exists && comparison.matches,
      exists: comparison.exists,
      strict,
      registryPath: path.resolve(String(parsed.registry || DEFAULT_COMPONENT_REGISTRY_PATH)),
      expectedFingerprint: comparison.expected.fingerprint_sha256,
      currentFingerprint: (comparison.current as any)?.fingerprint_sha256 || null,
      summary: comparison.expected.summary,
      drift: comparison.exists ? !comparison.matches : true,
      hint: comparison.exists
        ? comparison.matches
          ? 'Registry is synchronized.'
          : 'Run `npm run ds:registry:sync` to update the registry.'
        : 'Run `npm run ds:registry:sync` to create the registry.',
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

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runRegistryValidate(process.argv.slice(2)).catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Registry validate runner failed: ${errorMessage}`);
    process.exit(1);
  });
}
