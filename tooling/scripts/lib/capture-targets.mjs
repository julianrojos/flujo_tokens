import fs from "node:fs";
import path from "node:path";

import { componentNameToSnakeCase } from "./component-name.mjs";

export function normalizeNameToSlug(rawName) {
  const normalized = componentNameToSnakeCase(String(rawName || "").trim());
  return normalized || "";
}

export function readComponentRegistry(componentRegistryPath) {
  if (!fs.existsSync(componentRegistryPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(componentRegistryPath, "utf8"));
    return Array.isArray(parsed?.components) ? parsed.components : [];
  } catch {
    return [];
  }
}

export function buildSlugLookupFromRegistry(componentRows) {
  const byNodeId = new Map();
  for (const row of componentRows) {
    const slug = String(row?.slug || "").trim();
    const nodeId = String(row?.figma?.component_set_node_id || "").trim();
    if (!slug || !nodeId) continue;
    if (!byNodeId.has(nodeId)) byNodeId.set(nodeId, slug);
  }
  return byNodeId;
}

export function buildSlugLookupFromSpecs(specDir) {
  const byNodeId = new Map();
  if (!fs.existsSync(specDir)) return byNodeId;
  const entries = fs.readdirSync(specDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".yml") || entry.name === "_template.yml") {
      continue;
    }
    const filePath = path.join(specDir, entry.name);
    const slug = path.basename(entry.name, ".yml");
    const raw = fs.readFileSync(filePath, "utf8");
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
