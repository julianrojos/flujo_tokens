/**
 * Visual Proof Phase
 *
 * Handles visual proof capture after a successful render.
 * Executes capture script with proper error handling and strict mode policy.
 */

import { runOrThrow } from '../utils/exec.js';
import type { ActiveMdToFigmaRuntimeContext } from '../types/active-md-to-figma.js';
import type { RenderPipelineState, VisualProofPhaseOutput } from './render-pipeline-state.js';
import type { PhaseResult, SkipBehavior } from './render-phase.js';

export interface VisualProofCaptureOptions {
  captureProofStrict: boolean;
}

export interface VisualProofCaptureResult {
  ok: boolean;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
}

/**
 * Execute visual proof capture phase.
 *
 * Uses runtime context to build capture command and execute.
 */
export function executeVisualProofPhase(
  context: ActiveMdToFigmaRuntimeContext,
  options: VisualProofCaptureOptions,
): VisualProofCaptureResult {
  const { captureProofStrict } = options;

  // Check if component set ID is available
  if (!context.resolvedComponentSetId) {
    const message = 'Visual proof capture skipped: no deterministic component_set_node_id available.';
    if (captureProofStrict) {
      throw new Error(message);
    }
    return {
      ok: true,
      skipped: true,
      skipReason: message,
    };
  }

  // Build proof arguments
  const proofArgs = buildProofArgs(context);

  // Execute capture
  try {
    executeProofCapture(proofArgs);
    return {
      ok: true,
    };
  } catch (error) {
    const errorMessage = handleProofCaptureError(error, captureProofStrict);
    return {
      ok: false,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Private Helpers
// ============================================================================

/**
 * Build visual proof capture command arguments.
 */
function buildProofArgs(context: ActiveMdToFigmaRuntimeContext): string[] {
  const args: string[] = [
    'tooling/scripts/ds-capture-visual-proof.mjs',
    '--markdown',
    context.markdownPath,
    '--spec-file',
    context.specPath,
    '--component-set-id',
    context.resolvedComponentSetId,
    '--agent',
    'auto', // Default agent for visual proof
  ];

  if (context.system) {
    args.push('--system', context.system);
  }
  if (context.figmaUrl) {
    args.push('--url', context.figmaUrl);
  }

  return args;
}

/**
 * Execute visual proof capture.
 */
function executeProofCapture(args: string[]): void {
  runOrThrow('node', args);
}

/**
 * Handle visual proof capture error.
 */
function handleProofCaptureError(
  error: unknown,
  captureProofStrict: boolean
): string {
  const message = `Visual proof capture failed: ${error instanceof Error ? error.message : String(error)}`;

  if (captureProofStrict) {
    throw new Error(message);
  }

  return message;
}

// ============================================================================
// Phase Wrapper - For functional orchestrator
// ============================================================================

/**
 * Visual proof phase function.
 *
 * Executes visual proof capture.
 * Skips with continue behavior if componentSetId is unavailable.
 * Uses captureProofStrict from context (no external options needed).
 */
export async function visualProofPhase(
  context: ActiveMdToFigmaRuntimeContext,
  _state: RenderPipelineState,
): Promise<PhaseResult<VisualProofPhaseOutput>> {
  const result = executeVisualProofPhase(context, {
    captureProofStrict: context.captureProofStrict,
  });

  // Handle skip - continue to next phase (sync, cache update)
  if (result.skipped) {
    return {
      ok: true,
      skipped: true,
      skipBehavior: 'continue' as SkipBehavior,
      reason: result.skipReason,
      output: {
        visualProofResult: result,
      },
    };
  }

  // Handle error
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
    };
  }

  return {
    ok: true,
    output: {
      visualProofResult: result,
    },
  };
}
