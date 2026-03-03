/**
 * Render Phase Runner
 *
 * Functional orchestrator for render pipeline phases.
 * Executes phases in sequence, accumulating state.
 */

import type { ActiveMdToFigmaRuntimeContext } from '../types/active-md-to-figma.js';
import type { RenderPipelineState, RenderPipelinePhase } from './render-pipeline-state.js';
import type { PhaseResult, RenderPhase, SkipBehavior } from './render-phase.js';
import { PipelineError } from './pipeline-error.js';

/**
 * Execute render phases in sequence.
 *
 * Each phase receives the context and accumulated state.
 * Phase outputs are merged into the state for subsequent phases.
 *
 * Behavior:
 * - If a phase returns ok=false, throws an error
 * - If a phase returns skipped=true with skipBehavior='exit', stops and returns current state
 * - If a phase returns skipped=true with skipBehavior='continue', continues to next phase
 *
 * @param context - Runtime context for all phases
 * @param phases - Array of phase functions to execute in order
 * @returns Accumulated state from all executed phases
 */
export async function runRenderPhases(
  context: ActiveMdToFigmaRuntimeContext,
  phases: RenderPipelinePhase[],
): Promise<RenderPipelineState> {
  let state: RenderPipelineState = { stage: 'initial' };

  for (const [index, phase] of phases.entries()) {
    let result: PhaseResult<RenderPipelineState>;
    try {
      result = await phase.execute(context, state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new PipelineError(message, 'PHASE_EXCEPTION', phase.name || `phase-${index}`);
    }

    // Handle phase failure
    if (!result.ok) {
      throw new PipelineError(
        result.error || 'Phase failed',
        'PHASE_FAILED',
        phase.name || `phase-${index}`,
      );
    }

    // Merge phase output into state
    if (result.output) {
      state = result.output;
    }

    // Handle skip with exit behavior
    if (result.skipped && result.skipBehavior === 'exit') {
      return state;
    }
  }

  return state;
}

/**
 * Create a phase result for successful execution.
 */
export function phaseSuccess<T extends RenderPipelineState>(
  output?: T,
): PhaseResult<T> {
  return {
    ok: true,
    output,
  };
}

/**
 * Create a phase result for skipped execution.
 */
export function phaseSkip<T extends RenderPipelineState>(
  reason: string,
  behavior: SkipBehavior = 'continue',
  output?: T,
): PhaseResult<T> {
  return {
    ok: true,
    skipped: true,
    skipBehavior: behavior,
    reason,
    output,
  };
}

/**
 * Create a phase result for failed execution.
 */
export function phaseFailure(
  error: string,
): PhaseResult {
  return {
    ok: false,
    error,
  };
}

// Re-export types for convenience
export type { SkipBehavior } from './render-phase.js';
