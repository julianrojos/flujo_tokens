/**
 * Component Registry Refresh
 *
 * Atomically syncs documentation indices (registry + overview).
 */

import * as path from 'node:path';

import { captureFileSnapshot, restoreFileSnapshot } from './file-snapshot.js';
import {
  DEFAULT_COMPONENT_DOCS_DIR,
  DEFAULT_COMPONENT_OVERVIEW_PATH,
  DEFAULT_COMPONENT_REGISTRY_PATH,
  DEFAULT_COMPONENT_SPECS_DIR,
  DEFAULT_RENDER_PAYLOADS_DIR,
  DEFAULT_VISUAL_PROOFS_DIR,
} from './component-registry-constants.js';
import { syncComponentRegistry } from './component-registry-sync.js';
import { syncComponentOverview } from './component-registry-overview-sync.js';
import type {
  ComponentRegistry,
  SyncIndicesResult,
} from '../types/component-registry.js';

/**
 * Summarize error to string message.
 */
function summarizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Sync documentation indices atomically (registry + overview).
 */
export function syncDocumentationIndices(
  options: {
    registryPath?: string;
    overviewPath?: string;
    specsDir?: string;
    docsDir?: string;
    proofsDir?: string;
    renderDir?: string;
    dryRun?: boolean;
  } = {},
): SyncIndicesResult {
  const {
    registryPath = DEFAULT_COMPONENT_REGISTRY_PATH,
    overviewPath = DEFAULT_COMPONENT_OVERVIEW_PATH,
    specsDir = DEFAULT_COMPONENT_SPECS_DIR,
    docsDir = DEFAULT_COMPONENT_DOCS_DIR,
    proofsDir = DEFAULT_VISUAL_PROOFS_DIR,
    renderDir = DEFAULT_RENDER_PAYLOADS_DIR,
    dryRun = false,
  } = options;
  
  const resolvedRegistryPath = path.resolve(registryPath);
  const resolvedOverviewPath = path.resolve(overviewPath);
  const resolvedSpecsDir = path.resolve(specsDir);
  const resolvedDocsDir = path.resolve(docsDir);
  const resolvedProofsDir = path.resolve(proofsDir);
  const resolvedRenderDir = path.resolve(renderDir);

  const registrySnapshot = captureFileSnapshot(resolvedRegistryPath);
  const overviewSnapshot = captureFileSnapshot(resolvedOverviewPath);

  try {
    const expectedRegistry: ComponentRegistry | null = dryRun
      ? {
          schema_version: 1,
          components: [],
          summary: {
            total_components: 0,
            with_spec: 0,
            with_doc: 0,
            with_render_payload: 0,
            with_visual_proof: 0,
            ready_for_publish: 0,
            by_pipeline_stage: {
              'missing-spec': 0,
              'spec': 0,
              'markdown': 0,
              'render': 0,
              'visual-proof': 0,
            },
          },
          fingerprint_sha256: '',
        }
      : null;

    const registry = syncComponentRegistry({
      registryPath: resolvedRegistryPath,
      specsDir: resolvedSpecsDir,
      docsDir: resolvedDocsDir,
      proofsDir: resolvedProofsDir,
      renderDir: resolvedRenderDir,
      dryRun,
    });

    const overview = syncComponentOverview({
      registryPath: resolvedRegistryPath,
      overviewPath: resolvedOverviewPath,
      dryRun,
      registry: expectedRegistry,
    });

    return {
      ok: true,
      dryRun,
      atomic: true,
      changed: Boolean(registry.changed || overview.changed),
      written: Boolean(registry.written || overview.written),
      registry,
      overview,
    };
  } catch (error) {
    if (!dryRun) {
      restoreFileSnapshot(resolvedRegistryPath, registrySnapshot);
      restoreFileSnapshot(resolvedOverviewPath, overviewSnapshot);
    }
    throw new Error(
      'Atomic documentation index refresh failed.\n' +
        `Rollback applied: ${dryRun ? 'no (dry-run)' : 'yes'}.\n` +
        `Reason: ${summarizeError(error)}`,
    );
  }
}
