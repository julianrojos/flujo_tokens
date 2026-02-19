import crypto from "node:crypto";

import { isPlainObject } from "./is-plain-object.mjs";
import { normalizeNodeId } from "./node-id.mjs";

const FIGMA_NODE_ID_RE = /^[A-Za-z0-9]+:[A-Za-z0-9]+$/;

function stableSortDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stableSortDeep(item));
  }

  if (isPlainObject(value)) {
    const sorted = {};
    for (const key of Object.keys(value).sort((a, b) =>
      a.localeCompare(b, "en"),
    )) {
      sorted[key] = stableSortDeep(value[key]);
    }
    return sorted;
  }

  return value;
}

function sha256(input) {
  const hash = crypto.createHash("sha256");
  hash.update(String(input));
  return hash.digest("hex");
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function normalizePropertyForSnapshot(property) {
  if (!isPlainObject(property)) return {};
  const normalized = {};

  for (const [key, rawValue] of Object.entries(property)) {
    if (key === "values") {
      normalized.values = normalizeStringArray(rawValue);
      continue;
    }

    if (typeof rawValue === "string") {
      normalized[key] = rawValue.trim();
      continue;
    }

    normalized[key] = stableSortDeep(rawValue);
  }

  return normalized;
}

function parseProperties(spec) {
  const rawProperties = Array.isArray(spec.properties) ? spec.properties : [];
  return rawProperties.filter((entry) => isPlainObject(entry));
}

function computeVariantsCount(properties) {
  const variantAxes = properties
    .map((property) => ({
      type: String(property.type ?? "")
        .trim()
        .toLowerCase(),
      values: normalizeStringArray(property.values),
    }))
    .filter((axis) => axis.type === "enum");

  if (variantAxes.length === 0) return 1;

  let total = 1;
  for (const axis of variantAxes) {
    const axisCount = axis.values.length;
    if (axisCount === 0) return 0;
    total *= axisCount;
  }
  return total;
}

function getNormalizedComponentSetNodeId(spec) {
  const figma = isPlainObject(spec.figma) ? spec.figma : {};
  const rawNodeId = String(figma.component_set_node_id ?? "").trim();
  if (!rawNodeId) return "";
  const normalizedNodeId = normalizeNodeId(rawNodeId);
  return FIGMA_NODE_ID_RE.test(normalizedNodeId) ? normalizedNodeId : "";
}

export function deriveFigmaFrontmatterTraceability(spec) {
  const safeSpec = isPlainObject(spec) ? spec : {};
  const properties = parseProperties(safeSpec);
  const normalizedProperties = properties.map((property) =>
    normalizePropertyForSnapshot(property),
  );
  const componentSetNodeId = getNormalizedComponentSetNodeId(safeSpec);

  const snapshot = {
    component_set_node_id: componentSetNodeId,
    properties: normalizedProperties,
  };

  const canonicalSnapshot = stableSortDeep(snapshot);
  const componentHash = sha256(JSON.stringify(canonicalSnapshot));

  return {
    componentSetNodeId,
    componentHash,
    propertiesCount: properties.length,
    variantsCount: computeVariantsCount(properties),
  };
}
