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

export interface InitialRenderPipelineState {
  stage: 'initial';
}

export interface PipelineRenderState {
  stage: 'pipeline';
  pipeline: RenderPipelineResult;
}

export interface AgentRenderState {
  stage: 'agent';
  pipeline: RenderPipelineResult;
  renderExpectations: RenderExpectations;
  renderReport: RenderReport;
}

export interface AuditRenderState {
  stage: 'audit';
  pipeline: RenderPipelineResult;
  renderExpectations: RenderExpectations;
  renderReport: RenderReport;
  auditResult: RenderAuditPhaseResult;
}

export interface CompleteRenderState {
  stage: 'complete';
  pipeline: RenderPipelineResult;
  renderExpectations: RenderExpectations;
  renderReport: RenderReport;
  auditResult: RenderAuditPhaseResult;
  visualProofResult: VisualProofCaptureResult;
}

export type RenderPipelineState =
  | InitialRenderPipelineState
  | PipelineRenderState
  | AgentRenderState
  | AuditRenderState
  | CompleteRenderState;

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
