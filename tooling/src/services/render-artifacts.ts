/**
 * Render Artifacts
 *
 * Manages render-specific artifacts with automatic cleanup.
 * Handles temporary outputs, stale artifact purging, and artifact paths.
 */

import * as path from 'node:path';

import { TempArtifactManager } from './temp-artifacts.js';
import { logger } from '../utils/logger.js';

export interface RenderArtifactPaths {
  renderAgentOutputPath: string;
  renderAuditOutputPath: string;
}

export interface PurgeRenderArtifactsOptions {
  generatedDir: string;
  fileBase: string;
}

export interface PurgeRenderArtifactsResult {
  removed: string[];
  removedBasenames: string[];
}

/**
 * Build render artifact paths.
 */
export function buildRenderArtifactPaths(
  generatedDir: string,
  fileBase: string,
): RenderArtifactPaths {
  return {
    renderAgentOutputPath: path.resolve(generatedDir, `${fileBase}.render-agent-output.txt`),
    renderAuditOutputPath: path.resolve(generatedDir, `${fileBase}.render-audit-output.txt`),
  };
}

/**
 * Purge stale render artifacts for a specific file.
 */
export function purgeRenderArtifacts(
  options: PurgeRenderArtifactsOptions,
  tempArtifacts: TempArtifactManager,
): PurgeRenderArtifactsResult {
  const { generatedDir, fileBase } = options;
  
  const staleArtifacts = tempArtifacts.purgeMatching({
    dir: generatedDir,
    matcher: (name: string) => [
      `${fileBase}.render-agent-output.txt`,
      `${fileBase}.render-audit-output.txt`,
    ].includes(name),
  });
  
  if (staleArtifacts.removed.length > 0) {
    logger.warn(
      `Removed stale temporary artifacts for ${fileBase}: ${staleArtifacts.removed
        .map((artifactPath) => path.basename(artifactPath))
        .join(', ')}`,
    );
  }
  
  return {
    removed: staleArtifacts.removed,
    removedBasenames: staleArtifacts.removed.map((p) => path.basename(p)),
  };
}

/**
 * Render artifact manager class.
 * Extends TempArtifactManager with render-specific functionality.
 */
export class RenderArtifactManager extends TempArtifactManager {
  private generatedDir: string;
  private fileBase: string;
  
  constructor(generatedDir: string, fileBase: string) {
    super();
    this.generatedDir = generatedDir;
    this.fileBase = fileBase;
  }
  
  /**
   * Get render artifact paths.
   */
  getArtifactPaths(): RenderArtifactPaths {
    return buildRenderArtifactPaths(this.generatedDir, this.fileBase);
  }
  
  /**
   * Purge stale artifacts for this file.
   */
  purgeStale(): PurgeRenderArtifactsResult {
    return purgeRenderArtifacts(
      { generatedDir: this.generatedDir, fileBase: this.fileBase },
      this,
    );
  }
  
  /**
   * Write render agent output.
   */
  writeRenderAgentOutput(content: string): string {
    const paths = this.getArtifactPaths();
    return this.writeTrackedFile(paths.renderAgentOutputPath, content, 'utf8');
  }
  
  /**
   * Write render audit output.
   */
  writeRenderAuditOutput(content: string): string {
    const paths = this.getArtifactPaths();
    return this.writeTrackedFile(paths.renderAuditOutputPath, content, 'utf8');
  }
}

/**
 * Create render artifact manager and purge stale artifacts.
 */
export function createRenderArtifactManager(
  generatedDir: string,
  fileBase: string,
): { manager: RenderArtifactManager; purgeResult: PurgeRenderArtifactsResult } {
  const manager = new RenderArtifactManager(generatedDir, fileBase);
  manager.attachProcessHooks();
  
  const purgeResult = manager.purgeStale();
  
  return { manager, purgeResult };
}
