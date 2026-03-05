/**
 * Capture Batch Execution
 *
 * Executes capture operations in batch mode across multiple targets.
 * Handles error tolerance, result aggregation, and registry refresh.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import type { CaptureTarget } from '../types/capture-targets.js';
import { syncDocumentationIndices } from './component-registry-index.js';

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
  /** Proof file path. */
  proof_file_path: string | null;
  /** Screenshot URL. */
  screenshot_url: string | null;
  /** Local image path. */
  local_image_path: string | null;
  /** Number of variants captured. */
  variants_count: number;
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

/**
 * Build capture script arguments for a target.
 *
 * @param params - Capture parameters.
 * @returns Array of script arguments.
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
    '--skip-index-sync',
    'true',
  ];

  if (target.specExists) {
    captureArgs.push('--spec-file', target.specPath);
  }

  return captureArgs;
}

/**
 * Execute capture batch across multiple targets.
 *
 * @param options - Batch execution options.
 * @returns Batch result with captured and failed components.
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
        proof_file_path: (captureResult.proofFilePath as string) || null,
        screenshot_url: (captureResult.screenshotUrl as string) || null,
        local_image_path: (captureResult.localImagePath as string) || null,
        variants_count: Number(captureResult.variantsCount || 0),
      });
    } catch (error) {
      failed.push({
        slug: target.slug,
        node_id: target.nodeId,
        markdown_path: path.relative(repoRoot, target.markdownPath),
        error: error instanceof Error ? error.message : String(error),
      });

      if (!continueOnError) {
        break;
      }
    }
  }

  return { captured, failed };
}

/**
 * Registry refresh result.
 */
export interface RegistryRefreshResult {
  /** Whether refresh succeeded. */
  ok: boolean;
  /** Refresh output/data. */
  data?: unknown;
}

/**
 * Convert unknown errors to message strings.
 */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Count markdown component docs excluding overview.
 */
function countComponentDocs(docsDir: string): number {
  if (!fs.existsSync(docsDir)) return 0;
  return fs
    .readdirSync(docsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => entry.name.toLowerCase())
    .filter((name) => name !== 'overview.md')
    .length;
}

/**
 * Read component count from the registry artifact.
 */
function readRegistryComponentCount(registryPath: string): number {
  if (!fs.existsSync(registryPath)) return 0;
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as {
      components?: unknown[];
    };
    return Array.isArray(parsed.components) ? parsed.components.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Type guard to check if a value is a valid refresh result.
 *
 * @param obj - Value to check.
 * @returns True if the value has a valid `ok` boolean property.
 */
function isRefreshResult(obj: unknown): obj is { ok: boolean } {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'ok' in obj &&
    typeof (obj as { ok: unknown }).ok === 'boolean'
  );
}

/**
 * Execute capture batch and refresh registry indices.
 *
 * @param params - Batch execution and refresh parameters.
 * @returns Updated report with captured/failed counts and refresh status.
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
}): Record<string, unknown> {
  const {
    report,
    targets,
    projectRoot,
    systemId,
    docsRootDir,
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
  } = params;

  const captureScriptPath = path.join(
    projectRoot,
    'tooling',
    'scripts',
    'ds-capture-visual-proof.mjs',
  );

  const registryRefreshScriptPath = path.join(
    projectRoot,
    'tooling',
    'scripts',
    'ds-registry-refresh.mjs',
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

  if (refreshIndices) {
    const resolvedDocsRootDir = docsRootDir
      ? path.resolve(docsRootDir)
      : path.dirname(path.dirname(proofDir));
    const docsDir = path.join(resolvedDocsRootDir, 'components');
    const specsDir = path.join(resolvedDocsRootDir, '_spec', 'components');
    const generatedDir = path.join(resolvedDocsRootDir, '_generated');
    const registryPath = path.join(generatedDir, 'component-registry.json');
    const overviewPath = path.join(docsDir, 'overview.md');
    const renderDir = path.join(generatedDir, 'figma_doc_models');
    const proofsDir = proofDir;

    const refreshArgs = ['--system', systemId];
    let refreshResult: unknown = null;
    let refreshError: unknown = null;
    try {
      refreshResult = runNodeScriptJson({
        repoRoot: projectRoot,
        scriptPath: registryRefreshScriptPath,
        scriptArgs: refreshArgs,
        runJsonCommandFn,
      });
    } catch (error) {
      refreshError = error;
    }

    const primaryRefreshOk = isRefreshResult(refreshResult) && refreshResult.ok;
    const docsCount = countComponentDocs(docsDir);
    const registryComponentCount = readRegistryComponentCount(registryPath);
    const hasDocsButRegistryEmpty = docsCount > 0 && registryComponentCount === 0;

    if (primaryRefreshOk && !hasDocsButRegistryEmpty) {
      report.indices_refreshed = true;
      report.registry_refresh = refreshResult;
    } else {
      try {
        const fallbackResult = syncDocumentationIndices({
          registryPath,
          overviewPath,
          specsDir,
          docsDir,
          proofsDir,
          renderDir,
          dryRun: false,
        });
        report.indices_refreshed = fallbackResult.ok;
        report.registry_refresh = {
          ok: fallbackResult.ok,
          strategy: 'direct-sync-fallback',
          fallback_reason: hasDocsButRegistryEmpty
            ? 'docs-present-registry-empty'
            : 'primary-refresh-failed',
          primary_result: refreshResult,
          primary_error: refreshError ? toErrorMessage(refreshError) : null,
          data: fallbackResult,
        };
      } catch (fallbackError) {
        report.indices_refreshed = false;
        report.registry_refresh = {
          ok: false,
          strategy: 'direct-sync-fallback',
          fallback_reason: hasDocsButRegistryEmpty
            ? 'docs-present-registry-empty'
            : 'primary-refresh-failed',
          primary_result: refreshResult,
          primary_error: refreshError ? toErrorMessage(refreshError) : null,
          fallback_error: toErrorMessage(fallbackError),
        };
      }
    }
  }

  report.ok =
    (report.captured as CapturedComponent[]).length > 0 &&
    (report.failed as FailedCapture[]).length === 0;

  return report;
}

/**
 * Run a Node.js script with JSON output.
 *
 * @param params - Script execution parameters.
 * @returns Parsed JSON result.
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
