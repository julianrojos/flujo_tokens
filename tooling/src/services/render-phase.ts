/**
 * Render Phase Contract
 *
 * Defines the common contract for render pipeline phases.
 * Each phase receives context and state, returns a typed result.
 */

import type { ActiveMdToFigmaRuntimeContext } from '../types/active-md-to-figma.js';
import type { RenderPipelineState } from './render-pipeline-state.js';

/**
 * Skip behavior for phases.
 * - 'exit': stop pipeline execution (e.g., cache hit)
 * - 'continue': continue to next phase (e.g., optional feature unavailable)
 */
export type SkipBehavior = 'exit' | 'continue';

/**
 * Result of a phase execution.
 * Generic over the output type to allow type-safe state accumulation.
 */
export interface PhaseResult<T extends RenderPipelineState | undefined = undefined> {
  /** Whether the phase succeeded */
  ok: boolean;
  
  /** Whether the phase was skipped */
  skipped?: boolean;
  
  /** How to handle the skip (exit pipeline or continue) */
  skipBehavior?: SkipBehavior;
  
  /** Human-readable reason for skip or failure */
  reason?: string;
  
  /** Error message if phase failed */
  error?: string;
  
  /** State updates from this phase */
  output?: T;
}

/**
 * Phase contract.
 * Each phase must declare a stable name for debugging and error reporting.
 */
export interface RenderPhase<T extends RenderPipelineState | undefined = undefined> {
  name: string;
  execute: (
    context: ActiveMdToFigmaRuntimeContext,
    state: RenderPipelineState,
  ) => Promise<PhaseResult<T>> | PhaseResult<T>;
}
