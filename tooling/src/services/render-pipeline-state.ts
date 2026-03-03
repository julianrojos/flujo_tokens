/**
 * Render Pipeline State
 *
 * Shared staged state for render pipeline phases.
 * Each phase advances the state machine.
 *
 * Execution order:
 * 1. initial
 * 2. pipeline
 * 3. agent
 * 4. audit
 * 5. complete
 *
 * documentation sync is a helper, not a phase, and runs after the pipeline.
 */

import type { RenderPipelineResult } from './render-pipeline-phase.js';
import type { RenderExpectations, RenderReport } from './render-report-parser.js';
import type { RenderAuditPhaseResult } from './render-audit-phase.js';
import type { VisualProofCaptureResult } from './visual-proof-phase.js';
import type { RenderPhase } from './render-phase.js';

/**
 * Initial state before any phase has run.
 * @produced renderPipelinePhase (as starting point)
 * @consumed renderPipelinePhase
 */
export interface InitialRenderPipelineState {
  stage: 'initial';
}

/**
 * State after pipeline phase completes.
 * Contains the rendered pipeline result (paths, ok/skipped status).
 * @produced renderPipelinePhase
 * @consumed renderAgentPhase, renderAuditPhase, visualProofPhase
 */
export interface PipelineRenderState {
  stage: 'pipeline';
  /** Pipeline output: paths, success/skip status, skip reason if applicable */
  pipeline: RenderPipelineResult;
}

/**
 * State after render agent phase completes.
 * Contains render expectations (what to render) and audit report (what was found).
 * @produced renderAgentPhase
 * @consumed renderAuditPhase, visualProofPhase
 */
export interface AgentRenderState {
  stage: 'agent';
  /** Pipeline output from previous phase */
  pipeline: RenderPipelineResult;
  /** What the render agent expects to find in the Figma file */
  renderExpectations: RenderExpectations;
  /** Report of what was actually found during render */
  renderReport: RenderReport;
}

/**
 * State after render audit phase completes.
 * Contains audit results validating render output against expectations.
 * @produced renderAuditPhase
 * @consumed visualProofPhase
 */
export interface AuditRenderState {
  stage: 'audit';
  /** Pipeline output from previous phase */
  pipeline: RenderPipelineResult;
  /** Render expectations from agent phase */
  renderExpectations: RenderExpectations;
  /** Render report from agent phase */
  renderReport: RenderReport;
  /** Audit result: pass/fail, reasons, counts */
  auditResult: RenderAuditPhaseResult;
}

/**
 * Final state after visual proof phase completes.
 * All phases have run successfully; contains complete render + audit + visual proof data.
 * @produced visualProofPhase
 * @consumed CLI output, documentation sync
 */
export interface CompleteRenderState {
  stage: 'complete';
  /** Pipeline output from previous phase */
  pipeline: RenderPipelineResult;
  /** Render expectations from agent phase */
  renderExpectations: RenderExpectations;
  /** Render report from agent phase */
  renderReport: RenderReport;
  /** Audit result from audit phase */
  auditResult: RenderAuditPhaseResult;
  /** Visual proof capture result: screenshots, metadata */
  visualProofResult: VisualProofCaptureResult;
}

export type RenderPipelineState =
  | InitialRenderPipelineState
  | PipelineRenderState
  | AgentRenderState
  | AuditRenderState
  | CompleteRenderState;

/**
 * Convenience type for phases that produce pipeline state.
 * Use this to avoid repeating RenderPhase<RenderPipelineState> throughout the codebase.
 */
export type RenderPipelinePhase = RenderPhase<RenderPipelineState>;

export type PipelinePhaseOutput = PipelineRenderState;
export type RenderAgentPhaseOutput = AgentRenderState;
export type RenderAuditPhaseOutput = AuditRenderState;
export type VisualProofPhaseOutput = CompleteRenderState;

export function hasPipelineState(
  state: RenderPipelineState,
): state is PipelineRenderState | AgentRenderState | AuditRenderState | CompleteRenderState {
  return state.stage !== 'initial';
}

export function hasAgentState(
  state: RenderPipelineState,
): state is AgentRenderState | AuditRenderState | CompleteRenderState {
  return state.stage === 'agent' || state.stage === 'audit' || state.stage === 'complete';
}

export function hasAuditState(
  state: RenderPipelineState,
): state is AuditRenderState | CompleteRenderState {
  return state.stage === 'audit' || state.stage === 'complete';
}
