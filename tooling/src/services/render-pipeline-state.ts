/**
 * Render Pipeline State
 *
 * Shared state types for render pipeline phases.
 * Defines the accumulated state as phases execute.
 *
 * ## State Discipline
 *
 * Each field is produced by a specific phase and consumed by subsequent phases.
 * This prevents the state from becoming an arbitrary bag of data.
 *
 * ### Field Producers and Consumers
 *
 * | Field | Produced By | Consumed By |
 * |-------|-------------|-------------|
 * | pipeline | renderPipelinePhase | renderAgentPhase, renderCacheUpdatePhase, output handler |
 * | renderExpectations | renderAgentPhase | renderAuditPhase |
 * | renderReport | renderAgentPhase | renderAuditPhase, renderCacheUpdatePhase |
 * | auditResult | renderAuditPhase | renderCacheUpdatePhase |
 * | visualProofResult | visualProofPhase | (end of pipeline) |
 *
 * ### Execution Order
 *
 * 1. renderPipelinePhase → produces `pipeline`
 * 2. renderAgentPhase → produces `renderExpectations`, `renderReport` (requires `pipeline`)
 * 3. renderAuditPhase → produces `auditResult` (requires `renderReport`, `renderExpectations`)
 * 4. visualProofPhase → produces `visualProofResult` (no state dependencies)
 * 5. renderCacheUpdatePhase → no output (requires `pipeline`, `renderReport`, `auditResult`)
 *
 * Note: documentation sync is a helper, not a phase, and runs after the pipeline.
 */

import type { RenderPipelineResult } from './render-pipeline-phase.js';
import type { RenderExpectations, RenderReport } from './render-report-parser.js';
import type { RenderAuditPhaseResult } from './render-audit-phase.js';
import type { VisualProofCaptureResult } from './visual-proof-phase.js';

/**
 * Accumulated state across render pipeline phases.
 * Each phase may contribute to this state.
 */
export interface RenderPipelineState {
  /** Result from pipeline execution (model + script generation) */
  pipeline?: RenderPipelineResult;
  
  /** Expectations extracted from render payload */
  renderExpectations?: RenderExpectations;
  
  /** Report from render agent execution */
  renderReport?: RenderReport;
  
  /** Result from render audit phase */
  auditResult?: RenderAuditPhaseResult;
  
  /** Result from visual proof capture */
  visualProofResult?: VisualProofCaptureResult;
}

/**
 * Phase output types for type-safe state updates.
 */
export type PipelinePhaseOutput = Pick<RenderPipelineState, 'pipeline'>;
export type RenderAgentPhaseOutput = Pick<RenderPipelineState, 'renderExpectations' | 'renderReport'>;
export type RenderAuditPhaseOutput = Pick<RenderPipelineState, 'auditResult'>;
export type VisualProofPhaseOutput = Pick<RenderPipelineState, 'visualProofResult'>;
