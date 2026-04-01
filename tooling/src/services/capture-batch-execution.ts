/**
 * Capture Batch Execution
 *
 * Executes capture operations in batch mode across multiple targets.
 * Handles error tolerance, result aggregation, and DB persistence.
 */

import * as path from 'node:path';
import type { CaptureTarget } from '../types/capture-targets.js';
import { persistCaptureReportToDb } from './capture-db-persistence.js';

/**
 * Captured component result.
 */
export interface CapturedComponent {
  /** Component slug. */
  slug: string;
  /** Figma node ID. */
  node_id: string;
  /** Markdown file path (relative). */
  markdown_path: string;
  /** Screenshot URL. */
  screenshot_url: string | null;
  /** Local image path. */
  local_image_path: string | null;
  /** Number of variants captured. */
  variants_count: number;
  /** Capture timestamp (ISO 8601). */
  captured_at: string | null;
  /** Main image SHA256 hash. */
  image_sha256: string | null;
  /** Main image bytes. */
  image_bytes: number | null;
  /** Main image content type. */
  image_content_type: string | null;
  /** Main image width in px. */
  image_width: number | null;
  /** Main image height in px. */
  image_height: number | null;
  /** Variant captures metadata. */
  variants: Array<Record<string, unknown>>;
}

/**
 * Failed capture result.
 */
export interface FailedCapture {
  /** Component slug. */
  slug: string;
  /** Figma node ID. */
  node_id: string;
  /** Markdown file path (relative). */
  markdown_path: string;
  /** Error message. */
  error: string;
}

/**
 * Batch execution options.
 */
export interface CaptureBatchOptions {
  /** Targets to capture. */
  targets: CaptureTarget[];
  /** Repository root directory. */
  repoRoot: string;
  /** Path to capture script. */
  captureScriptPath: string;
  /** Function to run script with JSON output. */
  runScriptJson: (params: {
    repoRoot: string;
    scriptPath: string;
    scriptArgs: string[];
  }) => unknown;
  /** Whether to continue on error. */
  continueOnError: boolean;
  /** Figma API token. */
  figmaToken: string;
  /** Export format (png, jpg, svg, pdf). */
  format: string;
  /** Export scale. */
  scale: number;
  /** Proof output directory. */
  proofDir: string;
  /** Proof image output directory. */
  proofImageDir: string;
  /** Whether to include variants. */
  includeVariants: boolean;
  /** Maximum variants per component. */
  variantLimit: number;
  /** Agent backend (codex, claude, gemini, auto). */
  agent: string;
  /** Main capture mode (auto, agent, rest). */
  mainCaptureMode: string;
}

/**
 * Batch execution result.
 */
export interface CaptureBatchResult {
  /** Successfully captured components. */
  captured: CapturedComponent[];
  /** Failed captures. */
  failed: FailedCapture[];
}

function emitCaptureProgress(snapshot: {
  completed: number;
  total: number;
  remaining: number;
  slug?: string;
  state: 'starting' | 'captured' | 'failed' | 'completed';
}): void {
  try {
    process.stderr.write(`[capture-progress] ${JSON.stringify(snapshot)}\n`);
  } catch {
    // best-effort progress event
  }
}

/**
 * Build capture script arguments for a target.
 */
export function buildCaptureArgs(params: {
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
}): string[] {
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
  } = params;

  const captureArgs: string[] = [
    '--markdown',
    target.markdownPath,
    '--component-set-id',
    target.nodeId,
    '--url',
    target.nodeUrl,
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

  if (target.specExists) {
    captureArgs.push('--spec-file', target.specPath);
  }

  return captureArgs;
}

/**
 * Execute capture batch across multiple targets.
 */
export function runCaptureBatch(options: CaptureBatchOptions): CaptureBatchResult {
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

  const captured: CapturedComponent[] = [];
  const failed: FailedCapture[] = [];
  const total = targets.length;

  emitCaptureProgress({
    completed: 0,
    total,
    remaining: total,
    state: 'starting',
  });

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
      }) as Record<string, unknown>;

      captured.push({
        slug: target.slug,
        node_id: target.nodeId,
        markdown_path: path.relative(repoRoot, target.markdownPath),
        screenshot_url: (captureResult.screenshotUrl as string) || null,
        local_image_path: (captureResult.localImagePath as string) || null,
        variants_count: Number(captureResult.variantsCount || 0),
        captured_at: (captureResult.capturedAt as string) || null,
        image_sha256: (captureResult.imageSha256 as string) || null,
        image_bytes: Number.isFinite(Number(captureResult.imageBytes))
          ? Number(captureResult.imageBytes)
          : null,
        image_content_type: (captureResult.imageContentType as string) || null,
        image_width: Number.isFinite(Number(captureResult.imageWidth))
          ? Number(captureResult.imageWidth)
          : null,
        image_height: Number.isFinite(Number(captureResult.imageHeight))
          ? Number(captureResult.imageHeight)
          : null,
        variants: Array.isArray(captureResult.variants)
          ? (captureResult.variants as Array<Record<string, unknown>>)
          : [],
      });

      const completed = captured.length + failed.length;
      emitCaptureProgress({
        completed,
        total,
        remaining: Math.max(0, total - completed),
        slug: target.slug,
        state: 'captured',
      });
    } catch (error) {
      failed.push({
        slug: target.slug,
        node_id: target.nodeId,
        markdown_path: path.relative(repoRoot, target.markdownPath),
        error: error instanceof Error ? error.message : String(error),
      });

      const completed = captured.length + failed.length;
      emitCaptureProgress({
        completed,
        total,
        remaining: Math.max(0, total - completed),
        slug: target.slug,
        state: 'failed',
      });

      if (!continueOnError) {
        break;
      }
    }
  }

  const completed = captured.length + failed.length;
  emitCaptureProgress({
    completed,
    total,
    remaining: Math.max(0, total - completed),
    state: 'completed',
  });

  return { captured, failed };
}

/**
 * Convert unknown errors to message strings.
 */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Execute capture batch and persist component proofs in DB.
 */
export function executeCaptureBatchAndRefresh(params: {
  report: Record<string, unknown>;
  targets: CaptureTarget[];
  projectRoot: string;
  systemId: string;
  docsRootDir?: string;
  runCaptureBatchFn?: typeof runCaptureBatch;
  runJsonCommandFn: (
    command: string,
    args: string[],
    options?: { cwd?: string; displayArgs?: string[] },
  ) => { data?: unknown; ok?: boolean };
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
  refreshIndices: boolean;
  skipDbPersistence?: boolean;
}): Record<string, unknown> {
  const {
    report,
    targets,
    projectRoot,
    systemId,
    runCaptureBatchFn = runCaptureBatch,
    runJsonCommandFn,
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
    refreshIndices,
    skipDbPersistence = false,
  } = params;

  const captureScriptPath = path.join(
    projectRoot,
    'tooling',
    'scripts',
    'ds-capture-visual-proof.mjs',
  );
  const tokenUsageIndexScriptPath = path.join(
    projectRoot,
    'tooling',
    'scripts',
    'ds-token-usage-index.mjs',
  );
  const tokenGraphScriptPath = path.join(
    projectRoot,
    'tooling',
    'scripts',
    'ds-token-graph.mjs',
  );

  const captureBatch = runCaptureBatchFn({
    targets,
    repoRoot: projectRoot,
    captureScriptPath,
    runScriptJson: (scriptParams) =>
      runNodeScriptJson({
        ...scriptParams,
        repoRoot: projectRoot,
        runJsonCommandFn,
      }),
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
  });

  report.captured = captureBatch.captured;
  report.failed = captureBatch.failed;

  if (!skipDbPersistence) {
    try {
      const persistence = persistCaptureReportToDb({
        projectRoot,
        systemId,
        payload: report,
      });
      report.db_persistence = {
        ok: true,
        ...persistence,
      };
    } catch (error) {
      report.db_persistence = {
        ok: false,
        error: toErrorMessage(error),
      };
      report.failed = [
        ...(report.failed as FailedCapture[]),
        {
          slug: 'db-sync',
          node_id: '',
          markdown_path: '',
          error: `Failed to persist capture results to DB: ${toErrorMessage(error)}`,
        },
      ];
      report.ok = false;
      return report;
    }
  } else {
    report.db_persistence = {
      ok: false,
      skipped: true,
    };
  }

  if (refreshIndices) {
    try {
      const tokenUsageResult = runNodeScriptJson({
        repoRoot: projectRoot,
        scriptPath: tokenUsageIndexScriptPath,
        scriptArgs: ['--system', systemId],
        runJsonCommandFn,
      });
      report.token_usage_refresh = tokenUsageResult;
    } catch (tokenUsageError) {
      report.token_usage_refresh = {
        ok: false,
        error: toErrorMessage(tokenUsageError),
      };
    }

    try {
      const tokenGraphResult = runNodeScriptJson({
        repoRoot: projectRoot,
        scriptPath: tokenGraphScriptPath,
        scriptArgs: ['--system', systemId],
        runJsonCommandFn,
      });
      report.token_graph_refresh = tokenGraphResult;
    } catch (tokenGraphError) {
      report.token_graph_refresh = {
        ok: false,
        error: toErrorMessage(tokenGraphError),
      };
    }
  }

  report.ok =
    (report.captured as CapturedComponent[]).length > 0 &&
    (report.failed as FailedCapture[]).length === 0 &&
    (skipDbPersistence ||
      Boolean((report.db_persistence as { ok?: boolean } | undefined)?.ok));

  return report;
}

/**
 * Run a Node.js script with JSON output.
 */
function runNodeScriptJson(params: {
  repoRoot: string;
  scriptPath: string;
  scriptArgs: string[];
  runJsonCommandFn: (
    command: string,
    args: string[],
    options?: { cwd?: string; displayArgs?: string[] },
  ) => { data?: unknown };
}): unknown {
  const { repoRoot, scriptPath, scriptArgs, runJsonCommandFn } = params;

  const scriptArgsList = Array.isArray(scriptArgs) ? [...scriptArgs] : [];
  const displayArgs = [...scriptArgsList];

  // Redact token in display args for security
  const tokenArgIndex = displayArgs.indexOf('--figma-token');
  if (tokenArgIndex >= 0 && tokenArgIndex + 1 < displayArgs.length) {
    displayArgs[tokenArgIndex + 1] = '***redacted***';
  }

  const result = runJsonCommandFn(process.execPath, [scriptPath, ...scriptArgsList], {
    cwd: repoRoot,
    displayArgs: [path.relative(repoRoot, scriptPath), ...displayArgs],
  });

  return result.data;
}
