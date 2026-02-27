/**
 * Component Registry Utilities
 *
 * Shared utilities for component registry operations.
 */

import crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { isPlainObject } from '../utils/is-plain-object.js';
import { FIGMA_NODE_ID_RE } from '../utils/figma-node-id.js';
import { PROJECT_ROOT } from '../utils/system-context.js';
import type { NormalizeSortKeyFn, StableHashFn } from '../types/component-registry.js';

export const NODE_ID_RE = FIGMA_NODE_ID_RE;

/**
 * Serialize a value to a stable string representation.
 */
export function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value as Record<string, unknown>).sort((a, b) => a.localeCompare(b));
    const body = keys
      .map((key) => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`)
      .join(',');
    return `{${body}}`;
  }

  return JSON.stringify(value);
}

/**
 * Compute a stable SHA-256 hash for a value.
 */
export const stableHash: StableHashFn = (value: unknown): string => {
  const hash = crypto.createHash('sha256');
  hash.update(stableSerialize(value));
  return hash.digest('hex');
};

/**
 * Write JSON to file atomically using temp file + rename.
 */
export function writeJsonAtomic(filePath: string, payload: unknown): void {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const uniqueId = crypto.randomBytes(4).toString('hex');
  const tempPath = `${resolved}.${process.pid}.${Date.now()}.${uniqueId}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, resolved);
}

/**
 * Convert absolute file path to project-relative path.
 */
export function toProjectRelativePath(filePath: string): string {
  const absolute = path.resolve(filePath);
  const relative = path.relative(PROJECT_ROOT, absolute);
  if (!relative || relative.startsWith('..')) {
    throw new Error(`Path is outside project root: ${absolute}`);
  }
  return relative.split(path.sep).join('/');
}

/**
 * Check if file exists and is a regular file.
 */
export function fileExists(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  return fs.statSync(filePath).isFile();
}

/**
 * Normalize display label to title case.
 */
export function normalizeDisplayLabel(raw: unknown): string {
  const source = String(raw || '')
    .replace(/\.[^.]+$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!source) return '';

  return source
    .split(' ')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Normalize sort key to lowercase with single spaces.
 */
export const normalizeSortKey: NormalizeSortKeyFn = (raw: unknown): string => {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
};

/**
 * Check if value is a valid HTTP URL.
 */
export function isValidHttpUrl(value: unknown): boolean {
  return /^https?:\/\/\S+$/i.test(String(value || '').trim());
}

/**
 * Check if value is a valid Figma node ID.
 */
export function isValidNodeId(value: unknown): boolean {
  return NODE_ID_RE.test(String(value || '').trim());
}
