#!/usr/bin/env node

/**
 * Spec from Figma Runner
 *
 * Generate or update component spec YAML from Figma context.
 */

import { parseArgs, printUsage, isMain } from '../utils/index.js';
import { runSpecFromFigma } from '../services/spec-orchestrator.js';
import { logger } from '../utils/logger.js';

const CLI_CONFIG = {
  command:
    'npm run ds:spec-from-figma -- --url "https://www.figma.com/design/...&node-id=123-456" --component-name Alert',
  description: 'Generate or update component spec YAML from Figma context.',
  options: [
    {
      name: '--url <figma-url>',
      description: 'Figma URL for component set/node (recommended).',
    },
    {
      name: '--component-set-node-id <node-id>',
      description: 'Explicit component set node id (format: 123:456).',
    },
    {
      name: '--component-name <name>',
      description: 'Component display name (used for file naming and prompts).',
    },
    {
      name: '--output <path>',
      description: 'Explicit output spec path.',
    },
    {
      name: '--spec-root <path>',
      description: 'Spec components directory (resolves from system context if not provided).',
    },
    {
      name: '--template <path>',
      description: 'Spec template path (defaults to tooling/templates/component-spec/_template.yml).',
      defaultValue: 'tooling/templates/component-spec/_template.yml',
    },
    {
      name: '--registry <path>',
      description: 'Token registry JSON path.',
      defaultValue: '<active-system-docs>/_generated/token-registry.json',
    },
    {
      name: '--agent <codex|claude|gemini|auto>',
      description: 'Agent CLI used for generation.',
      defaultValue: 'auto',
    },
    {
      name: '--force <true|false>',
      description: 'Bypass incremental cache.',
      defaultValue: 'false',
    },
    {
      name: '--skip-validation <true|false>',
      description: 'Skip pre/post validation (requires --force true).',
      defaultValue: 'false',
    },
    {
      name: '--allow-non-evidence-updates <true|false>',
      description:
        'Allow changing existing known spec values outside evidence-backed fields (requires --force true).',
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

/**
 * Main runner function.
 */
export async function runSpecFromFigmaRunner(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const result = await runSpecFromFigma(parsed);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

// CLI entry point
if (isMain(import.meta.url)) {
  runSpecFromFigmaRunner(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);
    if (message.startsWith('Missing Figma source.')) {
      printUsage(CLI_CONFIG, { stream: 'stderr' });
    }
    process.exit(1);
  });
}
