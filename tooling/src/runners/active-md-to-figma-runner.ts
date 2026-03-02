#!/usr/bin/env node

/**
 * Active Markdown to Figma Runner
 *
 * Render active markdown documentation to Figma using themed renderer.
 * TypeScript runner for ds-active-md-to-figma script.
 *
 * ## Architecture
 *
 * This runner follows a 5-block orchestration pattern:
 * 1. **Prepare** - executeActiveMdToFigmaPreparation(args)
 * 2. **Build** - buildActiveMdToFigmaRuntime(preflight, theme)
 * 3. **Execute** - runRenderPhases(context, phases)
 * 4. **Output** - formatPipelineSkipOutput(...) for skip handling
 * 5. **Sync** - syncDocumentation(context) after successful pipeline
 *
 * ## Naming Convention
 *
 * This module follows the established naming convention:
 * - `*-preparation` = resolution + validation (active-md-to-figma-preparation.ts)
 * - `*-runtime` = context/phases construction (active-md-to-figma-runtime.ts)
 * - `*-phase` = pipeline stage (render-pipeline-phase.ts, render-audit-phase.ts)
 * - `*-output` = CLI formatting (active-md-to-figma-output.ts)
 * - `*-sync` = sync helper (documentation-sync.ts)
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
import { PipelineError } from '../services/pipeline-error.js';
import type { ActiveMdToFigmaPreparationResult } from '../services/active-md-to-figma-preparation.js';
import type { ActiveMdToFigmaRuntime } from '../services/active-md-to-figma-runtime.js';
import type { RenderPipelineState } from '../services/render-pipeline-state.js';

interface ActiveMdToFigmaRunnerDeps {
  executePreparation: (
    args: ActiveMdToFigmaArgs,
  ) => ActiveMdToFigmaPreparationResult;
  buildRuntime: (
    preflight: ActiveMdToFigmaPreparationResult,
    themePathArg?: string,
  ) => ActiveMdToFigmaRuntime;
  runPhases: (
    context: ActiveMdToFigmaRuntime['context'],
    phases: ActiveMdToFigmaRuntime['phases'],
  ) => Promise<RenderPipelineState>;
  formatSkipOutput: typeof formatPipelineSkipOutput;
  syncDocs: typeof syncDocumentation;
  writeStdout: (text: string) => void;
}

const defaultDeps: ActiveMdToFigmaRunnerDeps = {
  executePreparation: executeActiveMdToFigmaPreparation,
  buildRuntime: buildActiveMdToFigmaRuntime,
  runPhases: runRenderPhases,
  formatSkipOutput: formatPipelineSkipOutput,
  syncDocs: syncDocumentation,
  writeStdout: (text) => {
    process.stdout.write(text);
  },
};

/**
 * Main active markdown to Figma function.
 */
export async function runActiveMdToFigma(
  args: ActiveMdToFigmaArgs = {},
  deps: ActiveMdToFigmaRunnerDeps = defaultDeps,
): Promise<void> {
  // 1. Execute preparation (resolution + validation)
  const preflight = deps.executePreparation(args);

  const { componentName } = preflight;

  // 2. Build runtime (context + phases, includes theme resolution + mkdir)
  const runtime = deps.buildRuntime(preflight, args.theme);

  // 3. Execute phases
  try {
    const state = await deps.runPhases(runtime.context, runtime.phases);

    // 4. Handle pipeline skip (cache hit)
    if (state.pipeline?.skipped) {
      deps.writeStdout(
        deps.formatSkipOutput(
          state.pipeline.skipReason,
          runtime.context.markdownPath,
          componentName,
          state.pipeline.paths,
        ),
      );
      return;
    }

    // 5. Sync documentation indices (always runs after successful pipeline)
    const syncResult = deps.syncDocs(runtime.context);
    if (!syncResult.ok) {
      logger.warn(`[documentation-sync] ${syncResult.error}`);
    }
  } catch (error) {
    throw error;
  }
}

// CLI entry point
if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args) as ActiveMdToFigmaArgs;
  runActiveMdToFigma(parsed).catch((error) => {
    if (error instanceof PipelineError) {
      logger.error(`[${error.phase}] ${error.message} (${error.code})`);
    } else {
      logger.error(error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  });
}
