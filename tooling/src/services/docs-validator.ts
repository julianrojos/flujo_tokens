/**
 * Documentation Validator Service
 *
 * Validates documentation integrity, structure, and token references.
 * Full TypeScript implementation (migrated from docs-validator.mjs).
 *
 * @module tooling/src/services/docs-validator
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// Import from existing TypeScript utilities
import { isPlainObject } from '../utils/is-plain-object.js';
import { isTbdMarker } from '../utils/tbd.js';
import {
  componentNameToSnakeCase,
  isSnakeCaseFileSlug,
} from '../utils/component-name.js';
import {
  parseYamlDocument,
  parseMarkdownFrontmatter,
} from '../utils/parse-frontmatter.js';
import {
  FIGMA_NODE_ID_RE,
  normalizeNodeId,
  isValidNodeId,
} from '../utils/figma-node-id.js';
import { resolveSystemContextSafe } from '../utils/system-context.js';

// Import from newly created services
import {
  CANONICAL_H2_ORDER,
  REQUIRED_CANONICAL_H2,
  ALLOWED_DOC_STATUS,
  SPEC_ALLOWED_STATUS,
  COMPONENT_REQUIRED_FIGMA_FRONTMATTER_FIELDS,
  SPEC_REQUIRED_TOP_LEVEL_FIELDS,
  TRACEABILITY_CONTRACT_VERSION,
  TOKEN_COLLECTION_PREFIXES,
} from './docs-config.js';
import { deriveFigmaFrontmatterTraceability } from './figma-traceability.js';
import { extractSectionBody } from './markdown-sections.js';
import {
  SPEC_PROPERTY_ALLOWED_TYPES,
  getSpecPropertyTypeInfo,
  normalizeSpecPropertyType,
  PROPERTY_FIELD_ORDER,
  hasCanonicalPropertyFieldOrder,
} from './spec-property-types.js';
import {
  GAP_TYPE,
  GAP_TYPE_ORDER,
  GAP_ERROR_CODES,
  GAP_CHECK_MESSAGES,
  GAPS_VALIDATION,
  type GapItem,
} from './gaps-contract.js';
import {
  extractGapsFromSpec,
  buildGapsChecklistLines,
  extractGapsSection,
  extractNonEmptySectionLines,
} from './gaps.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface DocsValidatorIssue {
  code: string;
  file: string;
  line?: number;
  message: string;
  severity?: 'error' | 'warning' | 'info';
  details?: unknown;
  suggested?: string;
  expected?: string | string[];
  actual?: string | string[];
  token?: string;
  rule_ids?: string[];
  blocking?: boolean;
}

export interface DocsValidationSummary {
  filesChecked: number;
  specFilesChecked: number;
  tokenRefsChecked: number;
  tokenRefsInvalid: number;
  errors: number;
  warnings: number;
}

export interface DocsValidationGovernance {
  manifestPath: string;
  manifestLoaded: boolean;
}

export interface DocsValidationReport {
  ok: boolean;
  generatedAt: string;
  governance: DocsValidationGovernance;
  summary: DocsValidationSummary;
  errors: DocsValidatorIssue[];
  warnings: DocsValidatorIssue[];
}

export interface DocsValidatorOptions {
  docsRoot?: string;
  specRoot?: string;
  specFilePath?: string;
  registryPath?: string;
  filePath?: string;
  allowExtraH2?: boolean;
  checkPairing?: boolean;
  checkOverview?: boolean;
  checkSpecs?: boolean;
  manifestPath?: string;
}

interface RegistryIndexes {
  keySet: Set<string>;
  lowerMap: Map<string, string>;
  dotRoots: Set<string>;
  slashRoots: Set<string>;
  entriesByKey: Map<string, unknown>;
}

interface TokenResolution {
  ok: boolean;
  resolvedAs?: string;
  suggested?: string;
  message?: string;
}

interface ManifestInfo {
  path: string;
  checks: Record<string, { rule_ids?: string[]; blocking?: boolean }>;
  loaded: boolean;
  error: string | null;
}

interface SpecResolution {
  specPath: string;
  exists: boolean;
  status: string;
  componentSetNodeIdRaw: string;
  componentSetNodeId: string;
  parsed: Record<string, unknown> | null;
  parseError: string | null;
}

interface VisualProofSection {
  hasOverview: boolean;
  hasSection: boolean;
  headingOffset: number;
  body: string;
}

interface MarkdownTable {
  headerCells: string[];
  headerOffset: number;
  rows: { cells: string[]; offset: number }[];
}

// ============================================================================
// Constants
// ============================================================================

const HASH_RE = /^[a-f0-9]{64}$/i;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const CANONICAL_COMPONENT_LIST_HEADING = 'component list';
const OVERVIEW_ENTRY_RE = /^-\s+\[([^\]]+)\]\(([^)]+)\)\s*$/;
const OVERVIEW_TARGET_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*\.md$/;
const DOT_TOKEN_RE = /[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+){1,}/g;
const SLASH_TOKEN_RE = /[A-Za-z][A-Za-z0-9-]*(?:\/[A-Za-z0-9-]+){1,}/g;
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CSS_COLOR_FUNC_RE = /^(?:rgb|rgba|hsl|hsla)\(/i;
const CSS_DIMENSION_RE = /^-?\d+(?:\.\d+)?(?:px|rem|em|%)?$/i;
const TOKEN_COLLECTION_PREFIXES_LOWER = new Set(
  [...TOKEN_COLLECTION_PREFIXES].map((value) => String(value).toLowerCase())
);
const VARIABLE_ID_RE_SOURCE = '\\bVariableID:[A-Za-z0-9:-]+\\b';
const MARKDOWN_LINK_RE = /(?<!!)\[[^\]]*\]\(([^)\n]+)\)/g;
const PLACEHOLDER_PATTERNS = [
  { regex: /\bTODO\b/gi, label: 'TODO' },
  { regex: /\bXXX\b/gi, label: 'XXX' },
  { regex: /\{placeholder\}/gi, label: '{placeholder}' },
  { regex: /<placeholder>/gi, label: '<placeholder>' },
];

const FILE_HASH_CACHE = new Map<string, { digest: string; size: number; mtimeMs: number }>();
const FILE_HASH_CACHE_MAX_ENTRIES = 1_000;
const HEADING_ANCHOR_CACHE = new Map<string, Set<string>>();

// Get system context for default paths (context-aware, supports active system)
const _defaultCtx = resolveSystemContextSafe();
const PROJECT_ROOT = process.cwd();
const DEFAULT_SPEC_COMPONENTS_DIR = path.resolve(PROJECT_ROOT, _defaultCtx.paths.specs);
const DEFAULT_TOKEN_REGISTRY_PATH = path.resolve(PROJECT_ROOT, _defaultCtx.paths.tokenRegistry);
const RULE_MANIFEST_PATH = path.join(PROJECT_ROOT, '.agents', 'rules', '_manifest.yml');

// ============================================================================
// Utility Functions
// ============================================================================

function toCliPath(filePath: string): string {
  const resolved = path.resolve(String(filePath || ''));
  const relative = path.relative(process.cwd(), resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return resolved;
  }
  return relative;
}

function buildTraceabilityRegenerationCommand(paths: {
  markdownPath: string;
  specPath: string;
  registryPath: string;
}): string {
  const specArg = JSON.stringify(toCliPath(paths.specPath));
  const outputArg = JSON.stringify(toCliPath(paths.markdownPath));
  const registryArg = JSON.stringify(toCliPath(paths.registryPath));
  return `npm run ds:component-doc -- --spec-file ${specArg} --output ${outputArg} --registry ${registryArg} --force true`;
}

function sha256FileCached(filePath: string): string {
  const resolved = path.resolve(filePath);
  const stat = fs.statSync(resolved);
  const size = Number(stat.size || 0);
  const mtimeMs = Number(stat.mtimeMs || 0);

  const cached = FILE_HASH_CACHE.get(resolved);
  if (cached && cached.size === size && cached.mtimeMs === mtimeMs && typeof cached.digest === 'string') {
    return cached.digest;
  }

  if (!FILE_HASH_CACHE.has(resolved) && FILE_HASH_CACHE.size >= FILE_HASH_CACHE_MAX_ENTRIES) {
    const firstKey = FILE_HASH_CACHE.keys().next().value;
    if (firstKey) FILE_HASH_CACHE.delete(firstKey);
  }

  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(resolved));
  const digest = hash.digest('hex');
  FILE_HASH_CACHE.set(resolved, { digest, size, mtimeMs });
  return digest;
}

function escapeRegex(value: string): string {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeHeadingText(text: string): string {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeSlashPathCandidate(tokenPath: string): string {
  const parts = tokenPath.split('/');
  const first = String(parts[0] || '').toLowerCase();
  if (parts.length > 1 && TOKEN_COLLECTION_PREFIXES_LOWER.has(first)) {
    return parts.slice(1).join('/');
  }
  return tokenPath;
}

function normalizeA11yModePath(tokenPath: string): string {
  if (tokenPath.startsWith('A11y.A11y.mode')) {
    return tokenPath.replace(/^A11y\.A11y\.mode[A-Za-z0-9_-]+\./, 'A11y.A11y.');
  }
  if (tokenPath.startsWith('A11y/A11y/mode')) {
    return tokenPath.replace(/^A11y\/A11y\/mode[A-Za-z0-9_-]+\//, 'A11y/A11y/');
  }
  return tokenPath;
}

function splitSpecTokenValue(rawValue: string): string[] {
  return String(rawValue || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeFallbackValue(raw: string): string {
  return String(raw || '')
    .replace(/[`*]/g, '')
    .trim()
    .replace(/^[\(\[]+/, '')
    .replace(/[\)\].,:;]+$/, '')
    .trim();
}

function hasConcreteFallbackValue(raw: string): boolean {
  const value = normalizeFallbackValue(raw);
  return !!value && !/^tbd$/i.test(value) && !/^[-—]+$/.test(value);
}

function isFallbackCompatible(raw: string, kind: string): boolean {
  const value = normalizeFallbackValue(raw);
  if (!hasConcreteFallbackValue(value)) return false;

  if (kind === 'color') {
    if (CSS_COLOR_FUNC_RE.test(value)) return true;
    const parts = value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.every(
      (part) => HEX_COLOR_RE.test(part) || /^transparent$/i.test(part)
    );
  }
  if (kind === 'dimension') {
    return CSS_DIMENSION_RE.test(value);
  }

  return true;
}

function normalizeCellText(cell: string): string {
  return String(cell || '').replace(/`/g, '').trim();
}

function isTableLine(line: string): boolean {
  const trimmed = String(line || '').trim();
  if (!trimmed || /^```/.test(trimmed)) return false;
  const pipeCount = (trimmed.match(/\|/g) || []).length;
  return pipeCount >= 1;
}

function parseTableCells(line: string): string[] {
  let trimmed = String(line || '').trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  const cells: string[] = [];
  let current = '';
  let inCode = false;

  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];

    if (ch === '\\') {
      const next = trimmed[i + 1];
      if (next === '|' || next === '\\' || next === '`') {
        current += next;
        i += 1;
        continue;
      }
      current += ch;
      continue;
    }

    if (ch === '`') {
      inCode = !inCode;
      current += ch;
      continue;
    }

    if (ch === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  cells.push(current.trim());
  return cells;
}

function isSeparatorRow(cells: string[]): boolean {
  if (!Array.isArray(cells) || cells.length === 0) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

function normalizeMarkdownAnchor(value: string): string {
  const raw = String(value || '').trim().replace(/^#/, '');
  if (!raw) return '';
  try {
    return decodeURIComponent(raw).trim().toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

function slugifyHeading(text: string): string {
  const normalized = String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[`*_~()[\]{}!?.:,;'"\\/<>@#$%^&+=|]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized;
}

function normalizeLinkTarget(rawTarget: string): string {
  let target = String(rawTarget || '').trim();
  if (!target) return '';
  if (target.startsWith('<') && target.endsWith('>')) {
    target = target.slice(1, -1).trim();
  }
  const whitespaceIndex = target.search(/\s/);
  if (whitespaceIndex > 0) {
    target = target.slice(0, whitespaceIndex).trim();
  }
  return target;
}

function isExternalLinkTarget(target: string): boolean {
  const value = String(target || '').trim();
  if (!value) return false;
  if (value.startsWith('#')) return false;
  if (value.startsWith('//')) return true;
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function resolveInternalLink(filePath: string, target: string): {
  resolvedPath: string;
  anchor: string;
} {
  const hashIndex = target.indexOf('#');
  const pathPart = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
  const anchorPart = hashIndex >= 0 ? target.slice(hashIndex + 1) : '';

  const resolvedPath = pathPart
    ? pathPart.startsWith('/')
      ? path.resolve(process.cwd(), pathPart.slice(1))
      : path.resolve(path.dirname(filePath), pathPart)
    : path.resolve(filePath);

  return {
    resolvedPath,
    anchor: normalizeMarkdownAnchor(anchorPart),
  };
}

function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function lineFromOffset(lineStarts: number[], offset: number): number {
  let left = 0;
  let right = lineStarts.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const start = lineStarts[mid];
    const nextStart = mid + 1 < lineStarts.length ? lineStarts[mid + 1] : Number.MAX_SAFE_INTEGER;
    if (offset >= start && offset < nextStart) return mid + 1;
    if (offset < start) right = mid - 1;
    else left = mid + 1;
  }
  return 1;
}

function collectMarkdownFiles(docsRoot: string, explicitFilePath: string | null): string[] {
  if (explicitFilePath) return [path.resolve(explicitFilePath)];
  if (!fs.existsSync(docsRoot)) return [];
  const files: string[] = [];
  const queue: string[] = [path.resolve(docsRoot)];

  while (queue.length > 0) {
    const currentDir = queue.shift()!;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(absolutePath);
      }
    }
  }

  return files.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

function collectSpecFiles(specRoot: string): string[] {
  if (!fs.existsSync(specRoot)) return [];
  return fs
    .readdirSync(specRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.yml') &&
        entry.name !== '_template.yml'
    )
    .map((entry) => path.join(specRoot, entry.name))
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

// ============================================================================
// Report Creation and Governance
// ============================================================================

function createBaseReport(options: { manifestPath: string }): DocsValidationReport {
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    governance: {
      manifestPath: options.manifestPath,
      manifestLoaded: false,
    },
    summary: {
      filesChecked: 0,
      specFilesChecked: 0,
      tokenRefsChecked: 0,
      tokenRefsInvalid: 0,
      errors: 0,
      warnings: 0,
    },
    errors: [],
    warnings: [],
  };
}

function loadRuleManifest(manifestPath: string): ManifestInfo {
  const resolvedPath = path.resolve(manifestPath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      path: resolvedPath,
      checks: {},
      loaded: false,
      error: null,
    };
  }

  try {
    const parsed = parseYamlDocument<Record<string, unknown>>(
      fs.readFileSync(resolvedPath, 'utf8'),
      `rule manifest (${path.basename(resolvedPath)})`
    );
    const checks = isPlainObject(parsed.checks)
      ? (parsed.checks as Record<string, { rule_ids?: string[]; blocking?: boolean }>)
      : {};
    return {
      path: resolvedPath,
      checks,
      loaded: true,
      error: null,
    };
  } catch (error) {
    return {
      path: resolvedPath,
      checks: {},
      loaded: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function annotateFindingsWithManifest(
  findings: DocsValidatorIssue[],
  manifestChecks: Record<string, { rule_ids?: string[]; blocking?: boolean }>
): void {
  if (!Array.isArray(findings) || findings.length === 0) return;
  for (const finding of findings) {
    const code = String(finding?.code || '').trim();
    if (!code) continue;
    const manifestEntry = manifestChecks[code];
    if (!isPlainObject(manifestEntry)) continue;
    const ruleIds = Array.isArray(manifestEntry.rule_ids)
      ? manifestEntry.rule_ids
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      : [];
    finding.rule_ids = ruleIds;
    if (typeof manifestEntry.blocking === 'boolean') {
      finding.blocking = manifestEntry.blocking;
    }
  }
}

// ============================================================================
// Token Registry Utilities
// ============================================================================

function buildRegistryIndexes(registryObj: Record<string, unknown>): RegistryIndexes {
  const keys = Object.keys(registryObj);
  const keySet = new Set(keys);
  const lowerMap = new Map(keys.map((key) => [key.toLowerCase(), key]));
  const entriesByKey = new Map(keys.map((key) => [key, registryObj[key]]));

  const dotRoots = new Set<string>();
  const slashRoots = new Set<string>();
  for (const key of keys) {
    if (key.includes('.')) dotRoots.add(key.split('.')[0]);
    if (key.includes('/')) slashRoots.add(key.split('/')[0]);
  }

  return { keySet, lowerMap, dotRoots, slashRoots, entriesByKey };
}

function resolveTokenCandidate(candidate: string, registryIndexes: RegistryIndexes): TokenResolution {
  const { keySet, lowerMap } = registryIndexes;
  const variants = new Set<string>();

  variants.add(candidate);
  variants.add(normalizeA11yModePath(candidate));
  variants.add(normalizeSlashPathCandidate(candidate));
  variants.add(normalizeSlashPathCandidate(normalizeA11yModePath(candidate)));

  for (const variant of variants) {
    if (!variant) continue;
    if (keySet.has(variant)) return { ok: true, resolvedAs: variant };
  }

  for (const variant of variants) {
    if (!variant) continue;
    const hit = lowerMap.get(variant.toLowerCase());
    if (hit) {
      return {
        ok: false,
        suggested: hit,
        message: `Token reference has case mismatch: \`${candidate}\` (expected \`${hit}\`).`,
      };
    }
  }

  return {
    ok: false,
    message: `Token reference not found in registry: \`${candidate}\`.`,
  };
}

function looksLikeTokenPath(
  candidate: string,
  dotRoots: Set<string>,
  slashRoots: Set<string>
): boolean {
  if (!candidate) return false;
  if (candidate.includes('/')) {
    const first = candidate.split('/')[0];
    if (slashRoots.has(first)) return true;
    if (TOKEN_COLLECTION_PREFIXES_LOWER.has(String(first || '').toLowerCase())) {
      return true;
    }
    return false;
  }
  if (candidate.includes('.')) {
    const first = candidate.split('.')[0];
    return dotRoots.has(first);
  }
  return false;
}

function extractTokenCandidatesFromSpan(spanText: string): { token: string; localOffset: number }[] {
  const results: { token: string; localOffset: number }[] = [];
  for (const regex of [DOT_TOKEN_RE, SLASH_TOKEN_RE]) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(spanText)) !== null) {
      const token = match[0]?.trim();
      if (token) results.push({ token, localOffset: match.index });
    }
  }
  return results;
}

function extractResolvedTokenRefsFromText(
  text: string,
  registryIndexes: RegistryIndexes
): { tokenPath: string; resolvedAs: string; entry: unknown }[] {
  const refs: { tokenPath: string; resolvedAs: string; entry: unknown }[] = [];
  const seen = new Set<string>();
  const codeSpanRegex = /`([^`\n]+)`/g;
  let spanMatch: RegExpExecArray | null;

  while ((spanMatch = codeSpanRegex.exec(String(text || ''))) !== null) {
    const span = spanMatch[1];
    const candidates = extractTokenCandidatesFromSpan(span);
    for (const item of candidates) {
      const tokenPath = item.token;
      if (
        !looksLikeTokenPath(tokenPath, registryIndexes.dotRoots, registryIndexes.slashRoots)
      )
        continue;
      const resolution = resolveTokenCandidate(tokenPath, registryIndexes);
      if (!resolution.ok || !resolution.resolvedAs) continue;
      const dedupeKey = `${tokenPath}|${resolution.resolvedAs}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      refs.push({
        tokenPath,
        resolvedAs: resolution.resolvedAs,
        entry: registryIndexes.entriesByKey.get(resolution.resolvedAs),
      });
    }
  }

  return refs;
}

function inferFallbackKind(tokenRefs: { entry: unknown }[]): string {
  const types = new Set(
    tokenRefs
      .map((ref) =>
        String((ref.entry as Record<string, unknown>)?.type || '').trim().toLowerCase()
      )
      .filter(Boolean)
  );
  if (types.size !== 1) return 'generic';
  const onlyType = Array.from(types)[0];
  if (onlyType === 'color') return 'color';
  if (onlyType === 'dimension') return 'dimension';
  return 'generic';
}

function extractFallbackFromLine(line: string, _registryIndexes: RegistryIndexes): string {
  const rawLine = String(line || '');
  if (!rawLine) return '';

  const codeSpanRegex = /`([^`\n]+)`/g;
  const codeSpans: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = codeSpanRegex.exec(rawLine)) !== null) {
    codeSpans.push(match[1]);
  }

  for (const span of codeSpans) {
    if (hasConcreteFallbackValue(span)) return span;
  }

  const explicitFallbackMatch = rawLine.match(/fallback[^:]*:\s*([^|]+)$/i);
  if (explicitFallbackMatch && hasConcreteFallbackValue(explicitFallbackMatch[1])) {
    return explicitFallbackMatch[1];
  }

  const parentheticalMatch = rawLine.match(/\(([^)]+)\)/);
  if (parentheticalMatch && hasConcreteFallbackValue(parentheticalMatch[1])) {
    return parentheticalMatch[1];
  }

  return '';
}

function collectMarkdownTables(content: string): MarkdownTable[] {
  const lines = String(content || '').split('\n');
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

  const tables: MarkdownTable[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!isTableLine(lines[i])) {
      i += 1;
      continue;
    }

    let j = i;
    while (j < lines.length && isTableLine(lines[j])) j += 1;
    const blockLength = j - i;

    if (blockLength >= 2) {
      const headerCells = parseTableCells(lines[i]);
      const separatorCells = parseTableCells(lines[i + 1]);
      if (isSeparatorRow(separatorCells)) {
        const rows = [];
        for (let k = i + 2; k < j; k += 1) {
          rows.push({
            cells: parseTableCells(lines[k]),
            offset: lineOffsets[k],
          });
        }
        tables.push({
          headerCells,
          headerOffset: lineOffsets[i],
          rows,
        });
      }
    }

    i = j;
  }

  return tables;
}

function findHeaderIndex(cells: string[], needle: string): number {
  const key = String(needle || '').trim().toLowerCase();
  return cells.findIndex((cell) => normalizeCellText(cell).toLowerCase().includes(key));
}

// ============================================================================
// Spec Reading and Traceability
// ============================================================================

function readComponentSpecByDocPath(
  componentDocPath: string,
  specRoot: string,
  options: { specFilePath?: string } = {}
): SpecResolution {
  const explicitSpecFilePath = options.specFilePath ? path.resolve(options.specFilePath) : '';
  const fileBase = path.basename(componentDocPath, path.extname(componentDocPath));
  const specPath = explicitSpecFilePath || path.join(specRoot, `${fileBase}.yml`);

  if (!fs.existsSync(specPath)) {
    return {
      specPath,
      exists: false,
      status: '',
      componentSetNodeIdRaw: '',
      componentSetNodeId: '',
      parsed: null,
      parseError: null,
    };
  }

  try {
    const parsed = parseYamlDocument<Record<string, unknown>>(
      fs.readFileSync(specPath, 'utf8'),
      `spec YAML (${path.basename(specPath)})`
    );
    const status = String(parsed.status || '').trim().toLowerCase();
    const figma = isPlainObject(parsed.figma) ? (parsed.figma as Record<string, unknown>) : {};
    const componentSetNodeIdRaw = String(figma.component_set_node_id || '').trim();
    return {
      specPath,
      exists: true,
      status,
      componentSetNodeIdRaw,
      componentSetNodeId: normalizeNodeId(componentSetNodeIdRaw),
      parsed,
      parseError: null,
    };
  } catch (error) {
    return {
      specPath,
      exists: true,
      status: '',
      componentSetNodeIdRaw: '',
      componentSetNodeId: '',
      parsed: null,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

function extractVisualProof(rawMarkdown: string): VisualProofSection {
  const overview = getH2SectionRange(rawMarkdown, 'Overview');
  if (!overview) {
    return {
      hasOverview: false,
      hasSection: false,
      headingOffset: -1,
      body: '',
    };
  }

  const visualHeadingRegex = /^###\s+Visual Proof\s*$/m;
  const headingMatch = visualHeadingRegex.exec(overview.body);
  if (!headingMatch) {
    return {
      hasOverview: true,
      hasSection: false,
      headingOffset: overview.headingOffset,
      body: '',
    };
  }

  const absoluteHeadingOffset = overview.headingOffset + headingMatch.index;
  const afterHeadingRaw = overview.body.slice(
    headingMatch.index + headingMatch[0].length
  );
  const afterHeading = afterHeadingRaw.replace(/^\n+/, '');
  const nextH3Match = /^###\s+/m.exec(afterHeading);
  const body = (
    nextH3Match ? afterHeading.slice(0, nextH3Match.index) : afterHeading
  ).trim();

  return {
    hasOverview: true,
    hasSection: true,
    headingOffset: absoluteHeadingOffset,
    body,
  };
}

function getH2SectionRange(
  rawMarkdown: string,
  headingTitle: string
): { headingOffset: number; bodyStart: number; end: number; body: string } | null {
  const raw = String(rawMarkdown || '');
  const headingRegex = new RegExp(`^##\\s+${escapeRegex(headingTitle)}\\s*$`, 'm');
  const headingMatch = headingRegex.exec(raw);
  if (!headingMatch) return null;

  const headingLineEnd = raw.indexOf('\n', headingMatch.index);
  const bodyStart = headingLineEnd === -1 ? raw.length : headingLineEnd + 1;
  const rest = raw.slice(bodyStart);
  const nextHeadingMatch = /^##\s+/m.exec(rest);
  const end = nextHeadingMatch ? bodyStart + nextHeadingMatch.index : raw.length;

  return {
    headingOffset: headingMatch.index,
    bodyStart,
    end,
    body: raw.slice(bodyStart, end),
  };
}

function findDiscrepancyStatuses(rawMarkdown: string): string[] {
  const body = extractSectionBody(rawMarkdown, 'Design–Token Discrepancies');
  if (!body) return [];
  const matches: string[] = [];
  const statusCellRegex = /\|\s*`?(open|accepted|resolved)`?\s*\|/gi;
  let match: RegExpExecArray | null;
  while ((match = statusCellRegex.exec(body)) !== null) {
    matches.push(String(match[1] || '').toLowerCase());
  }
  return matches;
}

// ============================================================================
// Markdown Quality Validators
// ============================================================================

function validateSectionOrder(
  filePath: string,
  content: string,
  report: DocsValidationReport,
  lineStarts: number[],
  lineFromOffsetFn: (starts: number[], offset: number) => number,
  baseOffset: number,
  options: { allowExtraH2: boolean }
): void {
  const allowExtraH2 = Boolean(options.allowExtraH2);
  const headings = collectH2Headings(content);
  const canonicalIndex = new Map(
    CANONICAL_H2_ORDER.map((heading, index) => [normalizeHeadingText(heading), index])
  );
  const firstOccurrence = new Map<string, { heading: string; normalized: string; offset: number }>();
  const duplicateHeadings = new Set<string>();

  for (const heading of headings) {
    if (firstOccurrence.has(heading.normalized)) {
      duplicateHeadings.add(heading.normalized);
      continue;
    }
    firstOccurrence.set(heading.normalized, heading);
  }

  for (const normalizedHeading of duplicateHeadings) {
    const first = firstOccurrence.get(normalizedHeading);
    if (!first) continue;
    report.errors.push({
      code: 'SEC01',
      file: filePath,
      line: lineFromOffsetFn(lineStarts, baseOffset + first.offset),
      message: `Duplicate H2 heading is not allowed: \`## ${first.heading}\`.`,
    });
  }

  for (const required of REQUIRED_CANONICAL_H2) {
    const key = normalizeHeadingText(required);
    const found = firstOccurrence.get(key);
    if (!found) {
      report.errors.push({
        code: 'SEC01',
        file: filePath,
        message: `Missing required H2 heading: \`## ${required}\`.`,
      });
    }
  }

  let previousCanonicalIndex = -1;
  for (const heading of headings) {
    const currentIndex = canonicalIndex.get(heading.normalized);
    if (currentIndex == null) {
      const finding = {
        code: 'SEC02',
        file: filePath,
        line: lineFromOffsetFn(lineStarts, baseOffset + heading.offset),
        message:
          `Unauthorized H2 heading: \`## ${heading.heading}\`. ` +
          `Allowed H2 headings: ${CANONICAL_H2_ORDER.join(', ')}.`,
      };
      if (allowExtraH2) {
        report.warnings.push(finding);
      } else {
        report.errors.push(finding);
      }
      continue;
    }

    if (currentIndex < previousCanonicalIndex) {
      const expectedNext =
        CANONICAL_H2_ORDER[Math.max(previousCanonicalIndex, 0)] ||
        'the previous canonical heading';
      report.errors.push({
        code: 'SEC01',
        file: filePath,
        line: lineFromOffsetFn(lineStarts, baseOffset + heading.offset),
        message:
          `Heading out of canonical order: \`## ${heading.heading}\`. ` +
          `Move it after \`## ${expectedNext}\` according to canonical H2 order.`,
      });
    }
    previousCanonicalIndex = Math.max(previousCanonicalIndex, currentIndex);
  }
}

function collectH2Headings(content: string): { heading: string; normalized: string; offset: number }[] {
  const headings: { heading: string; normalized: string; offset: number }[] = [];
  const regex = /^##\s+(.+?)\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    headings.push({
      heading: match[1].trim(),
      normalized: normalizeHeadingText(match[1]),
      offset: match.index,
    });
  }
  return headings;
}

function validateVariableIds(
  filePath: string,
  rawMarkdown: string,
  report: DocsValidationReport,
  lineStarts: number[],
  lineFromOffsetFn: (starts: number[], offset: number) => number
): void {
  const variableIdRegex = new RegExp(VARIABLE_ID_RE_SOURCE, 'g');
  let match: RegExpExecArray | null;
  while ((match = variableIdRegex.exec(rawMarkdown)) !== null) {
    report.errors.push({
      code: 'TOK03',
      file: filePath,
      line: lineFromOffsetFn(lineStarts, match.index),
      message: `Forbidden Figma variable ID found: \`${match[0]}\`.`,
    });
  }
}

function validateEditorialPlaceholders(
  filePath: string,
  content: string,
  report: DocsValidationReport,
  lineStarts: number[],
  lineFromOffsetFn: (starts: number[], offset: number) => number,
  baseOffset: number
): void {
  const source = String(content || '');
  for (const pattern of PLACEHOLDER_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(source)) !== null) {
      report.errors.push({
        code: 'QLT01',
        file: filePath,
        line: lineFromOffsetFn(lineStarts, baseOffset + match.index),
        message: `Unresolved editorial placeholder marker found: \`${pattern.label}\`.`,
      });
    }
  }
}

function validateInternalLinks(
  filePath: string,
  rawMarkdown: string,
  report: DocsValidationReport,
  lineStarts: number[],
  lineFromOffsetFn: (starts: number[], offset: number) => number
): void {
  let content = String(rawMarkdown || '');
  let contentOffset = 0;
  try {
    const parsed = parseMarkdownFrontmatter(rawMarkdown);
    content = parsed.content;
    contentOffset = String(rawMarkdown || '').length - String(content || '').length;
  } catch {
    content = String(rawMarkdown || '');
    contentOffset = 0;
  }

  MARKDOWN_LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_LINK_RE.exec(content)) !== null) {
    const normalizedTarget = normalizeLinkTarget(match[1]);
    if (!normalizedTarget) continue;
    if (isExternalLinkTarget(normalizedTarget)) continue;

    const line = lineFromOffsetFn(lineStarts, contentOffset + match.index);
    const { resolvedPath, anchor } = resolveInternalLink(filePath, normalizedTarget);

    if (!fs.existsSync(resolvedPath)) {
      report.errors.push({
        code: 'LINK03',
        file: filePath,
        line,
        message: `Internal link target does not exist: \`${normalizedTarget}\`.`,
        suggested: path.relative(process.cwd(), resolvedPath),
      });
      continue;
    }

    if (!anchor) continue;
    if (path.extname(resolvedPath).toLowerCase() !== '.md') continue;

    const anchors = getHeadingAnchorsForFile(resolvedPath);
    if (anchors.has(anchor)) continue;

    report.errors.push({
      code: 'LINK03',
      file: filePath,
      line,
      message: `Internal link anchor is missing in target file: \`${normalizedTarget}\`.`,
      suggested: path.relative(process.cwd(), resolvedPath),
    });
  }
}

function getHeadingAnchorsForFile(filePath: string): Set<string> {
  const resolved = path.resolve(filePath);
  if (HEADING_ANCHOR_CACHE.has(resolved)) {
    return HEADING_ANCHOR_CACHE.get(resolved)!;
  }
  if (!fs.existsSync(resolved)) {
    const empty = new Set<string>();
    HEADING_ANCHOR_CACHE.set(resolved, empty);
    return empty;
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  const anchors = collectHeadingAnchorsFromMarkdown(raw);
  HEADING_ANCHOR_CACHE.set(resolved, anchors);
  return anchors;
}

function collectHeadingAnchorsFromMarkdown(rawMarkdown: string): Set<string> {
  let content = String(rawMarkdown || '');
  try {
    const parsed = parseMarkdownFrontmatter(rawMarkdown);
    content = parsed.content;
  } catch {
    // Fall back to raw markdown when frontmatter parsing fails.
  }

  const headingRegex = /^#{1,6}\s+(.+?)\s*$/gm;
  const counts = new Map<string, number>();
  const anchors = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(content)) !== null) {
    const base = slugifyHeading(match[1]);
    if (!base) continue;
    const count = counts.get(base) || 0;
    const slug = count === 0 ? base : `${base}-${count}`;
    counts.set(base, count + 1);
    anchors.add(slug);
  }
  return anchors;
}

// ============================================================================
// Token Reference Validators
// ============================================================================

function validateTokenReferences(
  filePath: string,
  content: string,
  registryIndexes: RegistryIndexes,
  report: DocsValidationReport,
  lineStarts: number[],
  lineFromOffsetFn: (starts: number[], offset: number) => number,
  baseOffset: number
): void {
  const codeSpanRegex = /`([^`\n]+)`/g;
  let spanMatch: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((spanMatch = codeSpanRegex.exec(content)) !== null) {
    const span = spanMatch[1];
    const spanOffset = spanMatch.index + 1;
    const candidates = extractTokenCandidatesFromSpan(span);

    for (const item of candidates) {
      const tokenPath = item.token;
      if (!looksLikeTokenPath(tokenPath, registryIndexes.dotRoots, registryIndexes.slashRoots))
        continue;

      const absoluteOffset = baseOffset + spanOffset + item.localOffset;
      const line = lineFromOffsetFn(lineStarts, absoluteOffset);
      const dedupeKey = `${tokenPath}@${line}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      report.summary.tokenRefsChecked += 1;
      const resolution = resolveTokenCandidate(tokenPath, registryIndexes);
      if (!resolution.ok) {
        report.summary.tokenRefsInvalid += 1;
        report.errors.push({
          code: 'TOK01',
          file: filePath,
          line,
          token: tokenPath,
          message: resolution.message || 'Token reference invalid.',
          suggested: resolution.suggested,
        });
      }
    }
  }
}

function validateTokenFallbacks(
  filePath: string,
  content: string,
  registryIndexes: RegistryIndexes,
  report: DocsValidationReport,
  lineStarts: number[],
  lineFromOffsetFn: (starts: number[], offset: number) => number,
  baseOffset: number
): void {
  const tables = collectMarkdownTables(content);
  for (const table of tables) {
    const tokenCol = findHeaderIndex(table.headerCells, 'token');
    if (tokenCol < 0) continue;

    const rowsWithTokenRefs = table.rows
      .map((row) => {
        const tokenCell = row.cells[tokenCol] || '';
        if (/^`?tbd`?$/i.test(normalizeCellText(tokenCell))) return null;
        const tokenRefs = extractResolvedTokenRefsFromText(tokenCell, registryIndexes);
        if (tokenRefs.length === 0) return null;
        return { row, tokenRefs };
      })
      .filter(Boolean) as { row: { cells: string[]; offset: number }; tokenRefs: { entry: unknown }[] }[];

    if (rowsWithTokenRefs.length === 0) continue;

    const fallbackCol = findHeaderIndex(table.headerCells, 'fallback');
    if (fallbackCol < 0) {
      report.errors.push({
        code: 'TOK02',
        file: filePath,
        line: lineFromOffsetFn(lineStarts, baseOffset + table.headerOffset),
        message: 'Token table must include a `Fallback` column.',
      });
      continue;
    }

    for (const item of rowsWithTokenRefs) {
      const { row, tokenRefs } = item;
      const fallbackCell = row.cells[fallbackCol] || '';
      const line = lineFromOffsetFn(lineStarts, baseOffset + row.offset);

      if (!hasConcreteFallbackValue(fallbackCell)) {
        report.errors.push({
          code: 'TOK02',
          file: filePath,
          line,
          message: 'Token reference row is missing fallback value in `Fallback` column.',
        });
        continue;
      }

      const fallbackKind = inferFallbackKind(tokenRefs);
      if (!isFallbackCompatible(fallbackCell, fallbackKind)) {
        const expected =
          fallbackKind === 'color'
            ? 'a concrete color fallback (hex/rgb/hsl)'
            : fallbackKind === 'dimension'
              ? 'a concrete dimension fallback (px/rem/number)'
              : 'a concrete fallback value';
        report.errors.push({
          code: 'TOK02',
          file: filePath,
          line,
          message: `Fallback is present but not valid for token type; expected ${expected}.`,
        });
      }
    }
  }
}

// ============================================================================
// Figma Traceability Validators
// ============================================================================

function validateMarkdownTraceabilityNodeId(
  filePath: string,
  frontmatter: Record<string, unknown>,
  specRoot: string,
  report: DocsValidationReport,
  specResolution: { specFilePath?: string }
): void {
  const figma = isPlainObject(frontmatter.figma) ? (frontmatter.figma as Record<string, unknown>) : {};
  const markdownNodeIdRaw = String(figma.component_set_node_id || '').trim();
  if (!markdownNodeIdRaw) return;

  if (isTbdMarker(markdownNodeIdRaw)) {
    report.errors.push({
      code: 'TRACE01',
      file: filePath,
      message: 'Frontmatter figma.component_set_node_id must not be `TBD` when declared.',
    });
    return;
  }

  const markdownNodeId = normalizeNodeId(markdownNodeIdRaw);
  if (!isValidNodeId(markdownNodeId)) {
    report.errors.push({
      code: 'TRACE01',
      file: filePath,
      message: 'Frontmatter figma.component_set_node_id must use Figma node-id format `123:456`.',
    });
    return;
  }

  const spec = readComponentSpecByDocPath(filePath, specRoot, specResolution);
  if (!spec.exists) {
    report.errors.push({
      code: 'TRACE01',
      file: filePath,
      message:
        'Traceability mismatch: markdown declares figma.component_set_node_id but linked spec file is missing.',
      suggested: path.relative(process.cwd(), spec.specPath),
    });
    return;
  }

  if (spec.parseError) {
    report.errors.push({
      code: 'TRACE01',
      file: filePath,
      message: `Linked spec cannot be parsed for traceability check: ${spec.parseError}`,
      suggested: path.relative(process.cwd(), spec.specPath),
    });
    return;
  }

  if (!spec.componentSetNodeIdRaw || isTbdMarker(spec.componentSetNodeIdRaw)) {
    report.errors.push({
      code: 'TRACE01',
      file: filePath,
      message:
        'Traceability mismatch: markdown has figma.component_set_node_id but spec does not declare a concrete figma.component_set_node_id.',
      suggested: path.relative(process.cwd(), spec.specPath),
    });
    return;
  }

  if (spec.componentSetNodeId !== markdownNodeId) {
    report.errors.push({
      code: 'TRACE01',
      file: filePath,
      message:
        `Traceability mismatch: markdown figma.component_set_node_id (${markdownNodeId}) ` +
        `differs from spec value (${spec.componentSetNodeId}).`,
      suggested: path.relative(process.cwd(), spec.specPath),
    });
  }
}

function validateGeneratedTraceability(
  filePath: string,
  frontmatter: Record<string, unknown>,
  specRoot: string,
  registryPath: string,
  report: DocsValidationReport,
  lineStarts: number[],
  lineFromOffsetFn: (starts: number[], offset: number) => number,
  specResolution: { specFilePath?: string }
): void {
  const spec = readComponentSpecByDocPath(filePath, specRoot, specResolution);
  if (!spec.exists || spec.parseError) return;
  const regenerateCommand = buildTraceabilityRegenerationCommand({
    markdownPath: filePath,
    specPath: spec.specPath,
    registryPath,
  });

  const pipeline = isPlainObject(frontmatter.pipeline)
    ? (frontmatter.pipeline as Record<string, unknown>)
    : null;
  const dsDoc =
    pipeline && isPlainObject(pipeline.ds_component_doc)
      ? (pipeline.ds_component_doc as Record<string, unknown>)
      : null;
  if (!dsDoc) {
    report.errors.push({
      code: 'TRACE02',
      file: filePath,
      message:
        'Missing frontmatter `pipeline.ds_component_doc` traceability block. Regenerate markdown using the suggested command.',
      suggested: regenerateCommand,
    });
    return;
  }

  const contractVersion = String(dsDoc.contract_version || '').trim();
  if (contractVersion !== TRACEABILITY_CONTRACT_VERSION) {
    report.errors.push({
      code: 'TRACE02',
      file: filePath,
      message:
        `Unsupported traceability contract version: \`${contractVersion || '<missing>'}\`. ` +
        `Expected \`${TRACEABILITY_CONTRACT_VERSION}\`. Regenerate markdown using the suggested command.`,
      suggested: regenerateCommand,
    });
  }

  const expected = {
    spec_sha256: sha256FileCached(spec.specPath),
    token_registry_sha256: sha256FileCached(registryPath),
  };

  for (const [field, expectedValue] of Object.entries(expected)) {
    const actualValue = String((dsDoc as Record<string, unknown>)[field] || '').trim();
    if (!actualValue) {
      report.errors.push({
        code: 'TRACE02',
        file: filePath,
        message:
          `Missing frontmatter traceability field: pipeline.ds_component_doc.${field}. ` +
          'Regenerate markdown using the suggested command.',
        suggested: regenerateCommand,
      });
      continue;
    }
    if (!HASH_RE.test(actualValue)) {
      report.errors.push({
        code: 'TRACE02',
        file: filePath,
        message:
          `Invalid hash format in pipeline.ds_component_doc.${field}; expected a 64-char sha256 hex string. ` +
          'Regenerate markdown using the suggested command.',
        suggested: regenerateCommand,
      });
      continue;
    }
    if (expectedValue && actualValue !== expectedValue) {
      report.errors.push({
        code: 'TRACE02',
        file: filePath,
        message: `Traceability drift in pipeline.ds_component_doc.${field}. Regenerate markdown using the suggested command.`,
        expected: expectedValue,
        actual: actualValue,
        suggested: regenerateCommand,
      });
    }
  }

  const figma = isPlainObject(frontmatter.figma) ? (frontmatter.figma as Record<string, unknown>) : {};
  const expectedFigma = deriveFigmaFrontmatterTraceability(spec.parsed);

  const componentHash = String(figma.component_hash || '').trim();
  if (componentHash && componentHash !== expectedFigma.componentHash) {
    report.errors.push({
      code: 'TRACE03',
      file: filePath,
      message:
        'Traceability drift in figma.component_hash. Regenerate markdown using the suggested command.',
      expected: expectedFigma.componentHash,
      actual: componentHash,
      suggested: regenerateCommand,
    });
  }
}

function validateReadyLifecycleConsistency(
  filePath: string,
  rawMarkdown: string,
  frontmatter: Record<string, unknown>,
  specRoot: string,
  report: DocsValidationReport,
  lineStarts: number[],
  lineFromOffsetFn: (starts: number[], offset: number) => number,
  specResolution: { specFilePath?: string }
): void {
  const docStatus = String(frontmatter.doc_status || '').trim().toLowerCase();
  const figma = isPlainObject(frontmatter.figma) ? (frontmatter.figma as Record<string, unknown>) : {};
  const lastVerified = String(figma.last_verified || '').trim();
  const spec = readComponentSpecByDocPath(filePath, specRoot, specResolution);
  const specStatus = String(spec.status || '').trim().toLowerCase();

  if (docStatus === 'ready') {
    if (!spec.exists) {
      report.errors.push({
        code: 'READY01',
        file: filePath,
        message: 'Component markdown is `ready` but linked spec file is missing.',
        suggested: path.relative(process.cwd(), spec.specPath),
      });
      return;
    }
    if (spec.parseError) {
      report.errors.push({
        code: 'READY01',
        file: filePath,
        message: 'Component markdown is `ready` but linked spec could not be parsed.',
        suggested: path.relative(process.cwd(), spec.specPath),
      });
      return;
    }
    if (specStatus !== 'ready') {
      report.errors.push({
        code: 'READY01',
        file: filePath,
        message: `Component markdown is \`ready\` but spec status is \`${specStatus || 'missing'}\`.`,
        suggested: path.relative(process.cwd(), spec.specPath),
      });
    }
    if (!lastVerified || isTbdMarker(lastVerified)) {
      report.errors.push({
        code: 'READY01',
        file: filePath,
        message: 'Component markdown is `ready` but figma.last_verified is missing or `TBD`.',
      });
    }
    if (/\bTBD\b/i.test(rawMarkdown)) {
      report.errors.push({
        code: 'READY01',
        file: filePath,
        message: 'Component markdown is `ready` but still contains `TBD` markers.',
      });
    }
    const discrepancyStatuses = findDiscrepancyStatuses(rawMarkdown);
    if (discrepancyStatuses.some((status) => status === 'open' || status === 'accepted')) {
      report.errors.push({
        code: 'READY01',
        file: filePath,
        line: lineFromOffsetFn(
          lineStarts,
          rawMarkdown.indexOf('## Design–Token Discrepancies')
        ),
        message:
          'Component markdown is `ready` but has unresolved Design–Token Discrepancies (`open` or `accepted`).',
      });
    }
  }

  if (spec.exists && !spec.parseError && specStatus === 'ready' && docStatus !== 'ready') {
    report.errors.push({
      code: 'READY01',
      file: filePath,
      message: `Spec status is \`ready\` but component markdown doc_status is \`${docStatus || 'missing'}\`.`,
      suggested: path.relative(process.cwd(), spec.specPath),
    });
  }
}

function validateVisualProofSection(
  filePath: string,
  rawMarkdown: string,
  frontmatter: Record<string, unknown>,
  report: DocsValidationReport,
  lineStarts: number[],
  lineFromOffsetFn: (starts: number[], offset: number) => number
): void {
  const docStatus = String(frontmatter.doc_status || '').trim().toLowerCase();
  if (docStatus !== 'ready') return;

  const visualProof = extractVisualProof(rawMarkdown);
  const fallbackOffset = visualProof.headingOffset >= 0 ? visualProof.headingOffset : 0;

  if (!visualProof.hasOverview || !visualProof.hasSection) {
    report.errors.push({
      code: 'VIS01',
      file: filePath,
      line: lineFromOffsetFn(lineStarts, fallbackOffset),
      message: 'Component markdown is `ready` but missing `### Visual Proof` under `## Overview`.',
    });
    return;
  }

  if (/\bTBD\b/i.test(visualProof.body)) {
    report.errors.push({
      code: 'VIS01',
      file: filePath,
      line: lineFromOffsetFn(lineStarts, fallbackOffset),
      message: 'Component markdown is `ready` but `### Visual Proof` still contains `TBD`.',
    });
  }

  const hasHttpScreenshotLink = /\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/i.test(visualProof.body);
  const hasLocalProofImage = /!\[[^\]]*\]\((?:\.\.?\/|docs\/)[^)]+visual-proofs\/images\/[^)\s]+\)/i.test(
    visualProof.body
  );

  if (!hasHttpScreenshotLink && !hasLocalProofImage) {
    report.errors.push({
      code: 'VIS01',
      file: filePath,
      line: lineFromOffsetFn(lineStarts, fallbackOffset),
      message:
        'Component markdown is `ready` but `### Visual Proof` has no concrete screenshot reference (URL or local image).',
    });
  }
}

// ============================================================================
// Gaps Section Validator
// ============================================================================

function validateGapsSectionContract(
  filePath: string,
  rawMarkdown: string,
  specRoot: string,
  registry: Record<string, unknown>,
  report: DocsValidationReport,
  lineStarts: number[],
  lineFromOffsetFn: (starts: number[], offset: number) => number,
  specResolution: { specFilePath?: string }
): void {
  const spec = readComponentSpecByDocPath(filePath, specRoot, specResolution);
  const section = extractGapsSection(rawMarkdown);

  if (!spec.exists) {
    if (section) {
      report.warnings.push({
        code: GAP_ERROR_CODES.GAP00,
        file: filePath,
        line: section ? lineFromOffsetFn(lineStarts, section.start) : undefined,
        message: GAP_CHECK_MESSAGES.GAP00,
      });
    }
    return;
  }

  if (spec.parseError || !spec.parsed) {
    report.errors.push({
      code: GAP_ERROR_CODES.GAP01,
      file: filePath,
      message: `${GAP_CHECK_MESSAGES.GAP01_spec_parse_error}: ${spec.parseError}`,
      suggested: path.relative(process.cwd(), spec.specPath),
    });
    return;
  }

  const gaps = extractGapsFromSpec({ spec: spec.parsed, registry });
  const expectedLines = buildGapsChecklistLines(gaps);
  const hasReadyStatusWithGaps = spec.status === 'ready' && gaps.length > 0;
  const readyStatusWithGapsNote = hasReadyStatusWithGaps ? GAP_CHECK_MESSAGES.GAP02_note : '';

  if (hasReadyStatusWithGaps) {
    report.errors.push({
      code: GAP_ERROR_CODES.GAP02,
      file: spec.specPath,
      message: GAP_CHECK_MESSAGES.GAP02_ready_with_gaps,
    });
  }

  if (expectedLines.length === 0) {
    if (!section) return;
    report.errors.push({
      code: GAP_ERROR_CODES.GAP01,
      file: filePath,
      line: lineFromOffsetFn(lineStarts, section.start),
      message: GAP_CHECK_MESSAGES.GAP01_section_not_needed,
    });
    return;
  }

  if (!section) {
    report.errors.push({
      code: GAP_ERROR_CODES.GAP01,
      file: filePath,
      message: `${GAP_CHECK_MESSAGES.GAP01_section_missing}${readyStatusWithGapsNote}`,
    });
    return;
  }

  const rawSectionLines = extractNonEmptySectionLines(section.body);
  if (rawSectionLines.length === 0) {
    report.errors.push({
      code: GAP_ERROR_CODES.GAP01,
      file: filePath,
      line: lineFromOffsetFn(lineStarts, section.start),
      message: `${GAP_CHECK_MESSAGES.GAP01_section_empty}${readyStatusWithGapsNote}`,
    });
    return;
  }

  const invalidLine = rawSectionLines.find(
    (line) => !GAPS_VALIDATION.checkboxFormatRegex.test(line)
  );
  if (invalidLine) {
    report.errors.push({
      code: GAP_ERROR_CODES.GAP01,
      file: filePath,
      line: lineFromOffsetFn(lineStarts, section.start),
      message: `${GAP_CHECK_MESSAGES.GAP01_invalid_item_format}${readyStatusWithGapsNote}`,
      details: invalidLine,
    });
    return;
  }

  const actualLines = rawSectionLines;
  const sameLength = actualLines.length === expectedLines.length;
  const sameOrder = sameLength && actualLines.every((line, index) => line === expectedLines[index]);
  if (sameOrder) return;

  report.errors.push({
    code: GAP_ERROR_CODES.GAP01,
    file: filePath,
    line: lineFromOffsetFn(lineStarts, section.start),
    message: `${GAP_CHECK_MESSAGES.GAP01_content_mismatch}${readyStatusWithGapsNote}`,
    expected: expectedLines,
    actual: actualLines,
  });
}

// ============================================================================
// Main validateDocs Export
// ============================================================================

/**
 * Validates documentation integrity, structure, and token references.
 *
 * @param options - Validation options
 * @returns Validation report with errors, warnings, and summary
 */
export function validateDocs(options: DocsValidatorOptions = {}): DocsValidationReport {
  // Use system context for default paths (context-aware, supports active system)
  const ctx = resolveSystemContextSafe();
  const docsRoot = path.resolve(options.docsRoot || ctx.paths.docs);
  const specRoot = path.resolve(options.specRoot || ctx.paths.specs);
  const explicitSpecFilePath = options.specFilePath ? path.resolve(options.specFilePath) : null;
  const registryPath = path.resolve(options.registryPath || ctx.paths.tokenRegistry);
  const explicitFilePath = options.filePath ? path.resolve(options.filePath) : null;
  const allowExtraH2 = options.allowExtraH2 === true;
  const checkPairing = options.checkPairing !== false;
  const checkOverview = explicitFilePath ? false : options.checkOverview !== false;
  const checkSpecs =
    options.checkSpecs !== false && (!explicitFilePath || Boolean(explicitSpecFilePath));

  const report = createBaseReport({ manifestPath: RULE_MANIFEST_PATH });
  const manifestInfo = loadRuleManifest(options.manifestPath || RULE_MANIFEST_PATH);
  report.governance.manifestPath = manifestInfo.path;
  report.governance.manifestLoaded = manifestInfo.loaded;
  if (manifestInfo.error) {
    report.errors.push({
      code: 'GOV01',
      file: manifestInfo.path,
      message: `Failed to parse rule manifest: ${manifestInfo.error}`,
    });
  }

  let registry: Record<string, unknown>;
  try {
    const raw = fs.readFileSync(registryPath, 'utf8');
    const parsed = JSON.parse(raw);
    
    // Normalize registry structure: support both legacy and new indexed format
    // New format: { entries: [...], byPath: {...}, bySlashPath: {...} }
    // Legacy format: [{ path, ... }, ...] or direct Record<string, entry>
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (Array.isArray(parsed.entries) && parsed.byPath) {
        // New indexed format: merge byPath and bySlashPath
        registry = { ...parsed.byPath, ...parsed.bySlashPath };
      } else {
        // Already a Record or legacy format
        registry = parsed as Record<string, unknown>;
      }
    } else if (Array.isArray(parsed)) {
      // Legacy array format: convert to Record
      registry = Object.fromEntries(
        parsed
          .filter((entry: Record<string, unknown>) => entry && typeof entry === 'object')
          .map((entry: Record<string, unknown>) => {
            const pathKey = String(entry.path || '').trim();
            const slashKey = String(entry.slashPath || '').trim();
            return pathKey ? [pathKey, entry] : slashKey ? [slashKey, entry] : null;
          })
          .filter(Boolean) as Array<[string, Record<string, unknown>]>
      );
    } else {
      registry = parsed as Record<string, unknown>;
    }
  } catch (error) {
    report.errors.push({
      code: 'REG01',
      file: registryPath,
      message:
        `${error instanceof Error ? error.message : String(error)}. ` +
        'Run `npm run generate:registry` before validating docs.',
    });
    report.ok = false;
    report.summary.errors = report.errors.length;
    return report;
  }

  const registryIndexes = buildRegistryIndexes(registry);
  const markdownFiles = collectMarkdownFiles(docsRoot, explicitFilePath);
  const overviewFiles = markdownFiles.filter(
    (filePath) => path.basename(filePath) === 'overview.md'
  );
  const componentFiles: string[] = [];

  const specResolution: { specFilePath?: string } =
    explicitFilePath && explicitSpecFilePath ? { specFilePath: explicitSpecFilePath } : {};

  // Process each markdown file
  for (const filePath of markdownFiles) {
    if (!fs.existsSync(filePath)) {
      report.errors.push({
        code: 'DOC01',
        file: filePath,
        message: 'Markdown file not found.',
      });
      continue;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const lineStarts = buildLineStarts(raw);
    let frontmatter: Record<string, unknown> = {};
    let content = raw;
    try {
      const parsed = parseMarkdownFrontmatter(raw);
      frontmatter = parsed.frontmatter as Record<string, unknown>;
      content = parsed.content;
    } catch (error) {
      report.errors.push({
        code: 'FM01',
        file: filePath,
        message: `Invalid markdown frontmatter: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    const contentOffset = raw.length - content.length;
    const isOverview = path.basename(filePath) === 'overview.md';

    report.summary.filesChecked += 1;
    if (isOverview) {
      // Validate overview frontmatter
      const docType = String(frontmatter.doc_type || '').trim();
      if (docType !== 'overview') {
        report.errors.push({
          code: 'FM01',
          file: filePath,
          message: 'Frontmatter must include `doc_type: overview`.',
        });
      }
      const status = String(frontmatter.doc_status || '').trim();
      if (!ALLOWED_DOC_STATUS.has(status)) {
        report.errors.push({
          code: 'FM02',
          file: filePath,
          message: 'Frontmatter `doc_status` must be one of: draft, ready, needs-review.',
        });
      }
      continue;
    }

    const docType = String(frontmatter.doc_type || '').trim().toLowerCase();
    const treatAsComponent = docType === 'component' || !docType;

    if (treatAsComponent) {
      componentFiles.push(filePath);

      // Validate component frontmatter
      if (frontmatter.doc_type !== 'component') {
        report.errors.push({
          code: 'FM01',
          file: filePath,
          message: 'Frontmatter must include `doc_type: component`.',
        });
      }

      const status = String(frontmatter.doc_status || '').trim();
      if (!ALLOWED_DOC_STATUS.has(status)) {
        report.errors.push({
          code: 'FM02',
          file: filePath,
          message: 'Frontmatter `doc_status` must be one of: draft, ready, needs-review.',
        });
      }

      // Validate figma frontmatter
      const figma = frontmatter.figma;
      if (!figma || typeof figma !== 'object' || Array.isArray(figma)) {
        report.errors.push({
          code: 'FM01',
          file: filePath,
          message: 'Frontmatter `figma` object is required.',
        });
      } else {
        for (const field of COMPONENT_REQUIRED_FIGMA_FRONTMATTER_FIELDS) {
          const value = String((figma as Record<string, unknown>)[field] ?? '').trim();
          if (!value) {
            report.errors.push({
              code: 'FM01',
              file: filePath,
              message: `Frontmatter figma.${field} is required.`,
            });
          }
        }

        const componentHash = String(
          (figma as Record<string, unknown>).component_hash ?? ''
        ).trim();
        if (componentHash && (isTbdMarker(componentHash) || !HASH_RE.test(componentHash))) {
          report.errors.push({
            code: 'FM01',
            file: filePath,
            message:
              'Frontmatter figma.component_hash must be a 64-char sha256 hex string when declared.',
          });
        }
      }

      // Validate section order
      validateSectionOrder(
        filePath,
        content,
        report,
        lineStarts,
        lineFromOffset,
        contentOffset,
        { allowExtraH2 }
      );

      // Validate variable IDs
      validateVariableIds(filePath, raw, report, lineStarts, lineFromOffset);

      // Validate editorial placeholders
      validateEditorialPlaceholders(
        filePath,
        content,
        report,
        lineStarts,
        lineFromOffset,
        contentOffset
      );

      // Validate internal links
      validateInternalLinks(filePath, raw, report, lineStarts, lineFromOffset);

      // Validate token references
      validateTokenReferences(
        filePath,
        content,
        registryIndexes,
        report,
        lineStarts,
        lineFromOffset,
        contentOffset
      );

      // Validate token fallbacks
      validateTokenFallbacks(
        filePath,
        content,
        registryIndexes,
        report,
        lineStarts,
        lineFromOffset,
        contentOffset
      );

      // Validate gaps section contract
      validateGapsSectionContract(
        filePath,
        raw,
        specRoot,
        registry,
        report,
        lineStarts,
        lineFromOffset,
        specResolution
      );

      // Validate visual proof section
      validateVisualProofSection(
        filePath,
        raw,
        frontmatter,
        report,
        lineStarts,
        lineFromOffset
      );

      // Validate traceability node ID
      validateMarkdownTraceabilityNodeId(
        filePath,
        frontmatter,
        specRoot,
        report,
        specResolution
      );

      // Validate generated traceability
      validateGeneratedTraceability(
        filePath,
        frontmatter,
        specRoot,
        registryPath,
        report,
        lineStarts,
        lineFromOffset,
        specResolution
      );

      // Validate ready lifecycle consistency
      validateReadyLifecycleConsistency(
        filePath,
        raw,
        frontmatter,
        specRoot,
        report,
        lineStarts,
        lineFromOffset,
        specResolution
      );
    } else {
      // Validate workflow/foundation frontmatter
      const allowed = new Set(['workflow', 'foundation']);
      if (!allowed.has(docType)) {
        report.errors.push({
          code: 'FM01',
          file: filePath,
          message:
            'Frontmatter `doc_type` must be `component`, `overview`, `foundation`, or `workflow`.',
        });
      }
    }
  }

  // Validate spec-markdown pairing
  if (checkPairing) {
    const componentSet = new Set(componentFiles.map((filePath) => path.resolve(filePath)));
    const specFilesForPairing = explicitSpecFilePath
      ? [path.resolve(explicitSpecFilePath)]
      : checkSpecs
        ? collectSpecFiles(specRoot)
        : [];

    for (const componentFile of componentFiles) {
      const slug = path.basename(componentFile, path.extname(componentFile));
      const expectedSpecPath = path.resolve(specRoot, `${slug}.yml`);
      if (fs.existsSync(expectedSpecPath)) continue;
      report.errors.push({
        code: 'PAIR01',
        file: componentFile,
        message:
          'Component markdown must have a matching spec YAML file: ' +
          `${path.relative(process.cwd(), expectedSpecPath)}.`,
      });
    }

    for (const specFile of specFilesForPairing) {
      const slug = path.basename(specFile, path.extname(specFile));
      const expectedMarkdownPath = path.resolve(docsRoot, `${slug}.md`);
      if (componentSet.has(expectedMarkdownPath) || fs.existsSync(expectedMarkdownPath)) continue;
      report.errors.push({
        code: 'PAIR01',
        file: specFile,
        message:
          'Component spec YAML must have a matching markdown file: ' +
          `${path.relative(process.cwd(), expectedMarkdownPath)}.`,
      });
    }
  }

  // Validate spec YAML files
  if (checkSpecs) {
    const files = explicitSpecFilePath
      ? [path.resolve(explicitSpecFilePath)]
      : collectSpecFiles(specRoot);

    for (const filePath of files) {
      if (!fs.existsSync(filePath)) {
        report.errors.push({
          code: 'SPEC01',
          file: filePath,
          message: 'Spec YAML file not found.',
        });
        continue;
      }
      report.summary.specFilesChecked += 1;

      // Parse and validate spec
      let parsed: Record<string, unknown>;
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        parsed = parseYamlDocument<Record<string, unknown>>(
          raw,
          `spec YAML (${path.basename(filePath)})`
        );
      } catch (error) {
        report.errors.push({
          code: 'SPEC01',
          file: filePath,
          message: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      // Check required fields
      for (const field of SPEC_REQUIRED_TOP_LEVEL_FIELDS) {
        if (!(field in parsed)) {
          report.errors.push({
            code: 'SPEC01',
            file: filePath,
            message: `Missing required top-level field: \`${field}\`.`,
          });
        }
      }

      // Validate status
      const status = String(parsed.status || '').trim();
      if (!SPEC_ALLOWED_STATUS.has(status)) {
        report.errors.push({
          code: 'SPEC01',
          file: filePath,
          message: 'Field `status` must be one of: draft, ready.',
        });
      }

      // Validate filename
      const specBase = path.basename(filePath, path.extname(filePath));
      if (!isSnakeCaseFileSlug(specBase)) {
        const suggestedBase = componentNameToSnakeCase(specBase);
        const suggestedPath = suggestedBase
          ? path.join(path.dirname(filePath), `${suggestedBase}.yml`)
          : null;
        report.errors.push({
          code: 'NAME01',
          file: filePath,
          message: 'Component spec filename must be snake_case (example: `status_bar.yml`).',
          suggested: suggestedPath
            ? path.relative(process.cwd(), suggestedPath)
            : undefined,
        });
      }
    }
  }

  // Annotate findings with manifest
  annotateFindingsWithManifest(report.errors, manifestInfo.checks);
  annotateFindingsWithManifest(report.warnings, manifestInfo.checks);

  report.summary.errors = report.errors.length;
  report.summary.warnings = report.warnings.length;
  report.ok = report.summary.errors === 0;
  return report;
}

/**
 * Re-export for backwards compatibility.
 */
export { validateDocs as validateDocsJs };
