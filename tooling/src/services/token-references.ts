/**
 * Token Reference Validators
 *
 * Validate token references and fallbacks in markdown content.
 */
import { TOKEN_COLLECTION_PREFIXES } from './docs-config.js';
import type { DocsValidationReport } from './docs-validator-types.js';
import type { MarkdownTable } from '../utils/markdown-table-parser.js';
import { collectMarkdownTables, findHeaderIndex, normalizeCellText, isSeparatorRow } from '../utils/markdown-table-parser.js';

// ============================================================================
// Type Definitions
// ============================================================================

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

interface TokenRef {
  tokenPath: string;
  resolvedAs: string;
  entry: unknown;
}

interface TableRowWithTokens {
  row: { cells: string[]; offset: number };
  tokenRefs: TokenRef[];
}

// ============================================================================
// Constants
// ============================================================================

const DOT_TOKEN_RE = /[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+){1,}/g;
const SLASH_TOKEN_RE = /[A-Za-z][A-Za-z0-9-]*(?:\/[A-Za-z0-9-]+){1,}/g;
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CSS_COLOR_FUNC_RE = /^(?:rgb|rgba|hsl|hsla)\(/i;
const CSS_DIMENSION_RE = /^-?\d+(?:\.\d+)?(?:px|rem|em|%)?$/i;
const TOKEN_COLLECTION_PREFIXES_LOWER = new Set(
  [...TOKEN_COLLECTION_PREFIXES].map((value) => String(value).toLowerCase())
);

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize slash-path token candidates by removing collection prefix.
 */
function normalizeSlashPathCandidate(tokenPath: string): string {
  const parts = tokenPath.split('/');
  const first = String(parts[0] || '').toLowerCase();
  if (parts.length > 1 && TOKEN_COLLECTION_PREFIXES_LOWER.has(first)) {
    return parts.slice(1).join('/');
  }
  return tokenPath;
}

/**
 * Normalize A11y mode paths by removing redundant mode segment.
 */
function normalizeA11yModePath(tokenPath: string): string {
  if (tokenPath.startsWith('A11y.A11y.mode')) {
    return tokenPath.replace(/^A11y\.A11y\.mode[A-Za-z0-9_-]+\./, 'A11y.A11y.');
  }
  if (tokenPath.startsWith('A11y/A11y/mode')) {
    return tokenPath.replace(/^A11y\/A11y\/mode[A-Za-z0-9_-]+\//, 'A11y/A11y/');
  }
  return tokenPath;
}

/**
 * Extract token candidates from a code span.
 */
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

/**
 * Check if a candidate looks like a token path.
 */
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

/**
 * Extract resolved token references from text.
 */
function extractResolvedTokenRefsFromText(
  text: string,
  registryIndexes: RegistryIndexes
): TokenRef[] {
  const refs: TokenRef[] = [];
  const seen = new Set<string>();
  const codeSpanRegex = /`([^`\n]+)`/g;
  let spanMatch: RegExpExecArray | null;

  while ((spanMatch = codeSpanRegex.exec(String(text || ''))) !== null) {
    const span = spanMatch[1];
    const candidates = extractTokenCandidatesFromSpan(span);
    for (const item of candidates) {
      const tokenPath = item.token;
      if (
        !looksLikeTokenPath(
          tokenPath,
          registryIndexes.dotRoots,
          registryIndexes.slashRoots
        )
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

/**
 * Infer the kind of fallback value from token references.
 */
function inferFallbackKind(tokenRefs: TokenRef[]): string {
  const types = new Set(
    tokenRefs
      .map((ref) => String((ref.entry as Record<string, unknown>)?.type || '').trim().toLowerCase())
      .filter(Boolean)
  );
  if (types.size !== 1) return 'generic';
  const onlyType = Array.from(types)[0];
  if (onlyType === 'color') return 'color';
  if (onlyType === 'dimension') return 'dimension';
  return 'generic';
}

/**
 * Normalize a fallback value by removing markdown formatting.
 */
function normalizeFallbackValue(raw: string): string {
  return String(raw || '')
    .replace(/[`*]/g, '')
    .trim()
    .replace(/^[\(\[]+/, '')
    .replace(/[\)\].,:;]+$/, '')
    .trim();
}

/**
 * Check if a fallback value is concrete (not TBD or placeholder).
 */
function hasConcreteFallbackValue(raw: string): boolean {
  const value = normalizeFallbackValue(raw);
  return !!value && !/^tbd$/i.test(value) && !/^[-—]+$/.test(value);
}

/**
 * Check if a fallback value is compatible with the token kind.
 */
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

/**
 * Extract fallback value from a line.
 */
function extractFallbackFromLine(line: string, registryIndexes: RegistryIndexes): string {
  const rawLine = String(line || '');
  if (!rawLine) return '';

  const codeSpanRegex = /`([^`\n]+)`/g;
  const codeSpans: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = codeSpanRegex.exec(rawLine)) !== null) {
    codeSpans.push(match[1]);
  }

  for (const span of codeSpans) {
    const isTokenLike = extractTokenCandidatesFromSpan(span).some((candidate) =>
      looksLikeTokenPath(candidate.token, registryIndexes.dotRoots, registryIndexes.slashRoots)
    );
    if (!isTokenLike && hasConcreteFallbackValue(span)) return span;
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

// ============================================================================
// Public API
// ============================================================================

/**
 * Build registry indexes for token resolution.
 */
export function buildRegistryIndexes(registryObj: Record<string, unknown>): RegistryIndexes {
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

/**
 * Resolve a token candidate against registry indexes.
 */
export function resolveTokenCandidate(
  candidate: string,
  registryIndexes: RegistryIndexes
): TokenResolution {
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

/**
 * Validate token references in markdown content.
 */
export function validateTokenReferences(
  filePath: string,
  content: string,
  registryIndexes: RegistryIndexes,
  report: DocsValidationReport,
  lineStarts: number[],
  lineFromOffset: (starts: number[], offset: number) => number,
  baseOffset: number = 0
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
      if (
        !looksLikeTokenPath(
          tokenPath,
          registryIndexes.dotRoots,
          registryIndexes.slashRoots
        )
      )
        continue;

      const absoluteOffset = baseOffset + spanOffset + item.localOffset;
      const line = lineFromOffset(lineStarts, absoluteOffset);
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

/**
 * Validate token fallbacks in markdown tables and prose.
 */
export function validateTokenFallbacks(
  filePath: string,
  content: string,
  registryIndexes: RegistryIndexes,
  report: DocsValidationReport,
  lineStarts: number[],
  lineFromOffset: (starts: number[], offset: number) => number,
  baseOffset: number = 0
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
        return { row, tokenRefs } as TableRowWithTokens;
      })
      .filter(Boolean) as TableRowWithTokens[];

    if (rowsWithTokenRefs.length === 0) continue;

    const fallbackCol = findHeaderIndex(table.headerCells, 'fallback');
    if (fallbackCol < 0) {
      report.errors.push({
        code: 'TOK02',
        file: filePath,
        line: lineFromOffset(lineStarts, baseOffset + table.headerOffset),
        message: 'Token table must include a `Fallback` column.',
      });
      continue;
    }

    for (const item of rowsWithTokenRefs) {
      const { row, tokenRefs } = item;
      const fallbackCell = row.cells[fallbackCol] || '';
      const line = lineFromOffset(lineStarts, baseOffset + row.offset);

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
