/**
 * Capture Token Orchestrator
 *
 * Orchestrates token sync for the capture pipeline.
 */

import {
  bootstrapInputJsonFromFigmaVariables,
  getSystemConfig,
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
}

/**
 * Result of orchestrating token sync.
 */
export interface OrchestrateTokenSyncResult {
  tokenBootstrap: {
    attempted: boolean;
    created: boolean;
    reason: string;
    collections?: string[];
    tokens_written?: number;
    tokens_total?: number;
    error?: string;
  };
}

/**
 * Orchestrate token sync.
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
    tokensSource = 'mcp',
    getSystemConfigFn = getSystemConfig,
    bootstrapInputJsonFromFigmaVariablesFn = bootstrapInputJsonFromFigmaVariables,
  } = options;

  let tokenBootstrap: OrchestrateTokenSyncResult['tokenBootstrap'] = {
    attempted: false,
    created: false,
    reason: dryRun ? 'skipped-dry-run' : 'not-run',
  };

  if (!dryRun) {
    const systemConfig = await getSystemConfigFn({ repoRoot: projectRoot, systemId });
    tokenBootstrap = await bootstrapInputJsonFromFigmaVariablesFn({
      repoRoot: projectRoot,
      system: systemConfig,
      fileKey,
      figmaToken,
      figmaFileUrl: figmaUrl,
      tokensSource,
    });
  }

  return { tokenBootstrap };
}
