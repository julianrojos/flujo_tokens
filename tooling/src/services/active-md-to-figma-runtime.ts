/**
 * Active Markdown to Figma Runtime Builder
 *
 * Builds runtime context and phase instances for pipeline execution.
 * Encapsulates all wiring needed to prepare for phase execution.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { DEFAULT_THEME_PATH } from '../utils/system-context.js';
import { parseYamlDocument } from '../utils/parse-frontmatter.js';
import {
  createRenderArtifactManager,
} from './render-artifacts.js';
import {
  createRenderAgentPhase,
} from './render-agent-phase.js';
import {
  buildActiveMdToFigmaRuntimeContext,
  type ActiveMdToFigmaRuntimeContext,
  type PipelineScriptPaths,
  type SystemContextPaths,
} from '../utils/active-md-to-figma-context.js';
import {
  renderPipelinePhase,
} from './render-pipeline-phase.js';
import {
  renderAuditPhase,
} from './render-audit-phase.js';
import {
  visualProofPhase,
} from './visual-proof-phase.js';
import {
  renderCacheUpdatePhase,
} from './render-cache-update-phase.js';
import type { ActiveMdToFigmaPreparationResult } from './active-md-to-figma-preparation.js';
import type { RenderPhase } from './render-phase.js';
import { RuntimeError } from './pipeline-error.js';

/**
 * Read theme name from theme file.
 */
function readThemeName(themePath: string): string {
  if (!fs.existsSync(themePath)) {
    throw new RuntimeError(`Theme file not found: ${themePath}`, 'THEME_NOT_FOUND');
  }
  const parsed = parseYamlDocument(
    fs.readFileSync(themePath, 'utf8'),
    `theme YAML (${path.basename(themePath)})`,
  );
  const name = String((parsed as Record<string, unknown>)?.name || '').trim();
  if (!name) {
    throw new RuntimeError(
      `Missing required theme name in ${themePath}. Expected top-level "name".`,
      'MISSING_THEME_NAME',
    );
  }
  return name;
}

function resolveScriptPath(relativePath: string): string {
  const resolved = path.resolve(relativePath);
  if (!fs.existsSync(resolved)) {
    throw new RuntimeError(`Required script not found: ${resolved}`, 'MISSING_SCRIPT');
  }
  return resolved;
}

/**
 * Active Markdown to Figma Runtime
 *
 * Built runtime ready for phase execution.
 * Contains context and all phases for pipeline execution.
 */
export interface ActiveMdToFigmaRuntime {
  /** Runtime context for all phases */
  context: ActiveMdToFigmaRuntimeContext;
  
  /** All phases in execution order */
  phases: RenderPhase[];
}

/**
 * Build runtime from preflight result.
 *
 * This function:
 * - Reads theme and resolves theme name
 * - Creates artifact manager
 * - Resolves script paths
 * - Builds system paths
 * - Creates runtime context
 * - Creates all phase instances with proper wiring
 *
 * @param preflight - Result from preflight validation
 * @param themePathArg - Theme path from args (overrides default)
 * @returns Built runtime ready for phase execution
 */
export function buildActiveMdToFigmaRuntime(
  preflight: ActiveMdToFigmaPreparationResult,
  themePathArg?: string,
): ActiveMdToFigmaRuntime {
  const {
    markdownPath,
    specPath,
    tokenRegistryPath,
    syncStatePath,
    fileBase,
    componentName,
    componentSlug,
    resolvedComponentSetId,
    force,
    skipValidation,
    captureProofStrict,
    offsetX,
    figmaUrl,
    agent,
    generatedDir,
    ctx,
  } = preflight;

  // Resolve theme path and read theme name
  const themePath = themePathArg || DEFAULT_THEME_PATH;
  const expectedThemeName = readThemeName(themePath);

  // Ensure generated directory exists
  fs.mkdirSync(path.resolve(generatedDir), { recursive: true });

  // Create artifact manager (used by render agent phase)
  const artifactManager = createRenderArtifactManager(generatedDir, fileBase).manager;

  // Build script paths
  const scripts: PipelineScriptPaths = {
    markdownToModelScript: resolveScriptPath(
      '.agents/skills/document-design-system/ds-markdown-to-figma-section/scripts/markdown_to_doc_model.mjs',
    ),
    modelToExecuteScript: resolveScriptPath(
      '.agents/skills/document-design-system/ds-markdown-to-figma-section/scripts/build_figma_execute_code.mjs',
    ),
  };

  // Build system paths
  const systemPaths: SystemContextPaths = {
    docsDir: ctx.paths.docs,
    overviewPath: path.join(ctx.paths.docs, 'overview.md'),
    specsDir: ctx.paths.specs,
    proofsDir: path.join(ctx.paths.generated, 'visual-proofs'),
    renderDir: path.join(ctx.paths.generated, 'figma_doc_models'),
    registryPath: ctx.paths.registry,
  };

  // Build runtime context
  const context = buildActiveMdToFigmaRuntimeContext({
    specPath,
    markdownPath,
    tokenRegistryPath,
    generatedDir,
    fileBase,
    componentName,
    componentSlug,
    resolvedComponentSetId,
    expectedThemeName,
    offsetX,
    force,
    skipValidation,
    syncStatePath,
    figmaUrl,
    system: ctx.system,
    scripts,
    themePath,
    systemPaths,
    captureProofStrict,
  });

  // Create render agent phase with artifact manager
  const renderAgentPhase = createRenderAgentPhase({
    artifactManager,
    agent: agent ?? 'auto',
  });

  // Build phases array in execution order (5 phases, documentation sync is a helper)
  const phases: RenderPhase[] = [
    renderPipelinePhase,
    renderAgentPhase,
    renderAuditPhase,
    visualProofPhase,
    renderCacheUpdatePhase,
  ];

  return {
    context,
    phases,
  };
}
