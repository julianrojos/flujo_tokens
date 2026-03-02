/**
 * Render Phase Runner
 *
 * Functional orchestrator for render pipeline phases.
 * Executes phases in sequence, accumulating state.
 */

import type { ActiveMdToFigmaRuntimeContext } from '../types/active-md-to-figma.js';
import type { RenderPipelineState } from './render-pipeline-state.js';
import type { PhaseResult, RenderPhase } from './render-phase.js';

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
  phases: RenderPhase[],
): Promise<RenderPipelineState> {
  let state: RenderPipelineState = {};

  for (const phase of phases) {
    const result = await phase(context, state);

    // Handle phase failure
    if (!result.ok) {
      throw new Error(result.error || 'Phase failed');
    }

    // Merge phase output into state
    if (result.output) {
      state = { ...state, ...result.output };
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
export function phaseSuccess<T extends Partial<RenderPipelineState>>(
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
export function phaseSkip<T extends Partial<RenderPipelineState>>(
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
