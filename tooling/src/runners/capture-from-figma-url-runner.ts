#!/usr/bin/env node

/**
 * Capture from Figma URL Runner
 *
 * Capture visual proof from a Figma URL and persist capture artifacts.
 * TypeScript runner for ds-capture-from-figma-url script.
 */

import { parseArgs, printUsage } from '../utils/parse-args.js';
import { isMain } from '../utils/is-main.js';
import { runCaptureFromFigmaUrl } from '../services/capture-orchestrator-main.js';
import { logger } from '../utils/logger.js';
import { toFigmaErrorDetail } from '../utils/figma-api.js';
import type { FigmaErrorDetail } from '../utils/figma-api.js';

const CLI_CONFIG = {
  command:
    'npm run ds:capture-from-url -- --url "https://www.figma.com/design/<fileKey>/<slug>?node-id=123-456"',
  description:
    'Capture visual proof from a Figma URL (single component node or full document) and persist capture artifacts.',
  options: [
    {
      name: '--url <figma-url>',
      description: 'Figma file/design URL with or without node-id.',
      required: true,
    },
    {
      name: '--figma-token <token>',
      description:
        'Figma PAT for REST image export and document traversal. Falls back to FIGMA_TOKEN env var.',
    },
    {
      name: '--docs-root <path>',
      description: 'Docs root or docs/components directory for the active system context.',
    },
    {
      name: '--proof-dir <path>',
      description: 'Visual proof assets directory.',
      defaultValue: '<active-system-docs>/_generated/visual-proofs',
    },
    {
      name: '--proof-image-dir <path>',
      description: 'Visual proof images output directory.',
      defaultValue: '<active-system-docs>/_generated/visual-proofs/images',
    },
    {
      name: '--component-slug <slug>',
      description:
        'Optional explicit component slug (useful when node-id cannot be mapped deterministically).',
    },
    {
      name: '--component-kind <component_set|component|all>',
      description:
        'Component node kinds processed for document URLs. `component_set` is recommended.',
      defaultValue: 'component_set',
    },
    {
      name: '--include-variants <true|false>',
      description: 'Capture one screenshot per variant when possible.',
      defaultValue: 'true',
    },
    {
      name: '--variant-limit <number>',
      description: 'Max variants captured per component.',
      defaultValue: '6',
    },
    {
      name: '--format <png|jpg|svg|pdf>',
      description: 'Export format for screenshots.',
      defaultValue: 'png',
    },
    {
      name: '--scale <number>',
      description: 'Export scale for screenshots.',
      defaultValue: '2',
    },
    {
      name: '--main-capture-mode <auto|agent|rest>',
      description: 'Main screenshot capture mode passed to ds-capture-visual-proof.',
      defaultValue: 'rest',
    },
    {
      name: '--tokens-source <auto|mcp|rest>',
      description: 'Source used for variable bootstrap before capture.',
      defaultValue: 'mcp',
    },
    {
      name: '--agent <codex|claude|gemini|auto>',
      description: 'Agent backend for agent-based capture mode.',
      defaultValue: 'auto',
    },
    {
      name: '--continue-on-error <true|false>',
      description: 'Continue batch captures when one component fails.',
      defaultValue: 'true',
    },
    {
      name: '--dry-run <true|false>',
      description: 'Resolve targets and report without writing changes.',
      defaultValue: 'false',
    },
    {
      name: '--include-spec-exhibits <true|false>',
      description:
        'Include Specs screenshots (Anatomy, Properties, Layout and spacing) in the capture payload when available.',
      defaultValue: 'true',
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
export async function runCaptureFromFigmaUrlRunner(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  try {
    const report = await runCaptureFromFigmaUrl(parsed);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

    if (!report?.dryRun) {
      process.exit(report?.ok ? 0 : 1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const figmaError = toFigmaErrorDetail(error);
    const pipelinePhase =
      error && typeof error === 'object' && 'pipeline_phase' in error
        ? String((error as { pipeline_phase?: unknown }).pipeline_phase || '').trim()
        : '';
    const errorPayload: {
      ok: false;
      error: string;
      figma_error?: FigmaErrorDetail;
      pipeline_phase?: string;
    } = {
      ok: false,
      error: message,
    };
    if (figmaError) {
      errorPayload.figma_error = figmaError;
    }
    if (pipelinePhase) {
      errorPayload.pipeline_phase = pipelinePhase;
    }

    process.stdout.write(`${JSON.stringify(errorPayload, null, 2)}\n`);
    logger.error(message);

    if (message.startsWith('Missing Figma URL.')) {
      printUsage(CLI_CONFIG, { stream: 'stderr' });
    }

    process.exit(1);
  }
}

// CLI entry point
if (isMain(import.meta.url)) {
  runCaptureFromFigmaUrlRunner(process.argv.slice(2));
}
