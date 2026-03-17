/**
 * Spec Sorter Service
 *
 * Pure logic for sorting properties in component spec YAML files.
 * No I/O operations - file handling is done by the runner.
 */

import * as yaml from 'js-yaml';

import { isPlainObject } from '../utils/is-plain-object.js';
import {
  getSpecPropertyTypeInfo,
  PROPERTY_FIELD_ORDER,
  hasCanonicalPropertyFieldOrder,
} from './spec-property-types.js';

// Type metadata (simplified from property-type-map.json)
const TYPE_MAP = {
  type_metadata: {
    VARIANT: { orderingGroup: 1 },
    TEXT: { orderingGroup: 2 },
    BOOLEAN: { orderingGroup: 3 },
    INSTANCE_SWAP: { orderingGroup: 4 },
  },
};

const UNKNOWN_GROUP = Object.keys(TYPE_MAP.type_metadata).length + 1;

/**
 * Returns the ordering group number for a given property type string.
 */
export function groupFor(rawType: string): number {
  const typeInfo = getSpecPropertyTypeInfo(rawType);
  return typeInfo ? typeInfo.orderingGroup : UNKNOWN_GROUP;
}

/**
 * Normalize field order within a single property object.
 */
export function normalizePropertyFieldOrder(prop: Record<string, unknown>): Record<string, unknown> {
  if (!isPlainObject(prop)) return prop;
  const result: Record<string, unknown> = {};
  for (const key of PROPERTY_FIELD_ORDER) {
    if (key in prop) result[key] = prop[key];
  }
  for (const [key, value] of Object.entries(prop)) {
    if (!(key in result)) result[key] = value;
  }
  return result;
}

/**
 * Sort properties array to canonical group order. Stable within each group.
 */
export function sortProperties(properties: unknown[]): unknown[] {
  if (!Array.isArray(properties)) return properties;
  return properties
    .map((prop, originalIndex) => ({ prop, originalIndex }))
    .sort((a, b) => {
      const groupA = groupFor((a.prop as any)?.type);
      const groupB = groupFor((b.prop as any)?.type);
      if (groupA !== groupB) return groupA - groupB;
      return a.originalIndex - b.originalIndex; // stable within group
    })
    .map(({ prop }) => normalizePropertyFieldOrder(prop as Record<string, unknown>));
}

/**
 * Check if properties array is already in canonical order.
 */
export function isAlreadySorted(properties: unknown[]): boolean {
  if (!Array.isArray(properties)) return true;
  let previousGroup = -1;
  for (const prop of properties) {
    if (!isPlainObject(prop)) continue;
    const g = groupFor((prop as any).type);
    if (g < previousGroup) return false;
    previousGroup = g;
  }
  return true;
}

const YAML_DUMP_OPTS = {
  lineWidth: 120,
  noRefs: true,
  sortKeys: false,
  indent: 2,
  quotingType: '"',
} as const;

/**
 * Serialize a spec object back to YAML string.
 */
export function dumpSpec(spec: Record<string, unknown>): string {
  return yaml.dump(spec, YAML_DUMP_OPTS);
}

/**
 * Parse YAML string to spec object.
 */
export function parseSpec(content: string): unknown {
  return yaml.load(content);
}

interface SortResult {
  alreadySorted: boolean;
  groupsOk: boolean;
  fieldsOk: boolean;
}

/**
 * Check if a spec is already sorted.
 */
export function checkSpecSort(spec: Record<string, unknown>): SortResult {
  if (!Array.isArray(spec.properties)) {
    return { alreadySorted: true, groupsOk: true, fieldsOk: true };
  }

  const properties = spec.properties as unknown[];
  const groupsOk = isAlreadySorted(properties);
  const fieldsOk = hasCanonicalPropertyFieldOrder(properties);
  const alreadySorted = groupsOk && fieldsOk;

  return { alreadySorted, groupsOk, fieldsOk };
}

/**
 * Sort a spec object and return the new spec.
 */
export function sortSpec(spec: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(spec.properties)) {
    return spec;
  }

  const sorted = { ...spec };
  sorted.properties = sortProperties(spec.properties as unknown[]);
  return sorted;
}
