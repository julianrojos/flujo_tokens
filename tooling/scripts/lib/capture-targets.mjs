import fs from "node:fs";
import path from "node:path";

import { componentNameToSnakeCase } from "./component-name.mjs";

export function normalizeNameToSlug(rawName) {
  const normalized = componentNameToSnakeCase(String(rawName || "").trim());
  return normalized || "";
}

export function buildSlugLookupFromRegistry(componentRows) {
  const byNodeId = new Map();
  if (!Array.isArray(componentRows)) return byNodeId;
  for (const row of componentRows) {
    const slug = String(row?.slug || "").trim();
    const nodeId = String(row?.figma?.component_set_node_id || "").trim();
    if (!slug || !nodeId) continue;
    if (!byNodeId.has(nodeId)) byNodeId.set(nodeId, slug);
  }
  return byNodeId;
}

export function buildSlugLookupFromSpecContents(specFiles) {
  const byNodeId = new Map();
  if (!Array.isArray(specFiles)) return byNodeId;
  for (const file of specFiles) {
    const raw = String(file.content || "");
    const slug = String(file.slug || "").trim();
    const match = raw.match(/^\s*component_set_node_id:\s*["']?([0-9]+:[0-9]+)["']?\s*$/m);
    if (!match || !match[1]) continue;
    const nodeId = String(match[1]).trim();
    if (!byNodeId.has(nodeId)) byNodeId.set(nodeId, slug);
  }
  return byNodeId;
}

export function resolveInferredSlug({
  applySlugOverride,
  componentSlugOverride,
  slugByNodeFromRegistry,
  slugByNodeFromSpecs,
  nodeId,
  candidateName,
}) {
  return (
    (applySlugOverride ? componentSlugOverride : "") ||
    slugByNodeFromRegistry.get(nodeId) ||
    slugByNodeFromSpecs.get(nodeId) ||
    normalizeNameToSlug(candidateName)
  );
}
