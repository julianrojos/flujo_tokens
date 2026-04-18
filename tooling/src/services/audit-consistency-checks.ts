/**
 * Audit Consistency Checks
 *
 * Domain logic for auditing consistency between spec, markdown, token-registry, and Figma.
 * Pure functions - no I/O, no CLI dependencies, testable in isolation.
 */

import * as fs from 'node:fs';

import { normalizeNodeId } from '../utils/node-id.js';
import { extractSectionBody } from '../utils/markdown-sections.js';
import { TOKEN_COLLECTION_PREFIXES } from '../utils/docs-config.js';
import { validateDocs } from '../services/docs-validator.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface CheckResult {
  ok: boolean;
  errors: unknown[];
}

export interface TokenValidityResult extends CheckResult {
  warnings?: unknown[];
}

export interface ConsistencyCheckParams {
  spec: Record<string, unknown>;
  markdownContent: string;
  lookup: {
    byPath: Map<string, unknown>;
    bySlash: Map<string, unknown>;
  };
}

export interface FigmaConsistencyCheckParams {
  spec: Record<string, unknown>;
  markdownContent: string;
}

export interface TokenValidityCheckParams {
  markdownPath: string;
  specPath?: string;
  docsRoot: string;
  registryPath: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize string array from unknown value.
 */
function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

/**
 * Escape regex special characters.
 */
export function escapeRegex(value: string): string {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if text contains whole term (word boundary match).
 */
function containsWholeTerm(haystack: string, term: string): boolean {
  const source = String(haystack || '');
  const needle = String(term || '').trim();
  if (!needle) return false;
  const pattern = new RegExp(
    `(^|[^A-Za-z0-9_])${escapeRegex(needle)}([^A-Za-z0-9_]|$)`,
    'i',
  );
  return pattern.test(source);
}

/**
 * Split comma-separated token values.
 */
function splitSpecTokenValue(raw: string): string[] {
  return String(raw || '')
    .split(',')
    .map((piece) => piece.trim())
    .filter(Boolean);
}

/**
 * Recursively collect token mapping values from spec node.
 */
function collectTokenMappingValues(
  node: unknown,
  bucket: string[] = [],
): string[] {
  if (typeof node === 'string') {
    for (const token of splitSpecTokenValue(node)) bucket.push(token);
    return bucket;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectTokenMappingValues(item, bucket);
    return bucket;
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node))
      collectTokenMappingValues(value, bucket);
  }
  return bucket;
}

/**
 * Resolve all forms of a token (dotted, slash, registry aliases).
 */
function resolveTokenForms(
  token: string,
  lookup: {
    byPath: Map<string, unknown>;
    bySlash: Map<string, unknown>;
  },
): string[] {
  const value = String(token || '').trim();
  if (!value) return [];

  const directByPath = lookup.byPath.get(value);
  const directBySlash = lookup.bySlash.get(value);
  const entry = directByPath || directBySlash;
  if (entry) {
    const forms = [
      String((entry as Record<string, unknown>).path || '').trim(),
      String((entry as Record<string, unknown>).slashPath || '').trim(),
      value,
    ].filter(Boolean);
    return Array.from(new Set(forms));
  }

  if (value.includes('.')) {
    const parts = value.split('.').filter(Boolean);
    const slash =
      parts.length > 1 && TOKEN_COLLECTION_PREFIXES.has(parts[0])
        ? parts.slice(1).join('/')
        : parts.join('/');
    return Array.from(new Set([value, slash].filter(Boolean)));
  }

  if (value.includes('/')) {
    return [value];
  }

  return [value];
}

/**
 * Check if section text includes any token form (code-fenced or bare).
 */
function includesAnyTokenForm(sectionText: string, forms: string[]): boolean {
  const haystack = String(sectionText || '');
  for (const form of forms) {
    if (!form) continue;
    const escaped = escapeRegex(form);
    if (new RegExp(`\`${escaped}\``).test(haystack)) return true;
    if (
      new RegExp(
        `(^|[^A-Za-z0-9_./-])${escaped}([^A-Za-z0-9_./-]|$)`,
        'i',
      ).test(haystack)
    )
      return true;
  }
  return false;
}

// ============================================================================
// Public API - Consistency Checks
// ============================================================================

const TOKEN_CODES = new Set([
  'TOK01',
  'TOK02',
  'TOK03',
  'TOKEN_MISSING',
  'TOKEN_AMBIGUOUS',
  'TOKEN_DEPRECATED',
]);

function loadTokenPathLookups(registryPath: string): {
  dotted: Set<string>;
  slash: Set<string>;
} {
  try {
    const raw = fs.readFileSync(registryPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      entries?: Array<{ path?: string; slashPath?: string }>;
    };
    const dotted = new Set<string>();
    const slash = new Set<string>();
    for (const entry of parsed.entries || []) {
      const dottedPath = String(entry.path || '').trim();
      const slashPath = String(entry.slashPath || '').trim();
      if (dottedPath) dotted.add(dottedPath);
      if (slashPath) slash.add(slashPath);
    }
    return { dotted, slash };
  } catch {
    return { dotted: new Set(), slash: new Set() };
  }
}

function extractSpecTokenCandidates(text: string): string[] {
  const matches = String(text || '').match(
    /[A-Za-z][A-Za-z0-9-]*(?:[./][A-Za-z0-9-]+)+/g,
  );
  if (!matches) return [];
  return [...new Set(matches.map((value) => String(value || '').trim()).filter(Boolean))];
}

function collectSpecTokenFindings(
  filePath: string,
  registryPath: string,
): Array<{ code: string; file: string; message: string; token: string; severity: 'error' }> {
  const { dotted, slash } = loadTokenPathLookups(registryPath);
  const content = fs.readFileSync(filePath, 'utf8');
  const tokens = extractSpecTokenCandidates(content);
  const findings: Array<{ code: string; file: string; message: string; token: string; severity: 'error' }> = [];

  for (const token of tokens) {
    const exists = token.includes('/') ? slash.has(token) : dotted.has(token);
    if (exists) continue;
    findings.push({
      code: 'TOK01',
      file: filePath,
      token,
      severity: 'error',
      message: `Unresolved token reference in component spec: \`${token}\`.`,
    });
  }

  return findings;
}

/**
 * Check spec ↔ markdown consistency.
 *
 * Validates:
 * - Properties defined in spec are documented in markdown Component API
 * - Enum values from spec are documented in markdown
 * - Token mappings from spec are documented in markdown Visual Specifications
 */
export function checkSpecMarkdownConsistency(
  params: ConsistencyCheckParams,
): CheckResult {
  const { spec, markdownContent, lookup } = params;
  const errors: unknown[] = [];
  const componentApi = extractSectionBody(markdownContent, 'Component API');
  const visualSpecs = extractSectionBody(
    markdownContent,
    'Visual Specifications',
  );

  const properties = Array.isArray(spec.properties) ? spec.properties : [];
  for (const property of properties) {
    const name = String(property?.name ?? '').trim();
    if (!name) continue;
    if (!containsWholeTerm(componentApi, name)) {
      errors.push(`Missing property in markdown Component API: \`${name}\`.`);
    }

    const type = String(property?.type ?? '')
      .trim()
      .toLowerCase();
    if (type === 'enum') {
      const values = normalizeStringArray(property?.values);
      for (const value of values) {
        if (!containsWholeTerm(componentApi, value)) {
          errors.push(
            `Missing enum value \`${value}\` for property \`${name}\` in Component API.`,
          );
        }
      }
    }
  }

  const tokenValues = collectTokenMappingValues(spec.token_mapping)
    .map((token) => String(token).trim())
    .filter((token) => token && !/^tbd$/i.test(token));

  for (const token of tokenValues) {
    const forms = resolveTokenForms(token, lookup);
    if (!includesAnyTokenForm(visualSpecs, forms)) {
      errors.push(
        `Token mapping value \`${token}\` from spec is not documented in markdown Visual Specifications.`,
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

/**
 * Check markdown ↔ Figma consistency.
 *
 * Validates:
 * - State values from spec are documented in markdown States section
 */
export function checkMarkdownFigmaConsistency(
  params: FigmaConsistencyCheckParams,
): CheckResult {
  const { spec, markdownContent } = params;
  const errors: unknown[] = [];
  const stateProperty = (
    Array.isArray(spec.properties) ? spec.properties : []
  ).find(
    (property) =>
      String(property?.name || '')
        .trim()
        .toLowerCase() === 'state',
  );
  if (stateProperty) {
    const stateSection = extractSectionBody(markdownContent, 'States');
    const stateValues = normalizeStringArray(stateProperty.values);
    for (const stateValue of stateValues) {
      if (!containsWholeTerm(stateSection, stateValue)) {
        errors.push(
          `State \`${stateValue}\` is defined in spec but missing in markdown \`## States\` section.`,
        );
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

/**
 * Check token validity using docs-validator.
 *
 * Filters validation results to token-related errors only (TOK01, TOK02, TOK03, etc).
 * Pass `specPath` when the caller has a paired spec file and wants the spec checked too.
 */
export function checkTokenValidity(
  params: TokenValidityCheckParams,
): TokenValidityResult {
  const { markdownPath, specPath, docsRoot, registryPath } = params;
  const tokenErrors = [];
  const tokenWarnings = [];

  const collectTokenFindings = (filePath: string): void => {
    const report = validateDocs({
      docsRoot,
      registryPath,
      filePath,
      checkOverview: false,
    });

    tokenErrors.push(
      ...report.errors.filter((finding) =>
        TOKEN_CODES.has(String(finding.code || '')),
      ),
    );
    tokenWarnings.push(
      ...report.warnings.filter((finding) =>
        TOKEN_CODES.has(String(finding.code || '')),
      ),
    );
  };

  collectTokenFindings(markdownPath);
  if (specPath && specPath !== markdownPath) {
    tokenErrors.push(...collectSpecTokenFindings(specPath, registryPath));
  }

  return {
    ok: tokenErrors.length === 0,
    errors: tokenErrors,
    warnings: tokenWarnings,
  };
}
