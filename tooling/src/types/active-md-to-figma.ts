/**
 * Active Markdown to Figma Types
 *
 * Type definitions for active markdown to Figma runtime context.
 */

/**
 * Script paths for pipeline execution.
 */
export interface PipelineScriptPaths {
  markdownToModelScript: string;
  modelToExecuteScript: string;
}

/**
 * System paths for documentation sync.
 */
export interface SystemContextPaths {
  docsDir: string;
  overviewPath: string;
  specsDir: string;
  proofsDir: string;
  renderDir: string;
  registryPath: string;
}

/**
 * Runtime context for active markdown to Figma execution.
 * Consolidates all path and configuration values needed across phases.
 */
export interface ActiveMdToFigmaRuntimeContext {
  // Input paths
  specPath: string;
  markdownPath: string;
  tokenRegistryPath: string;

  // Output directories
  generatedDir: string;

  // Component identity
  fileBase: string;
  componentName: string;
  componentSlug: string;

  // Figma context
  resolvedComponentSetId: string;
  expectedThemeName: string;

  // Rendering configuration
  offsetX: number;
  force: boolean;
  skipValidation: boolean;

  // Script paths (resolved)
  scripts: PipelineScriptPaths;

  // Theme path
  themePath: string;

  // System paths for sync
  systemPaths: SystemContextPaths;

  // Optional runtime state
  syncStatePath?: string;
  figmaUrl?: string;
  system?: string;

  // Capture proof configuration
  captureProofStrict: boolean;
}

/**
 * Builder options for ActiveMdToFigmaRuntimeContext.
 */
export interface BuildActiveMdToFigmaRuntimeContextOptions {
  specPath: string;
  markdownPath: string;
  tokenRegistryPath: string;
  generatedDir: string;
  fileBase: string;
  componentName: string;
  componentSlug: string;
  resolvedComponentSetId: string;
  expectedThemeName: string;
  offsetX: number;
  force: boolean;
  skipValidation: boolean;
  syncStatePath?: string;
  figmaUrl?: string;
  system?: string;
  scripts: PipelineScriptPaths;
  themePath: string;
  systemPaths: SystemContextPaths;
  captureProofStrict: boolean;
}
