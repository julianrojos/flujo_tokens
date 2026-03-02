/**
 * Render Pipeline Phase
 *
 * Handles pipeline orchestration for markdown to Figma rendering.
 * Provides a single entry point that manages caching, execution, and state tracking.
 */

import * as path from 'node:path';

import {
  computeFingerprint,
  shouldSkipTask,
  updateTaskState,
} from '../utils/cache-utils.js';
import { runOrThrow } from '../utils/exec.js';
import type { ActiveMdToFigmaRuntimeContext } from '../types/active-md-to-figma.js';

/**
 * Paths to generated artifacts (internal - not exported).
 */
interface RenderPipelinePaths {
  docModelPath: string;
  executePath: string;
  payloadPath: string;
}

/**
 * Result of render pipeline execution.
 * Exported for the runner to consume.
 */
export interface RenderPipelineResult {
  ok: boolean;
  /** Paths to generated artifacts (always available) */
  paths: RenderPipelinePaths;
  /** Whether the render step was skipped due to caching */
  skipped: boolean;
  /** Reason for skipping (if skipped) */
  skipReason?: string;
}

/**
 * Internal cache state for pipeline steps.
 */
interface PipelineCacheState {
  modelSync: { skip: boolean; reason: string };
  executeSync: { skip: boolean; reason: string };
  renderSync: { skip: boolean; reason: string };
}

/**
 * Script paths for pipeline execution.
 */
interface PipelineScripts {
  markdownToModelScript: string;
  modelToExecuteScript: string;
}

/**
 * Execute the full render pipeline.
 *
 * This is the main entry point. It handles:
 * - Building artifact paths
 * - Checking cache/fingerprints
 * - Executing model generation (markdown_to_doc_model)
 * - Executing script generation (build_figma_execute_code)
 * - Updating cache state
 *
 * The runner only needs to check the result and proceed with rendering.
 */
export function executeRenderPipeline(
  context: ActiveMdToFigmaRuntimeContext,
  scripts: PipelineScripts,
  themePath: string,
): RenderPipelineResult {
  // Build artifact paths
  const paths = buildPipelinePaths(context);

  // Check cache state
  const cacheState = checkPipelineCache(context, paths, scripts, themePath);

  // If render step is cached, skip entire pipeline
  if (cacheState.renderSync.skip) {
    return {
      ok: true,
      paths,
      skipped: true,
      skipReason: cacheState.renderSync.reason,
    };
  }

  // Execute model step if not cached
  if (!cacheState.modelSync.skip) {
    runModelStep(context, paths, scripts.markdownToModelScript);
    updateModelCacheState(context, paths, cacheState.modelSync);
  }

  // Execute script generation if not cached
  if (!cacheState.executeSync.skip) {
    runExecuteStep(context, paths, scripts, themePath);
    updateExecuteCacheState(context, paths, cacheState.executeSync);
  }

  return {
    ok: true,
    paths,
    skipped: false,
  };
}

/**
 * Update render step cache state after successful render.
 */
export function updateRenderCacheState(
  context: ActiveMdToFigmaRuntimeContext,
  paths: RenderPipelinePaths,
  renderMetadata: Record<string, unknown>,
): void {
  const renderTaskId = buildRenderTaskId(context);
  const renderFingerprint = computeRenderFingerprint(context, paths);

  updateTaskState({
    taskId: renderTaskId,
    fingerprint: renderFingerprint,
    outputs: [paths.executePath, paths.payloadPath],
    metadata: renderMetadata,
    statePath: context.syncStatePath,
  });
}

// ============================================================================
// Private Helpers - Not exported to runner
// ============================================================================

/**
 * Build pipeline paths from context.
 */
function buildPipelinePaths(context: ActiveMdToFigmaRuntimeContext): RenderPipelinePaths {
  const { generatedDir, fileBase } = context;

  return {
    docModelPath: path.join(generatedDir, `${fileBase}.doc-model.json`),
    executePath: path.join(generatedDir, `${fileBase}.figma-execute.js`),
    payloadPath: path.join(generatedDir, `${fileBase}.render-payload.json`),
  };
}

/**
 * Check cache state for all pipeline steps.
 */
function checkPipelineCache(
  context: ActiveMdToFigmaRuntimeContext,
  paths: RenderPipelinePaths,
  scripts: PipelineScripts,
  themePath: string,
): PipelineCacheState {
  const modelTaskId = buildModelTaskId(context);
  const executeTaskId = buildExecuteTaskId(context);
  const renderTaskId = buildRenderTaskId(context);

  const modelFingerprint = computeModelFingerprint(context, paths, scripts.markdownToModelScript);
  const executeFingerprint = computeExecuteFingerprint(context, paths, scripts.modelToExecuteScript, themePath);
  const renderFingerprint = computeRenderFingerprint(context, paths);

  return {
    modelSync: shouldSkipTask({
      taskId: modelTaskId,
      fingerprint: modelFingerprint,
      outputs: [paths.docModelPath],
      force: context.force,
      statePath: context.syncStatePath,
    }),
    executeSync: shouldSkipTask({
      taskId: executeTaskId,
      fingerprint: executeFingerprint,
      outputs: [paths.executePath, paths.payloadPath],
      force: context.force,
      statePath: context.syncStatePath,
    }),
    renderSync: shouldSkipTask({
      taskId: renderTaskId,
      fingerprint: renderFingerprint,
      outputs: [paths.executePath, paths.payloadPath],
      force: context.force,
      statePath: context.syncStatePath,
    }),
  };
}

/**
 * Execute model generation step (markdown_to_doc_model).
 */
function runModelStep(
  context: ActiveMdToFigmaRuntimeContext,
  paths: RenderPipelinePaths,
  scriptPath: string,
): void {
  runOrThrow('node', [
    scriptPath,
    '--markdown',
    context.markdownPath,
    '--component-name',
    context.componentName,
    '--out',
    paths.docModelPath,
  ]);
}

/**
 * Execute script generation step (build_figma_execute_code).
 */
function runExecuteStep(
  context: ActiveMdToFigmaRuntimeContext,
  paths: RenderPipelinePaths,
  scripts: PipelineScripts,
  themePath: string,
): void {
  const args: string[] = [
    scripts.modelToExecuteScript,
    '--model',
    paths.docModelPath,
    '--theme',
    themePath,
    '--component-name',
    context.componentName,
    '--offset-x',
    String(context.offsetX),
    '--out',
    paths.executePath,
    '--payload-out',
    paths.payloadPath,
  ];

  if (context.resolvedComponentSetId) {
    args.push('--component-set-id', context.resolvedComponentSetId);
  }
  args.push('--token-registry', context.tokenRegistryPath);

  runOrThrow('node', args);
}

/**
 * Update cache state after model step execution.
 */
function updateModelCacheState(
  context: ActiveMdToFigmaRuntimeContext,
  paths: RenderPipelinePaths,
  syncResult: { skip: boolean; reason: string },
): void {
  if (syncResult.skip) return;

  const modelTaskId = buildModelTaskId(context);
  const modelFingerprint = computeModelFingerprint(context, paths, '');

  updateTaskState({
    taskId: modelTaskId,
    fingerprint: modelFingerprint,
    outputs: [paths.docModelPath],
    metadata: {
      command: 'markdown_to_doc_model',
    },
    statePath: context.syncStatePath,
  });
}

/**
 * Update cache state after execute step execution.
 */
function updateExecuteCacheState(
  context: ActiveMdToFigmaRuntimeContext,
  paths: RenderPipelinePaths,
  syncResult: { skip: boolean; reason: string },
): void {
  if (syncResult.skip) return;

  const executeTaskId = buildExecuteTaskId(context);
  const executeFingerprint = computeExecuteFingerprint(context, paths, '', '');

  updateTaskState({
    taskId: executeTaskId,
    fingerprint: executeFingerprint,
    outputs: [paths.executePath, paths.payloadPath],
    metadata: {
      command: 'build_figma_execute_code',
    },
    statePath: context.syncStatePath,
  });
}

// ============================================================================
// Task ID Builders - Private
// ============================================================================

function buildModelTaskId(context: ActiveMdToFigmaRuntimeContext): string {
  return `ds-markdown-to-figma:model:${path.resolve(context.markdownPath)}`;
}

function buildExecuteTaskId(context: ActiveMdToFigmaRuntimeContext): string {
  return `ds-markdown-to-figma:execute:${path.resolve(context.markdownPath)}`;
}

function buildRenderTaskId(context: ActiveMdToFigmaRuntimeContext): string {
  return `ds-markdown-to-figma:render:${path.resolve(context.markdownPath)}`;
}

// ============================================================================
// Fingerprint Computations - Private
// ============================================================================

function computeModelFingerprint(
  context: ActiveMdToFigmaRuntimeContext,
  paths: RenderPipelinePaths,
  scriptPath: string,
): string {
  return computeFingerprint({
    files: [context.markdownPath, scriptPath].filter(Boolean),
    values: {
      componentName: context.componentName,
      docModelPath: path.resolve(paths.docModelPath),
    },
  });
}

function computeExecuteFingerprint(
  context: ActiveMdToFigmaRuntimeContext,
  paths: RenderPipelinePaths,
  modelToExecuteScript: string,
  themePath: string,
): string {
  return computeFingerprint({
    files: [
      paths.docModelPath,
      themePath,
      modelToExecuteScript,
      context.tokenRegistryPath,
    ].filter(Boolean),
    values: {
      componentName: context.componentName,
      componentSetId: context.resolvedComponentSetId,
      offsetX: String(context.offsetX),
      executePath: path.resolve(paths.executePath),
      payloadPath: path.resolve(paths.payloadPath),
    },
  });
}

function computeRenderFingerprint(
  context: ActiveMdToFigmaRuntimeContext,
  paths: RenderPipelinePaths,
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

// ============================================================================
// Phase Wrapper - For functional orchestrator
// ============================================================================

import type { PhaseResult } from './render-phase.js';
import type { PipelinePhaseOutput } from './render-pipeline-state.js';

/**
 * Phase wrapper for render pipeline.
 *
 * Adapts executeRenderPipeline to the PhaseResult contract.
 * Returns pipeline result in state output.
 *
 * Uses scripts and themePath from context (no external parameters needed).
 */
export async function renderPipelinePhase(
  context: ActiveMdToFigmaRuntimeContext,
): Promise<PhaseResult<PipelinePhaseOutput>> {
  const pipeline = executeRenderPipeline(
    context,
    context.scripts,
    context.themePath,
  );

  if (pipeline.skipped) {
    return {
      ok: true,
      skipped: true,
      skipBehavior: 'exit',
      reason: pipeline.skipReason,
      output: { pipeline },
    };
  }

  return {
    ok: true,
    output: { pipeline },
  };
}
