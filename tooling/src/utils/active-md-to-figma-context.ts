/**
 * Active Markdown to Figma Context Builder
 *
 * Builder function for creating ActiveMdToFigmaRuntimeContext.
 * Separated from types to keep type definitions clean.
 */

import type {
  ActiveMdToFigmaRuntimeContext,
  BuildActiveMdToFigmaRuntimeContextOptions,
} from '../types/active-md-to-figma.js';

/**
 * Build runtime context for active markdown to Figma execution.
 */
export function buildActiveMdToFigmaRuntimeContext(
  options: BuildActiveMdToFigmaRuntimeContextOptions,
): ActiveMdToFigmaRuntimeContext {
  return {
    specPath: options.specPath,
    markdownPath: options.markdownPath,
    tokenRegistryPath: options.tokenRegistryPath,
    generatedDir: options.generatedDir,
    fileBase: options.fileBase,
    componentName: options.componentName,
    componentSlug: options.componentSlug,
    resolvedComponentSetId: options.resolvedComponentSetId,
    expectedThemeName: options.expectedThemeName,
    offsetX: options.offsetX,
    force: options.force,
    skipValidation: options.skipValidation,
    syncStatePath: options.syncStatePath,
    figmaUrl: options.figmaUrl,
    system: options.system,
    scripts: options.scripts,
    themePath: options.themePath,
    systemPaths: options.systemPaths,
    captureProofStrict: options.captureProofStrict,
  };
}
