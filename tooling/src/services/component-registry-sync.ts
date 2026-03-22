/**
 * Component Registry Sync
 *
 * Syncs component registry with source files (specs, docs, proofs, renders).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  DEFAULT_COMPONENT_DOCS_DIR,
  DEFAULT_COMPONENT_REGISTRY_PATH,
  DEFAULT_COMPONENT_SPECS_DIR,
  DEFAULT_RENDER_PAYLOADS_DIR,
  DEFAULT_VISUAL_PROOFS_DIR,
} from './component-registry-constants.js';
import { buildComponentRegistry } from './component-registry-build.js';
import { fileExists, writeJsonAtomic } from './component-registry-utils.js';
import type {
  ComponentRegistry,
  ReadRegistryOptions,
  ReadRegistryResult,
  CompareRegistryResult,
  SyncRegistryOptions,
  SyncRegistryResult,
} from '../types/component-registry.js';

/**
 * Normalize JSON payload to string with trailing newline.
 */
function normalizeJson(payload: unknown): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/**
 * Read component registry from file with optional validation.
 */
export function readComponentRegistry(
  registryPath: string = DEFAULT_COMPONENT_REGISTRY_PATH,
  options: ReadRegistryOptions = {},
): ReadRegistryResult {
  const { allowMissing = false } = options;
  const resolvedPath = path.resolve(registryPath);
  
  if (!fileExists(resolvedPath)) {
    if (allowMissing) {
      return {
        exists: false,
        registry: null,
        validation: { ok: true, errors: [] },
      };
    }
    throw new Error(`Component registry not found: ${resolvedPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid component registry JSON (${resolvedPath}): ${reason}`);
  }

  // For now, assume valid if it parses (full validation in validate.mjs)
  const validation = { ok: true, errors: [] };
  
  return {
    exists: true,
    registry: parsed as ComponentRegistry,
    validation,
  };
}

/**
 * Build expected component registry from sources.
 */
export function buildExpectedComponentRegistry(
  options: {
    specsDir?: string;
    docsDir?: string;
    proofsDir?: string;
    renderDir?: string;
  } = {},
): ComponentRegistry {
  const {
    specsDir = DEFAULT_COMPONENT_SPECS_DIR,
    docsDir = DEFAULT_COMPONENT_DOCS_DIR,
    proofsDir = DEFAULT_VISUAL_PROOFS_DIR,
    renderDir = DEFAULT_RENDER_PAYLOADS_DIR,
  } = options;
  
  const expected = buildComponentRegistry({
    specsDir,
    docsDir,
    proofsDir,
    renderDir,
  });
  
  // Validation would go here (currently passes through)
  return expected;
}

/**
 * Compare current registry to expected state from sources.
 */
export function compareComponentRegistryToSources(
  options: {
    registryPath?: string;
    specsDir?: string;
    docsDir?: string;
    proofsDir?: string;
    renderDir?: string;
  } = {},
): CompareRegistryResult {
  const {
    registryPath = DEFAULT_COMPONENT_REGISTRY_PATH,
    ...buildOptions
  } = options;
  
  const expected = buildExpectedComponentRegistry(buildOptions);
  const current = readComponentRegistry(registryPath, { allowMissing: true });
  const expectedJson = normalizeJson(expected);
  const currentJson = current.exists ? normalizeJson(current.registry) : '';

  return {
    exists: current.exists,
    matches: current.exists && currentJson === expectedJson,
    expected,
    current: current.registry,
    expectedJson,
    currentJson,
  };
}

/**
 * Sync component registry with source files.
 */
export function syncComponentRegistry(
  options: SyncRegistryOptions & {
    registryPath?: string;
    specsDir?: string;
    docsDir?: string;
    proofsDir?: string;
    renderDir?: string;
  } = {},
): SyncRegistryResult {
  const {
    registryPath = DEFAULT_COMPONENT_REGISTRY_PATH,
    dryRun = false,
    ...buildOptions
  } = options;
  
  const resolvedPath = path.resolve(registryPath);
  const expected = buildExpectedComponentRegistry(buildOptions);

  const expectedJson = normalizeJson(expected);
  const currentExists = fileExists(resolvedPath);
  const currentJson = currentExists ? fs.readFileSync(resolvedPath, 'utf8') : '';
  const changed = currentJson !== expectedJson;

  if (changed && !dryRun) {
    writeJsonAtomic(resolvedPath, expected);
  }

  return {
    ok: true,
    dryRun,
    changed,
    written: changed && !dryRun,
    registryPath: resolvedPath,
    schemaVersion: expected.schema_version,
    summary: expected.summary,
    fingerprint: expected.fingerprint_sha256,
  };
}
