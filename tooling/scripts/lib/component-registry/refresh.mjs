import path from "node:path";

import { captureFileSnapshot, restoreFileSnapshot } from "../file-snapshot.mjs";
import {
  DEFAULT_COMPONENT_DOCS_DIR,
  DEFAULT_COMPONENT_OVERVIEW_PATH,
  DEFAULT_COMPONENT_REGISTRY_PATH,
  DEFAULT_COMPONENT_SPECS_DIR,
  DEFAULT_RENDER_PAYLOADS_DIR,
  DEFAULT_VISUAL_PROOFS_DIR,
} from "./constants.mjs";
import { syncComponentOverview } from "./overview-sync.mjs";
import { buildExpectedComponentRegistry, syncComponentRegistry } from "./sync.mjs";

function summarizeError(error) {
  return error instanceof Error ? error.message : String(error);
}

export function syncDocumentationIndices({
  registryPath = DEFAULT_COMPONENT_REGISTRY_PATH,
  overviewPath = DEFAULT_COMPONENT_OVERVIEW_PATH,
  specsDir = DEFAULT_COMPONENT_SPECS_DIR,
  docsDir = DEFAULT_COMPONENT_DOCS_DIR,
  proofsDir = DEFAULT_VISUAL_PROOFS_DIR,
  renderDir = DEFAULT_RENDER_PAYLOADS_DIR,
  dryRun = false,
} = {}) {
  const resolvedRegistryPath = path.resolve(registryPath);
  const resolvedOverviewPath = path.resolve(overviewPath);
  const resolvedSpecsDir = path.resolve(specsDir);
  const resolvedDocsDir = path.resolve(docsDir);
  const resolvedProofsDir = path.resolve(proofsDir);
  const resolvedRenderDir = path.resolve(renderDir);

  const registrySnapshot = captureFileSnapshot(resolvedRegistryPath);
  const overviewSnapshot = captureFileSnapshot(resolvedOverviewPath);

  try {
    const expectedRegistry = dryRun
      ? buildExpectedComponentRegistry({
          specsDir: resolvedSpecsDir,
          docsDir: resolvedDocsDir,
          proofsDir: resolvedProofsDir,
          renderDir: resolvedRenderDir,
        })
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
      "Atomic documentation index refresh failed.\n" +
        `Rollback applied: ${dryRun ? "no (dry-run)" : "yes"}.\n` +
        `Reason: ${summarizeError(error)}`,
    );
  }
}
