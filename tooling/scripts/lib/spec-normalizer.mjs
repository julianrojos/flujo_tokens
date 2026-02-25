/** @typedef {import('ds-types').ComponentSpec} ComponentSpec */

import { isPlainObject } from "./is-plain-object.mjs";
import { isTbdMarker } from "./tbd.mjs";
import { componentNameToDisplayName } from "./component-name.mjs";
import {
  PROPERTY_FIELD_ORDER,
  coerceSpecPropertyType,
  getSpecPropertyTypeInfo,
} from "./spec-property-types.mjs";

export const SPEC_TOP_LEVEL_ORDER = Object.freeze([
  "name",
  "status",
  "figma",
  "summary",
  "anatomy",
  "properties",
  "content_guidelines",
  "best_practices",
  "accessibility",
  "token_mapping",
  "qa",
  "related_components",
]);

export function countTbdValues(value) {
  if (typeof value === "string") return isTbdMarker(value) ? 1 : 0;
  if (Array.isArray(value))
    return value.reduce((sum, item) => sum + countTbdValues(item), 0);
  if (isPlainObject(value)) {
    return Object.values(value).reduce(
      (sum, item) => sum + countTbdValues(item),
      0,
    );
  }
  return 0;
}

const FIGMA_FIELD_ORDER = Object.freeze([
  "file",
  "page",
  "component_set",
  "component_set_node_id",
]);

function deepClone(value) {
  if (Array.isArray(value)) return value.map((item) => deepClone(item));
  if (isPlainObject(value)) {
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = deepClone(child);
    }
    return result;
  }
  return value;
}

export function mergeWithTemplate(templateValue, generatedValue) {
  if (generatedValue === undefined) return deepClone(templateValue);

  if (Array.isArray(templateValue)) {
    return Array.isArray(generatedValue)
      ? deepClone(generatedValue)
      : deepClone(templateValue);
  }

  if (isPlainObject(templateValue)) {
    const generatedObject = isPlainObject(generatedValue) ? generatedValue : {};
    const result = {};

    for (const [key, childTemplate] of Object.entries(templateValue)) {
      result[key] = mergeWithTemplate(childTemplate, generatedObject[key]);
    }

    for (const [key, childValue] of Object.entries(generatedObject)) {
      if (!(key in result)) result[key] = deepClone(childValue);
    }

    return result;
  }

  return deepClone(generatedValue);
}

export function normalizeSpecOrder(spec) {
  const ordered = {};
  for (const key of SPEC_TOP_LEVEL_ORDER) {
    if (key in spec) ordered[key] = spec[key];
  }
  for (const [key, value] of Object.entries(spec)) {
    if (!(key in ordered)) ordered[key] = value;
  }
  if (isPlainObject(ordered.figma)) {
    const figmaOrdered = {};
    for (const key of FIGMA_FIELD_ORDER) {
      if (key in ordered.figma) figmaOrdered[key] = ordered.figma[key];
    }
    for (const [key, value] of Object.entries(ordered.figma)) {
      if (!(key in figmaOrdered)) figmaOrdered[key] = value;
    }
    ordered.figma = figmaOrdered;
  }

  if (Array.isArray(ordered.properties)) {
    const stableDecorated = ordered.properties.map((item, index) => ({
      item: isPlainObject(item) ? item : {},
      index,
    }));
    stableDecorated.sort((a, b) => {
      const typeA = coerceSpecPropertyType(a.item.type);
      const typeB = coerceSpecPropertyType(b.item.type);
      const infoA = typeA ? getSpecPropertyTypeInfo(typeA) : null;
      const infoB = typeB ? getSpecPropertyTypeInfo(typeB) : null;
      const groupA = infoA ? infoA.orderingGroup : Number.MAX_SAFE_INTEGER;
      const groupB = infoB ? infoB.orderingGroup : Number.MAX_SAFE_INTEGER;
      if (groupA !== groupB) return groupA - groupB;
      return a.index - b.index;
    });

    ordered.properties = stableDecorated.map(({ item }) => {
      const canonicalType = coerceSpecPropertyType(item.type);
      if (canonicalType) item.type = canonicalType;
      const propertyOrdered = {};
      for (const key of PROPERTY_FIELD_ORDER) {
        if (key in item) propertyOrdered[key] = item[key];
      }
      for (const [key, value] of Object.entries(item)) {
        if (!(key in propertyOrdered)) propertyOrdered[key] = value;
      }
      return propertyOrdered;
    });
  }

  return ordered;
}

/**
 * @param {Object} args
 * @param {Partial<ComponentSpec> | Record<string, any>} args.templateSpec
 * @param {Partial<ComponentSpec> | Record<string, any>} args.generatedSpecRaw
 * @param {string} [args.componentName]
 * @param {string} [args.nodeId]
 * @param {string} [args.fileKeyFromUrl]
 * @param {any} [args.tokenCandidates]
 * @param {Function} [args.prefillTokenMappingFn=function(){ return 0; }]
 * @returns {{ normalizedSpec: Partial<ComponentSpec>, prefilledCount: number }}
 */
export function normalizeSpec({
  templateSpec,
  generatedSpecRaw,
  componentName,
  nodeId,
  fileKeyFromUrl,
  tokenCandidates,
  prefillTokenMappingFn
}) {
  const mergedSpec = mergeWithTemplate(templateSpec, generatedSpecRaw);
  
  // ensureSpecMetadata logic
  if (!isPlainObject(mergedSpec.figma)) mergedSpec.figma = {};
  if (componentName && isTbdMarker(mergedSpec.name))
    mergedSpec.name = componentNameToDisplayName(componentName);
  if (componentName && !String(mergedSpec.name || "").trim())
    mergedSpec.name = componentNameToDisplayName(componentName);

  if (fileKeyFromUrl && (!mergedSpec.figma.file || isTbdMarker(mergedSpec.figma.file))) {
    mergedSpec.figma.file = fileKeyFromUrl;
  }
  if (
    nodeId &&
    (!mergedSpec.figma.component_set_node_id ||
      isTbdMarker(mergedSpec.figma.component_set_node_id))
  ) {
    mergedSpec.figma.component_set_node_id = nodeId;
  }
  
  const prefilledCount = prefillTokenMappingFn(
    mergedSpec.token_mapping,
    tokenCandidates,
    "token_mapping",
  );

  /** @type {any} */
  const normalizedSpec = normalizeSpecOrder(mergedSpec);

  return {
    normalizedSpec,
    prefilledCount,
  };
}
