/**
 * Render Cache Update Phase
 *
 * Updates cache state after successful render pipeline execution.
 * Records fingerprint and metadata for future cache hit detection.
 */

import * as path from 'node:path';

import { updateTaskState } from '../utils/cache-utils.js';
import { computeFingerprint } from '../utils/cache-utils.js';
import type { ActiveMdToFigmaRuntimeContext } from '../types/active-md-to-figma.js';
import type { RenderPipelineState } from './render-pipeline-state.js';
import type { PhaseResult } from './render-phase.js';

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
  state: RenderPipelineState,
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
 * Render cache update phase function.
 *
 * Updates cache state after successful render pipeline execution.
 * Requires pipeline, renderReport, and auditResult from previous phases.
 *
 * Skip behavior:
 * - If pipeline was skipped (cache hit), returns skipBehavior: 'continue'
 * - If pipeline executed but missing renderReport/auditResult, returns error
 */
export async function renderCacheUpdatePhase(
  context: ActiveMdToFigmaRuntimeContext,
  state: RenderPipelineState,
): Promise<PhaseResult> {
  // If pipeline was skipped, skip cache update too (nothing to cache)
  if (state.pipeline?.skipped) {
    return {
      ok: true,
      skipped: true,
      skipBehavior: 'continue',
      reason: 'Pipeline was skipped (cache hit), skipping cache update',
    };
  }

  // Require pipeline to have executed
  if (!state.pipeline) {
    return {
      ok: false,
      error: 'Render cache update phase requires pipeline to have executed first',
    };
  }

  // Require render report
  if (!state.renderReport) {
    return {
      ok: false,
      error: 'Render cache update phase requires renderReport from previous phase',
    };
  }

  // Require audit result
  if (!state.auditResult) {
    return {
      ok: false,
      error: 'Render cache update phase requires auditResult from previous phase',
    };
  }

  const { paths } = state.pipeline;
  const renderTaskId = `ds-markdown-to-figma:render:${path.resolve(context.markdownPath)}`;
  const renderFingerprint = computeRenderCacheFingerprint(context, paths);
  const metadata = buildRenderCacheMetadata(state);

  updateTaskState({
    taskId: renderTaskId,
    fingerprint: renderFingerprint,
    outputs: [paths.executePath, paths.payloadPath],
    metadata,
    statePath: context.syncStatePath,
  });

  return {
    ok: true,
  };
}
