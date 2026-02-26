/**
 * Capture Token Orchestrator
 *
 * Orchestrates token bootstrap and compilation during capture workflows.
 * Coordinates between Figma variables and design system token configuration.
 *
 * Note: This is a simplified version that assumes token sync functions
 * will be provided via dependency injection.
 */

import type { ScriptSystemContext } from '../utils/system-context.js';

/**
 * Token bootstrap result.
 */
export interface TokenBootstrapResult {
  /** Whether the bootstrap was attempted. */
  attempted: boolean;
  /** Whether tokens were created. */
  created: boolean;
  /** Reason for the result state. */
  reason: string;
  /** Number of files written (if applicable). */
  files_written?: number;
  /** Number of tokens written (if applicable). */
  tokens_written?: number;
  /** Error message (if failed). */
  error?: string;
}

/**
 * Token compile result.
 */
export interface TokenCompileResult {
  /** Whether compilation was attempted. */
  attempted: boolean;
  /** Whether compilation succeeded. */
  compiled: boolean;
  /** Reason for the result state. */
  reason: string;
  /** Stderr output (if applicable). */
  stderr?: string;
  /** Output data (if applicable). */
  output?: unknown;
}

/**
 * Token sync orchestration options.
 */
export interface TokenSyncOptions {
  /** Whether to run in dry-run mode. */
  dryRun: boolean;
  /** Project root directory. */
  projectRoot: string;
  /** Design system ID. */
  systemId: string;
  /** Figma file key. */
  fileKey: string;
  /** Figma API token. */
  figmaToken: string;
  /** Optional: Bootstrap function (injected). */
  bootstrapInputJsonFromFigmaVariablesFn?: (params: {
    repoRoot: string;
    system: ScriptSystemContext | null;
    fileKey: string;
    figmaToken: string;
  }) => Promise<TokenBootstrapResult>;
  /** Optional: Ensure collections configured function (injected). */
  ensureCollectionsConfiguredFn?: (params: {
    repoRoot: string;
    systemId: string;
  }) => void;
  /** Optional: Get system config function (injected). */
  getSystemConfigFn?: (params: {
    repoRoot: string;
    systemId: string;
  }) => ScriptSystemContext | null;
  /** Optional: Run tokens compile function (injected). */
  runTokensCompileIfNeededFn?: (params: {
    repoRoot: string;
    system: ScriptSystemContext | null;
  }) => TokenCompileResult;
}

/**
 * Token sync orchestration result.
 */
export interface TokenSyncResult {
  /** Token bootstrap result. */
  tokenBootstrap: TokenBootstrapResult;
  /** Token compile result. */
  tokenCompile: TokenCompileResult;
}

/**
 * Orchestrate token synchronization during capture workflow.
 *
 * @param options - Token sync options.
 * @returns Token sync result with bootstrap and compile status.
 */
export async function orchestrateTokenSync(
  options: TokenSyncOptions,
): Promise<TokenSyncResult> {
  const {
    dryRun,
    projectRoot,
    systemId,
    fileKey,
    figmaToken,
    getSystemConfigFn,
    bootstrapInputJsonFromFigmaVariablesFn,
    ensureCollectionsConfiguredFn,
    runTokensCompileIfNeededFn,
  } = options;

  let tokenBootstrap: TokenBootstrapResult = {
    attempted: false,
    created: false,
    reason: dryRun ? 'skipped-dry-run' : 'not-run',
  };

  let tokenCompile: TokenCompileResult = {
    attempted: false,
    compiled: false,
    reason: dryRun ? 'skipped-dry-run' : 'not-run',
  };

  if (!dryRun && bootstrapInputJsonFromFigmaVariablesFn && getSystemConfigFn) {
    let systemConfig = getSystemConfigFn({ repoRoot: projectRoot, systemId });

    tokenBootstrap = await bootstrapInputJsonFromFigmaVariablesFn({
      repoRoot: projectRoot,
      system: systemConfig,
      fileKey,
      figmaToken,
    });

    if (ensureCollectionsConfiguredFn) {
      ensureCollectionsConfiguredFn({ repoRoot: projectRoot, systemId });
    }

    systemConfig = getSystemConfigFn({ repoRoot: projectRoot, systemId });

    if (runTokensCompileIfNeededFn) {
      tokenCompile = runTokensCompileIfNeededFn({
        repoRoot: projectRoot,
        system: systemConfig,
      });
    }
  }

  return { tokenBootstrap, tokenCompile };
}
