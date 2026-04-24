/**
 * Spec Token Mapping Utilities
 *
 * Prefill token mapping suggestions based on registry entries.
 */
import { isPlainObject } from '../utils/is-plain-object.js';

/**
 * Minimum score for a strong token match.
 */
const STRONG_MATCH_THRESHOLD = 2;

function isTbdMarker(value: unknown): boolean {
  return /^tbd$/i.test(String(value || '').trim());
}

export interface RegistryEntry {
  path?: string;
  slashPath?: string;
  cssVar?: string;
  collection?: string;
  type?: string;
  resolvedValue?: string;
  [key: string]: unknown;
}

/**
 * Normalize a string for comparison (lowercase, alphanumeric only).
 */
export function normalizeCompareKey(raw: unknown): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Extract unique entries from a registry index.
 */
export function extractUniqueRegistryEntries(
  registryIndex: Record<string, unknown> | null | undefined
): RegistryEntry[] {
  const unique: RegistryEntry[] = [];
  const seen = new Set<string>();

  for (const entry of Object.values(registryIndex || {})) {
    if (!entry || typeof entry !== 'object') continue;
    const marker = [
      String((entry as RegistryEntry).path || ''),
      String((entry as RegistryEntry).slashPath || ''),
      String((entry as RegistryEntry).cssVar || ''),
      String((entry as RegistryEntry).collection || ''),
    ].join('|');
    if (seen.has(marker)) continue;
    seen.add(marker);
    unique.push(entry as RegistryEntry);
  }

  return unique;
}

/**
 * Pick token candidates that belong to a specific component.
 */
export function pickComponentTokenCandidates(
  registryEntries: RegistryEntry[],
  componentName: string
): RegistryEntry[] {
  const componentKey = normalizeCompareKey(componentName);
  if (!componentKey) return [];

  const matches: RegistryEntry[] = [];
  for (const entry of registryEntries) {
    if (!entry.path || !String(entry.path).includes('.')) continue;
    if (String(entry.collection || '').toLowerCase() !== 'components') continue;
    const parts = String(entry.path).split('.');
    if (parts.length < 3) continue;
    if (normalizeCompareKey(parts[1]) !== componentKey) continue;
    matches.push(entry);
  }
  return matches;
}

/**
 * Build a menu of token suggestions for a component.
 */
export function buildTokenMenuLines(
  registryEntries: RegistryEntry[],
  componentName: string,
  limit = 24
): string[] {
  const preferred = pickComponentTokenCandidates(registryEntries, componentName);
  const fallback = registryEntries.filter((entry) => {
    const collection = String(entry.collection || '').toLowerCase();
    return collection === 'semantic' || collection === 'primitives';
  });
  const source = preferred.length > 0 ? preferred : fallback;
  const selected = source.slice(0, Math.max(0, limit));
  return selected.map((entry) => {
    const tokenPath = String(entry.slashPath || entry.path || '').trim();
    const tokenType = String(entry.type || 'unknown').trim();
    const resolved = String(entry.resolvedValue || '').trim();
    return resolved
      ? `${tokenPath} (${tokenType}: ${resolved})`
      : `${tokenPath} (${tokenType})`;
  });
}

/**
 * Extract keywords from a string for token matching.
 */
function extractKeywords(raw: string): string[] {
  const stopWords = new Set([
    'default',
    'state',
    'type',
    'variant',
    'token',
    'tokens',
    'value',
    'values',
  ]);
  return String(raw || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part && !stopWords.has(part));
}

/**
 * Score a token candidate based on keyword matches.
 */
function scoreTokenCandidate(entry: RegistryEntry, keywords: string[]): number {
  const haystack =
    `${String(entry.path || '')} ${String(entry.slashPath || '')}`.toLowerCase();
  let score = 0;

  for (const keyword of keywords) {
    if (!keyword) continue;
    if (haystack.includes(keyword)) score += 1;
  }

  return score;
}

/**
 * Pick the best token path from candidates based on key path and condition.
 */
export function pickBestTokenPath(
  candidates: RegistryEntry[],
  keyPath: string,
  condition: string
): string {
  const keywords = extractKeywords(`${keyPath} ${condition}`);
  if (keywords.length === 0) return '';

  let best: RegistryEntry | null = null;
  let bestScore = 0;
  let bestScoreCount = 0;

  for (const candidate of candidates) {
    const score = scoreTokenCandidate(candidate, keywords);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
      bestScoreCount = score > 0 ? 1 : 0;
      continue;
    }
    if (score === bestScore && best && score > 0) {
      bestScoreCount += 1;
      const currentLen = String(candidate.path || '').length;
      const bestLen = String(best.path || '').length;
      if (currentLen < bestLen) best = candidate;
    }
  }

  const isStrongMatch = bestScore >= STRONG_MATCH_THRESHOLD;
  const isUniqueSingleKeywordMatch = bestScore === 1 && bestScoreCount === 1;
  if (!best || (!isStrongMatch && !isUniqueSingleKeywordMatch)) return '';
  return String(best.slashPath || best.path || '').trim();
}

/**
 * Prefill token mapping object with suggestions from registry.
 * Recursively walks the object and fills TBD values.
 *
 * @param node - Token mapping object to prefill
 * @param componentTokenCandidates - Candidate token entries from registry
 * @param keyPath - Current path in the object (for scoring)
 * @returns Number of fields filled
 */
export function prefillTokenMapping(
  node: Record<string, unknown>,
  componentTokenCandidates: RegistryEntry[],
  keyPath = ''
): number {
  if (!isPlainObject(node)) return 0;
  let filledCount = 0;

  const entries = Object.entries(node);
  const isConditionMap =
    entries.length > 0 &&
    entries.every(([, value]) => typeof value === 'string');

  if (isConditionMap) {
    for (const [condition, value] of entries) {
      if (!isTbdMarker(value)) continue;
      const suggestion = pickBestTokenPath(
        componentTokenCandidates,
        keyPath,
        condition
      );
      if (!suggestion) continue;
      node[condition] = suggestion;
      filledCount += 1;
    }
    return filledCount;
  }

  for (const [key, value] of entries) {
    const nextPath = keyPath ? `${keyPath}.${key}` : key;

    if (typeof value === 'string') {
      if (!isTbdMarker(value)) continue;
      const suggestion = pickBestTokenPath(
        componentTokenCandidates,
        nextPath,
        key
      );
      if (!suggestion) continue;
      node[key] = suggestion;
      filledCount += 1;
      continue;
    }

    if (isPlainObject(value)) {
      filledCount += prefillTokenMapping(
        value,
        componentTokenCandidates,
        nextPath
      );
    }
  }

  return filledCount;
}
