/**
 * Gaps Extraction Utilities
 *
 * Extract and validate gaps from component spec content.
 */

import { isPlainObject } from '../utils/is-plain-object.js';
import {
  GAP_TYPE,
  GAP_TYPE_ORDER,
  classifyGapType,
  isGapMarker,
  type GapItem,
} from './gaps-contract.js';

const TOKEN_COLLECTION_PREFIXES = new Set([
  'Primitives',
  'Semantic',
  'Components',
  'A11y',
  'Aliases',
]);

const TOKEN_COLLECTION_PREFIXES_LOWER = new Set(
  [...TOKEN_COLLECTION_PREFIXES].map((value) => String(value).toLowerCase())
);

/**
 * Normalize a token path candidate.
 */
function normalizeTokenPathCandidate(tokenPath: string): string {
  const raw = String(tokenPath || '').trim();
  if (!raw) return raw;

  let normalized = raw;
  if (normalized.includes('/')) {
    const parts = normalized.split('/');
    const first = String(parts[0] || '').toLowerCase();
    if (parts.length > 1 && TOKEN_COLLECTION_PREFIXES_LOWER.has(first)) {
      normalized = parts.slice(1).join('/');
    }
  }

  if (normalized.startsWith('A11y.A11y.mode')) {
    normalized = normalized.replace(/^A11y\.A11y\.mode[A-Za-z0-9_-]+\./, 'A11y.A11y.');
  }
  if (normalized.startsWith('A11y/A11y/mode')) {
    normalized = normalized.replace(/^A11y\/A11y\/mode[A-Za-z0-9_-]+\//, 'A11y/A11y/');
  }

  return normalized;
}

/**
 * Build registry lookup indexes.
 */
function buildRegistryLookup(registry: Record<string, unknown>): {
  exact: Set<string>;
  lower: Map<string, string>;
} {
  const keys = Object.keys(registry || {});
  const exact = new Set(keys);
  const lower = new Map(keys.map((key) => [key.toLowerCase(), key]));
  return { exact, lower };
}

/**
 * Resolve a token path in the registry.
 */
function resolveTokenInRegistry(
  tokenPath: string,
  registryLookup: { exact: Set<string>; lower: Map<string, string> }
): { ok: boolean; suggested?: string } {
  const variants = new Set<string>();
  const raw = String(tokenPath || '').trim();
  const normalized = normalizeTokenPathCandidate(raw);

  if (raw) variants.add(raw);
  if (normalized && normalized !== raw) variants.add(normalized);

  for (const variant of variants) {
    if (registryLookup.exact.has(variant)) {
      return { ok: true };
    }
  }

  for (const variant of variants) {
    const suggested = registryLookup.lower.get(variant.toLowerCase());
    if (suggested) {
      return { ok: false, suggested };
    }
  }

  return { ok: false };
}

/**
 * Split token values by comma.
 */
function splitTokenValues(raw: string): string[] {
  return String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Create a gap item.
 */
function createGap(
  type: string,
  pathKey: string,
  value: string,
  message: string,
  suggested = ''
): GapItem {
  return {
    type,
    path: String(pathKey || '').trim(),
    value: String(value || '').trim(),
    message: String(message || '').trim(),
    suggested: String(suggested || '').trim(),
  };
}

/**
 * Push a gap item if not already seen.
 */
function pushUnique(gaps: GapItem[], seen: Set<string>, gap: GapItem): void {
  const marker = `${gap.type}|${gap.path}|${gap.value}|${gap.message}|${gap.suggested}`;
  if (seen.has(marker)) return;
  seen.add(marker);
  gaps.push(gap);
}

/**
 * Walk spec tree to find unknown/TBD markers.
 */
function walkUnknownMarkers(
  node: unknown,
  pathParts: string[],
  gaps: GapItem[],
  seen: Set<string>
): void {
  const pathKey = pathParts.join('.');

  if (typeof node === 'string') {
    if (!isGapMarker(node)) return;
    const type = classifyGapType(pathKey);
    const label =
      type === GAP_TYPE.A11Y_TBD
        ? 'Accessibility detail is unresolved.'
        : type === GAP_TYPE.CONTENT_UNKNOWN
          ? 'Content/anatomy/property detail is unresolved.'
          : 'Specification value is unresolved.';
    pushUnique(gaps, seen, createGap(type, pathKey, node, label));
    return;
  }

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      walkUnknownMarkers(node[i], pathParts.concat(`[${i}]`), gaps, seen);
    }
    return;
  }

  if (isPlainObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      walkUnknownMarkers(value, pathParts.concat(key), gaps, seen);
    }
  }
}

/**
 * Walk token mapping to find invalid token references.
 */
function walkTokenMapping(
  node: unknown,
  pathParts: string[],
  registryLookup: { exact: Set<string>; lower: Map<string, string> },
  gaps: GapItem[],
  seen: Set<string>
): void {
  if (typeof node === 'string') {
    const leafPath = pathParts.join('.');
    const tokenValues = splitTokenValues(node);
    for (const tokenValue of tokenValues) {
      if (isGapMarker(tokenValue)) continue;
      if (!tokenValue.includes('/') && !tokenValue.includes('.')) {
        pushUnique(
          gaps,
          seen,
          createGap(GAP_TYPE.TOKEN_INVALID, leafPath, tokenValue, 'Token path is invalid.', '')
        );
        continue;
      }
      const resolution = resolveTokenInRegistry(tokenValue, registryLookup);
      if (!resolution.ok) {
        pushUnique(
          gaps,
          seen,
          createGap(
            GAP_TYPE.TOKEN_INVALID,
            leafPath,
            tokenValue,
            'Token not found in token registry.',
            resolution.suggested || ''
          )
        );
      }
    }
    return;
  }

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      walkTokenMapping(node[i], pathParts.concat(`[${i}]`), registryLookup, gaps, seen);
    }
    return;
  }

  if (isPlainObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      walkTokenMapping(value, pathParts.concat(key), registryLookup, gaps, seen);
    }
  }
}

/**
 * Sort gaps by type order and path.
 */
export function sortGaps(gaps: GapItem[]): GapItem[] {
  return gaps.slice().sort((a, b) => {
    const rankA = GAP_TYPE_ORDER.get(a.type as keyof typeof GAP_TYPE) || 99;
    const rankB = GAP_TYPE_ORDER.get(b.type as keyof typeof GAP_TYPE) || 99;
    if (rankA !== rankB) return rankA - rankB;
    const pathCmp = a.path.localeCompare(b.path, 'en', { sensitivity: 'base' });
    if (pathCmp !== 0) return pathCmp;
    return a.value.localeCompare(b.value, 'en', { sensitivity: 'base' });
  });
}

/**
 * Extract gaps from a spec object.
 */
export function extractGapsFromSpec(options: {
  spec: unknown;
  registry: Record<string, unknown>;
}): GapItem[] {
  const { spec, registry } = options;
  const safeSpec = isPlainObject(spec) ? spec : {};
  const safeRegistry = isPlainObject(registry) ? registry : {};
  const registryLookup = buildRegistryLookup(safeRegistry);

  const gaps: GapItem[] = [];
  const seen = new Set<string>();

  walkUnknownMarkers(safeSpec, [], gaps, seen);
  if (isPlainObject((safeSpec as Record<string, unknown>).token_mapping)) {
    walkTokenMapping(
      (safeSpec as Record<string, unknown>).token_mapping as unknown,
      ['token_mapping'],
      registryLookup,
      gaps,
      seen
    );
  }

  return sortGaps(gaps);
}

/**
 * Build checklist lines from gaps.
 */
export function buildGapsChecklistLines(gaps: GapItem[]): string[] {
  return sortGaps(Array.isArray(gaps) ? gaps : []).map((gap) => {
    if (gap.type === GAP_TYPE.TOKEN_INVALID) {
      const suggestion = gap.suggested
        ? ` Suggested: \`${gap.suggested}\`.`
        : '';
      return `- [ ] [${gap.type}] \`${gap.path}\` references \`${gap.value}\` but it is missing in token registry.${suggestion}`;
    }
    return `- [ ] [${gap.type}] \`${gap.path}\` is \`${gap.value}\`. ${gap.message}`;
  });
}

/**
 * Extract the Gaps / TBD section from markdown.
 */
export function extractGapsSection(rawMarkdown: string): {
  start: number;
  end: number;
  body: string;
} | null {
  const markdown = String(rawMarkdown || '');
  const headingRegex = /^##\s+Gaps \/ TBD\s*$/m;
  const headingMatch = headingRegex.exec(markdown);
  if (!headingMatch) return null;

  const start = headingMatch.index;
  const headingEnd = markdown.indexOf('\n', start);
  const contentStart = headingEnd === -1 ? markdown.length : headingEnd + 1;
  const rest = markdown.slice(contentStart);
  const nextHeadingMatch = /^##\s+/m.exec(rest);
  const end = nextHeadingMatch ? contentStart + nextHeadingMatch.index : markdown.length;

  return {
    start,
    end,
    body: markdown.slice(contentStart, end).replace(/^\n+/, '').replace(/\s+$/, ''),
  };
}

/**
 * Extract non-empty lines from a section body.
 */
export function extractNonEmptySectionLines(sectionBody: string): string[] {
  return String(sectionBody || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
