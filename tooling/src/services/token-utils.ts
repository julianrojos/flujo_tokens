/**
 * Token Services - Common Utilities
 *
 * Shared utility functions for token-usage-index and token-graph services.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

import type {
  TokenCatalog,
  TokenCatalogEntry,
} from './token-types.js';

/**
 * Regex for CSS variable references: var(--name) or var(--name, fallback)
 */
export const CSS_VAR_REF_RE = /var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]+)?\)/gi;

/**
 * Regex for CSS custom property declarations: --name: value;
 */
export const CSS_CUSTOM_PROP_DECL_RE = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;

/**
 * Regex for A11y mode dot notation
 */
export const A11Y_MODE_DOT_RE = /^A11y\.A11y\.mode[A-Za-z0-9_-]+\./;

/**
 * Regex for A11y mode slash notation
 */
export const A11Y_MODE_SLASH_RE = /^A11y\/A11y\/mode[A-Za-z0-9_-]+\//;

/**
 * Parse boolean option from string
 */
export function parseBooleanOption(
  rawValue: unknown,
  optionName: string,
  fallback: boolean = false,
): boolean {
  const normalized = String(rawValue ?? fallback).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(
    `Invalid ${optionName} value: ${rawValue}. Allowed: true, false.`,
  );
}

/**
 * Parse positive integer option from string
 */
export function parsePositiveInteger(
  rawValue: string | undefined | null,
  optionName: string,
  fallback: number = 0,
): number {
  const normalized = String(rawValue ?? fallback).trim();
  const parsed = parseInt(normalized, 10);
  if (isNaN(parsed) || parsed < 0) {
    throw new Error(
      `Invalid ${optionName} value: ${rawValue}. Must be a positive integer.`,
    );
  }
  return parsed;
}

/**
 * Extract CSS variable references from text
 */
export function extractCssVarReferences(text: string): string[] {
  const refs: string[] = [];
  const regex = new RegExp(CSS_VAR_REF_RE);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    refs.push(match[1]);
  }

  return refs;
}

/**
 * Extract CSS custom property declarations from CSS text
 */
export function extractCssDeclarations(cssText: string): Array<{
  name: string;
  value: string;
}> {
  const declarations: Array<{ name: string; value: string }> = [];
  const regex = new RegExp(CSS_CUSTOM_PROP_DECL_RE, 'gi');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(cssText)) !== null) {
    declarations.push({
      name: match[1],
      value: match[2].trim(),
    });
  }

  return declarations;
}

/**
 * Check if a value is a CSS variable reference
 */
export function isCssVarRef(value: unknown): boolean {
  const trimmed = String(value ?? '').trim();
  return CSS_VAR_REF_RE.test(trimmed);
}

/**
 * Extract the CSS variable name from a var() reference
 */
export function extractVarName(value: unknown): string | null {
  const trimmed = String(value ?? '').trim();
  const match = trimmed.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]+)?\)$/i);
  return match ? match[1] : null;
}

/**
 * Normalize A11y token path from dot to slash notation
 */
export function normalizeA11yPath(path: string): string {
  return path.replace(A11Y_MODE_DOT_RE, (match) =>
    match.replace(/\./g, '/'),
  );
}

/**
 * Find token entry by CSS variable name
 */
export function findTokenByCssVar(
  registry: TokenCatalog,
  cssVar: string,
): TokenCatalogEntry | undefined {
  return registry.entries.find((entry) => entry.cssVar === cssVar);
}

/**
 * Find token entry by path
 */
export function findTokenByPath(
  registry: TokenCatalog,
  tokenPath: string,
): TokenCatalogEntry | undefined {
  return registry.entries.find((entry) => entry.path === tokenPath);
}

/**
 * Find token entry by ID
 */
export function findTokenById(
  registry: TokenCatalog,
  tokenId: string,
): TokenCatalogEntry | undefined {
  return registry.entries.find((entry) => entry.id === tokenId);
}

/**
 * Get all tokens that reference a given token (alias references)
 */
export function getTokenAliases(
  registry: TokenCatalog,
  tokenId: string,
): TokenCatalogEntry[] {
  return registry.entries.filter(
    (entry) =>
      entry.aliases?.includes(tokenId) ||
      (isCssVarRef(entry.$value) && extractVarName(entry.$value) === findTokenById(registry, tokenId)?.cssVar),
  );
}

/**
 * Check if token value is a primitive (not a reference)
 */
export function isPrimitiveValue(value: unknown): boolean {
  const trimmed = String(value ?? '').trim();
  return !CSS_VAR_REF_RE.test(trimmed);
}

/**
 * Group tokens by collection
 */
export function groupTokensByCollection(
  registry: TokenCatalog,
): Map<string, TokenCatalogEntry[]> {
  const groups = new Map<string, TokenCatalogEntry[]>();

  for (const entry of registry.entries) {
    const collection = entry.collection || 'unknown';
    const existing = groups.get(collection) || [];
    existing.push(entry);
    groups.set(collection, existing);
  }

  return groups;
}

/**
 * Group tokens by mode
 */
export function groupTokensByMode(
  registry: TokenCatalog,
): Map<string, TokenCatalogEntry[]> {
  const groups = new Map<string, TokenCatalogEntry[]>();

  for (const entry of registry.entries) {
    const mode = entry.mode || 'default';
    const existing = groups.get(mode) || [];
    existing.push(entry);
    groups.set(mode, existing);
  }

  return groups;
}

/**
 * Compute SHA256 hash of an object
 */
export function computeSha256(data: unknown): string {
  const content = typeof data === 'string' ? data : JSON.stringify(data);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Compute SHA256 hash of a file
 */
export function computeFileSha256(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
}
