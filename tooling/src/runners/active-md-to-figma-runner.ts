#!/usr/bin/env node

/**
 * Active Markdown to Figma Runner
 *
 * Render active markdown documentation to Figma using themed renderer.
 * TypeScript runner for ds-active-md-to-figma script.
 */

import { parseArgs } from '../utils/parse-args.js';
import { isMain } from '../utils/is-main.js';
import {
  executeActiveMdToFigmaPreparation,
  type ActiveMdToFigmaPreparationArgs as ActiveMdToFigmaArgs,
} from '../services/active-md-to-figma-preparation.js';
import { buildActiveMdToFigmaRuntime } from '../services/active-md-to-figma-runtime.js';
import { syncDocumentation } from '../services/documentation-sync.js';
import { formatPipelineSkipOutput } from '../services/active-md-to-figma-output.js';
import { runRenderPhases } from '../services/render-phase-runner.js';
import { logger } from '../utils/logger.js';

/**
 * Main active markdown to Figma function.
 */
export async function runActiveMdToFigma(
  args: ActiveMdToFigmaArgs = {},
): Promise<void> {
  // 1. Execute preparation (resolution + validation)
  const preflight = executeActiveMdToFigmaPreparation(args);

  const { componentName } = preflight;

  // 2. Build runtime (context + phases, includes theme resolution + mkdir)
  const runtime = buildActiveMdToFigmaRuntime(preflight, args.theme);

  // 3. Execute phases
  try {
    const state = await runRenderPhases(runtime.context, runtime.phases);

    // 4. Handle pipeline skip (cache hit)
    if (state.pipeline?.skipped) {
      process.stdout.write(
        formatPipelineSkipOutput(
          state.pipeline.skipReason,
          runtime.context.markdownPath,
          componentName,
          state.pipeline.paths,
        ),
      );
      return;
    }

    // 5. Sync documentation indices (always runs after successful pipeline)
    syncDocumentation(runtime.context);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

// CLI entry point
if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args) as ActiveMdToFigmaArgs;
  runActiveMdToFigma(parsed).catch((error) => {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
