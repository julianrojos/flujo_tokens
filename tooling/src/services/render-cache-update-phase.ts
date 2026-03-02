/**
 * Render Cache Update Phase
 *
 * Updates cache state after successful render pipeline execution.
 * Records fingerprint and metadata for future cache hit detection.
 *
 * This phase is a thin orchestrator that:
 * 1. Validates required state from previous phases
 * 2. Computes fingerprint and metadata via helpers
 * 3. Persists cache state via updateTaskState
 */

import * as path from 'node:path';

import { updateTaskState } from '../utils/cache-utils.js';
import { computeFingerprint } from '../utils/cache-utils.js';
import type { ActiveMdToFigmaRuntimeContext } from '../types/active-md-to-figma.js';
import { hasAuditState, hasPipelineState, type RenderPipelineState } from './render-pipeline-state.js';
import type { PhaseResult, RenderPhase } from './render-phase.js';
import type { UpdateTaskOptions } from '../types/cache-utils.js';

/**
 * Metadata for render cache state.
 */
interface RenderCacheMetadata {
  command: string;
  targetSectionId: string | null;
  targetSectionName: string | null;
  themeName: string | null;
  unsupportedBlocksCount: number;
  structureAudit?: {
    hasDocCanvas: boolean | null;
    cardCount: number | null;
    tableContainerCount: number | null;
    headerRowCount: number | null;
    bodyRowCount: number | null;
  };
}

/**
 * Assert that required state is present for cache update.
 * Returns error message if validation fails, null otherwise.
 */
function assertRenderCacheInputs(
  state: RenderPipelineState,
): string | null {
  if (!hasPipelineState(state)) {
    return 'Render cache update phase requires pipeline to have executed first';
  }
  if (!hasAuditState(state)) {
    return 'Render cache update phase requires renderReport from previous phase';
  }
  return null;
}

/**
 * Compute render fingerprint for cache state.
 */
function computeRenderCacheFingerprint(
  context: ActiveMdToFigmaRuntimeContext,
  paths: { executePath: string; payloadPath: string },
): string {
  return computeFingerprint({
    files: [paths.executePath, paths.payloadPath],
    values: {
      componentName: context.componentName,
      componentSetId: context.resolvedComponentSetId,
      figmaUrl: context.figmaUrl,
      offsetX: String(context.offsetX),
    },
  });
}

/**
 * Build render cache metadata from state.
 */
function buildRenderCacheMetadata(
  state: Extract<RenderPipelineState, { stage: 'audit' | 'complete' }>,
): RenderCacheMetadata {
  const { renderReport, auditResult } = state;

  return {
    command: 'figma_execute_render',
    targetSectionId: renderReport?.targetSectionId ?? null,
    targetSectionName: renderReport?.targetSectionName ?? null,
    themeName: renderReport?.themeName ?? null,
    unsupportedBlocksCount: renderReport?.unsupportedBlocksCount ?? 0,
    structureAudit: auditResult ? {
      hasDocCanvas: auditResult.auditReport.hasDocCanvas,
      cardCount: auditResult.auditReport.cardCount,
      tableContainerCount: auditResult.auditReport.tableContainerCount,
      headerRowCount: auditResult.auditReport.headerRowCount,
      bodyRowCount: auditResult.auditReport.bodyRowCount,
    } : undefined,
  };
}

/**
 * Build task update options for render cache.
 */
function buildRenderCacheTaskUpdate(
  context: ActiveMdToFigmaRuntimeContext,
  state: Extract<RenderPipelineState, { stage: 'audit' | 'complete' }>,
): UpdateTaskOptions {
  const { paths } = state.pipeline!;
  const renderTaskId = `ds-markdown-to-figma:render:${path.resolve(context.markdownPath)}`;
  const renderFingerprint = computeRenderCacheFingerprint(context, paths);
  const metadata = buildRenderCacheMetadata(state);

  return {
    taskId: renderTaskId,
    fingerprint: renderFingerprint,
    outputs: [paths.executePath, paths.payloadPath],
    metadata,
    statePath: context.syncStatePath,
  };
}

/**
 * Render cache update phase function.
 *
 * Updates cache state after successful render pipeline execution.
 * Requires pipeline, renderReport, and auditResult from previous phases.
 *
 * Skip behavior:
 * - If pipeline was skipped (cache hit), returns skipBehavior: 'continue'
 * - If pipeline executed but missing renderReport/auditResult, returns error
 */
export const renderCacheUpdatePhase: RenderPhase = {
  name: 'render-cache-update-phase',
  async execute(
    context: ActiveMdToFigmaRuntimeContext,
    state: RenderPipelineState,
  ): Promise<PhaseResult> {
  // If pipeline was skipped, skip cache update too (nothing to cache)
  if (hasPipelineState(state) && state.pipeline.skipped) {
    return {
      ok: true,
      skipped: true,
      skipBehavior: 'continue',
      reason: 'Pipeline was skipped (cache hit), skipping cache update',
    };
  }

  // Validate required inputs
  const validationError = assertRenderCacheInputs(state);
  if (validationError) {
    return {
      ok: false,
      error: validationError,
    };
  }

  // Build and execute task update
  const taskUpdate = buildRenderCacheTaskUpdate(context, state);
  updateTaskState(taskUpdate);

  return {
    ok: true,
  };
  },
};
