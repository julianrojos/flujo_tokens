import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_COMPONENT_DOCS_DIR,
  DEFAULT_COMPONENT_REGISTRY_PATH,
  DEFAULT_COMPONENT_SPECS_DIR,
  DEFAULT_RENDER_PAYLOADS_DIR,
  DEFAULT_VISUAL_PROOFS_DIR,
} from "./constants.mjs";
import { buildComponentRegistry } from "./build.mjs";
import { validateComponentRegistry } from "./validate.mjs";
import { fileExists, writeJsonAtomic } from "./utils.mjs";

function normalizeJson(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function readComponentRegistry(registryPath = DEFAULT_COMPONENT_REGISTRY_PATH, { allowMissing = false } = {}) {
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

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid component registry JSON (${resolvedPath}): ${reason}`);
  }

  const validation = validateComponentRegistry(parsed);
  if (!validation.ok) {
    throw new Error(
      "Component registry failed schema validation.\n" +
        `Registry: ${resolvedPath}\n` +
        `${JSON.stringify(validation.errors, null, 2)}`,
    );
  }

  return {
    exists: true,
    registry: parsed,
    validation,
  };
}

export function buildExpectedComponentRegistry({
  specsDir = DEFAULT_COMPONENT_SPECS_DIR,
  docsDir = DEFAULT_COMPONENT_DOCS_DIR,
  proofsDir = DEFAULT_VISUAL_PROOFS_DIR,
  renderDir = DEFAULT_RENDER_PAYLOADS_DIR,
} = {}) {
  const expected = buildComponentRegistry({
    specsDir,
    docsDir,
    proofsDir,
    renderDir,
  });
  const validation = validateComponentRegistry(expected);
  if (!validation.ok) {
    throw new Error(
      "Generated component registry failed internal schema checks.\n" +
        `${JSON.stringify(validation.errors, null, 2)}`,
    );
  }
  return expected;
}

export function compareComponentRegistryToSources({
  registryPath = DEFAULT_COMPONENT_REGISTRY_PATH,
  specsDir = DEFAULT_COMPONENT_SPECS_DIR,
  docsDir = DEFAULT_COMPONENT_DOCS_DIR,
  proofsDir = DEFAULT_VISUAL_PROOFS_DIR,
  renderDir = DEFAULT_RENDER_PAYLOADS_DIR,
} = {}) {
  const expected = buildExpectedComponentRegistry({
    specsDir,
    docsDir,
    proofsDir,
    renderDir,
  });

  const current = readComponentRegistry(registryPath, { allowMissing: true });
  const expectedJson = normalizeJson(expected);
  const currentJson = current.exists ? normalizeJson(current.registry) : "";

  return {
    exists: current.exists,
    matches: current.exists && currentJson === expectedJson,
    expected,
    current: current.registry,
    expectedJson,
    currentJson,
  };
}

export function syncComponentRegistry({
  registryPath = DEFAULT_COMPONENT_REGISTRY_PATH,
  specsDir = DEFAULT_COMPONENT_SPECS_DIR,
  docsDir = DEFAULT_COMPONENT_DOCS_DIR,
  proofsDir = DEFAULT_VISUAL_PROOFS_DIR,
  renderDir = DEFAULT_RENDER_PAYLOADS_DIR,
  dryRun = false,
} = {}) {
  const resolvedPath = path.resolve(registryPath);
  const expected = buildExpectedComponentRegistry({
    specsDir,
    docsDir,
    proofsDir,
    renderDir,
  });

  const expectedJson = normalizeJson(expected);
  const currentExists = fileExists(resolvedPath);
  const currentJson = currentExists ? fs.readFileSync(resolvedPath, "utf8") : "";
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
