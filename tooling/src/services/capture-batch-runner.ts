/**
 * Capture Batch Runner
 *
 * Executes batch capture for multiple component targets.
 */

import type { CaptureTarget } from './capture-target-builder.js';
import type { RunScriptJsonFn } from '../types/capture-batch-runner.js';

/**
 * Options for building capture arguments.
 */
export interface BuildCaptureArgsOptions {
  target: CaptureTarget;
  figmaToken: string;
  format: string;
  scale: number;
  proofDir: string;
  proofImageDir: string;
  includeVariants: boolean;
  variantLimit: number;
  agent: string;
  mainCaptureMode: string;
}

/**
 * Options for running capture batch.
 */
export interface RunCaptureBatchOptions {
  targets: CaptureTarget[];
  repoRoot: string;
  captureScriptPath: string;
  runScriptJson: RunScriptJsonFn;
  continueOnError: boolean;
  figmaToken: string;
  format: string;
  scale: number;
  proofDir: string;
  proofImageDir: string;
  includeVariants: boolean;
  variantLimit: number;
  agent: string;
  mainCaptureMode: string;
}

/**
 * Result of capturing a single component.
 */
export interface CaptureResult {
  slug: string;
  node_id: string;
  screenshot_url: string | null;
  local_image_path: string | null;
  variants_count: number;
}

/**
 * Result of a failed capture.
 */
export interface CaptureFailure {
  slug: string;
  node_id: string;
  error: string;
}

/**
 * Build command-line arguments for capture script.
 */
export function buildCaptureArgs(options: BuildCaptureArgsOptions): string[] {
  const {
    target,
    figmaToken,
    format,
    scale,
    proofDir,
    proofImageDir,
    includeVariants,
    variantLimit,
    agent,
    mainCaptureMode,
  } = options;

  const captureArgs: string[] = [
    '--component-name',
    target.name,
    '--component-set-id',
    String(target.nodeId),
    '--url',
    String(target.nodeUrl ?? ''),
    '--figma-token',
    figmaToken,
    '--format',
    format,
    '--scale',
    String(scale),
    '--proof-dir',
    proofDir,
    '--proof-image-dir',
    proofImageDir,
    '--include-variants',
    includeVariants ? 'true' : 'false',
    '--variant-limit',
    String(variantLimit),
    '--agent',
    agent,
    '--main-capture-mode',
    mainCaptureMode,
    '--skip-db-persistence',
    'true',
  ];

  return captureArgs;
}

/**
 * Run capture for multiple targets.
 */
export function runCaptureBatch(options: RunCaptureBatchOptions): {
  captured: CaptureResult[];
  failed: CaptureFailure[];
} {
  const {
    targets,
    repoRoot,
    captureScriptPath,
    runScriptJson,
    continueOnError,
    figmaToken,
    format,
    scale,
    proofDir,
    proofImageDir,
    includeVariants,
    variantLimit,
    agent,
    mainCaptureMode,
  } = options;

  const captured: CaptureResult[] = [];
  const failed: CaptureFailure[] = [];

  for (const target of targets) {
    const captureArgs = buildCaptureArgs({
      target,
      figmaToken,
      format,
      scale,
      proofDir,
      proofImageDir,
      includeVariants,
      variantLimit,
      agent,
      mainCaptureMode,
    });

    try {
    const captureResult = runScriptJson({
        repoRoot,
        scriptPath: captureScriptPath,
        scriptArgs: captureArgs,
      });
      captured.push({
        slug: target.slug,
        node_id: target.nodeId,
        screenshot_url: captureResult.screenshotUrl || null,
        local_image_path: captureResult.localImagePath || null,
        variants_count: Number.isFinite(Number(captureResult.variantsCount)) ? Number(captureResult.variantsCount) : 0,
      });
    } catch (error) {
      failed.push({
        slug: target.slug,
        node_id: target.nodeId,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!continueOnError) {
        break;
      }
    }
  }

  return { captured, failed };
}
