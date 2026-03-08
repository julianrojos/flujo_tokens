/**
 * Capture Token Orchestrator
 *
 * Orchestrates token sync and compilation for capture pipeline.
 */

import {
  bootstrapInputJsonFromFigmaVariables,
  ensureCollectionsConfigured,
  getSystemConfig,
  runTokensCompileIfNeeded,
} from './capture-system-bootstrap.js';
import type { FigmaVariableSource } from './figma-token-sync.js';

/**
 * Options for orchestrating token sync.
 */
export interface OrchestrateTokenSyncOptions {
  dryRun: boolean;
  projectRoot: string;
  systemId?: string;
  fileKey: string;
  figmaToken: string;
  figmaUrl?: string;
  tokensSource?: FigmaVariableSource;
  getSystemConfigFn?: typeof getSystemConfig;
  bootstrapInputJsonFromFigmaVariablesFn?: typeof bootstrapInputJsonFromFigmaVariables;
  ensureCollectionsConfiguredFn?: typeof ensureCollectionsConfigured;
  runTokensCompileIfNeededFn?: typeof runTokensCompileIfNeeded;
}

/**
 * Result of orchestrating token sync.
 */
export interface OrchestrateTokenSyncResult {
  tokenBootstrap: {
    attempted: boolean;
    created: boolean;
    reason: string;
    files_written?: number;
    tokens_written?: number;
    tokens_total?: number;
    files?: string[];
    error?: string;
  };
  tokenCompile: {
    attempted: boolean;
    compiled: boolean;
    reason: string;
    stderr?: string;
    output?: string;
  };
}

/**
 * Orchestrate token sync and compilation.
 */
export async function orchestrateTokenSync(
  options: OrchestrateTokenSyncOptions,
): Promise<OrchestrateTokenSyncResult> {
  const {
    dryRun,
    projectRoot,
    systemId,
    fileKey,
    figmaToken,
    figmaUrl,
    tokensSource = 'auto',
    getSystemConfigFn = getSystemConfig,
    bootstrapInputJsonFromFigmaVariablesFn = bootstrapInputJsonFromFigmaVariables,
    ensureCollectionsConfiguredFn = ensureCollectionsConfigured,
    runTokensCompileIfNeededFn = runTokensCompileIfNeeded,
  } = options;

  let tokenBootstrap: OrchestrateTokenSyncResult['tokenBootstrap'] = {
    attempted: false,
    created: false,
    reason: dryRun ? 'skipped-dry-run' : 'not-run',
  };
  let tokenCompile: OrchestrateTokenSyncResult['tokenCompile'] = {
    attempted: false,
    compiled: false,
    reason: dryRun ? 'skipped-dry-run' : 'not-run',
  };

  if (!dryRun) {
    let systemConfig = getSystemConfigFn({ repoRoot: projectRoot, systemId });
    
    tokenBootstrap = await bootstrapInputJsonFromFigmaVariablesFn({
      repoRoot: projectRoot,
      system: systemConfig,
      fileKey,
      figmaToken,
      figmaFileUrl: figmaUrl,
      tokensSource,
    });
    
    ensureCollectionsConfiguredFn({ repoRoot: projectRoot, systemId });
    
    systemConfig = getSystemConfigFn({ repoRoot: projectRoot, systemId });
    
    tokenCompile = runTokensCompileIfNeededFn({
      repoRoot: projectRoot,
      system: systemConfig,
    });
  }

  return { tokenBootstrap, tokenCompile };
}
