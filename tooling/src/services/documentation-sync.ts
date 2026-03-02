/**
 * Documentation Sync Helper
 *
 * Synchronizes documentation indices after successful render.
 * This is a helper function, not a phase, as it has no conditional logic.
 *
 * Always executes to ensure indices remain consistent.
 */

import { syncDocumentationIndices } from './component-registry-index.js';
import type { ActiveMdToFigmaRuntimeContext } from '../types/active-md-to-figma.js';

/**
 * Synchronize documentation indices.
 *
 * Uses systemPaths from runtime context.
 * Always executes regardless of pipeline skip status.
 */
export function syncDocumentation(context: ActiveMdToFigmaRuntimeContext): void {
  const { systemPaths } = context;

  syncDocumentationIndices({
    docsDir: systemPaths.docsDir,
    overviewPath: systemPaths.overviewPath,
    specsDir: systemPaths.specsDir,
    proofsDir: systemPaths.proofsDir,
    renderDir: systemPaths.renderDir,
    registryPath: systemPaths.registryPath,
  });
}
