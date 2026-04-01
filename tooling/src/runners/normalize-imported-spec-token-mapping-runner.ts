#!/usr/bin/env node

/**
 * Normalize Imported Spec Token Mapping Runner
 *
 * Canonicalizes token_mapping token paths and infers missing *.fill mappings
 * from imported anatomy data (including variant contexts).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

import { getStringArg, parseArgs, printUsage } from '../utils/parse-args.js';
import { resolveRunnerSystemContextOrExit } from '../utils/runner-system-context.js';
import { logger } from '../utils/logger.js';

interface RegistryEntry {
  path?: string;
  slashPath?: string;
  cssVar?: string;
  collection?: string;
}

interface TokenLookup {
  exact: Map<string, RegistryEntry>;
  lower: Map<string, RegistryEntry>;
}

interface ProcessResult {
  file: string;
  status: 'ok' | 'updated' | 'error' | 'skip';
  changed: boolean;
  canonicalized: number;
  inferredAdded: number;
  unresolvedInferred: number;
  reason?: string;
  error?: string;
}

const SPEC_TOP_LEVEL_ORDER = Object.freeze([
  'name',
  'status',
  'figma',
  'summary',
  'anatomy',
  'properties',
  'content_guidelines',
  'best_practices',
  'accessibility',
  'token_mapping',
  'qa',
  'related_components',
]);

const CLI_CONFIG = {
  command: 'ds:normalize-imported-spec-token-mapping [options]',
  description:
    'Canonicalize token_mapping refs and infer missing fill mappings from imported anatomy.',
  options: [
    { name: '--system <id>', description: 'Target design system context.' },
    { name: '--spec-root', description: 'Spec directory. Defaults to system docs/_spec/components.' },
    { name: '--registry', description: 'Token registry path. Defaults to system docs/_generated/token-registry.json.' },
    { name: '--file', description: 'Single spec YAML file path to process.' },
    { name: '--all', description: 'Process all spec files in spec root.' },
    { name: '--overwrite-existing', description: 'Overwrite existing token_mapping values when inferred value differs.', defaultValue: 'false' },
    { name: '--dry-run', description: 'Analyze but do not write files.', defaultValue: 'false' },
    { name: '--json', description: 'Print machine-readable output.', defaultValue: 'false' },
    { name: '--help', description: 'Show help.' },
  ],
};

const FULL_VARIANT_EXPR_RE =
  /^([A-Za-z0-9_-]+\s*=\s*[^,]+)(\s*,\s*[A-Za-z0-9_-]+\s*=\s*[^,]+)*$/;

function parseBooleanOption(
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSpecOrderLocal(spec: Record<string, unknown>): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};
  for (const key of SPEC_TOP_LEVEL_ORDER) {
    if (key in spec) ordered[key] = spec[key];
  }
  for (const [key, value] of Object.entries(spec)) {
    if (!(key in ordered)) ordered[key] = value;
  }
  return ordered;
}

function normalizeConditionLabel(raw: string): string {
  return String(raw || '')
    .split(',')
    .map((part) => {
      const [left, right] = part.split('=');
      if (right === undefined) return String(part || '').trim();
      return `${String(left || '').trim()}=${String(right || '').trim()}`;
    })
    .join(',');
}

function normalizePartKey(raw: string): string {
  const normalized = String(raw || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!normalized) return 'part';
  if (normalized === 'texto' || normalized === 'text' || normalized === 'label') return 'text';
  if (normalized === 'contenedor' || normalized === 'container' || normalized === 'background') return 'container';
  return normalized;
}

function choosePartKey(node: Record<string, unknown>, variantContext: string | null): string {
  const type = String(node.type || '').trim().toUpperCase();
  const name = String(node.name || '').trim();
  if (type === 'TEXT') return 'text';
  if (variantContext && FULL_VARIANT_EXPR_RE.test(name)) return 'container';
  return normalizePartKey(name || type || 'part');
}

function buildTokenLookup(entries: RegistryEntry[]): TokenLookup {
  const exact = new Map<string, RegistryEntry>();
  const lower = new Map<string, RegistryEntry>();

  const preferEntry = (
    current: RegistryEntry | undefined,
    candidate: RegistryEntry,
  ): RegistryEntry => {
    if (!current) return candidate;
    const currentPath = String(current.path || '').trim();
    const candidatePath = String(candidate.path || '').trim();
    const currentDepth = currentPath.split('.').filter(Boolean).length;
    const candidateDepth = candidatePath.split('.').filter(Boolean).length;

    // Prefer more specific token paths when shorthand aliases collide.
    if (candidateDepth > currentDepth) return candidate;
    if (candidateDepth < currentDepth) return current;

    // Deterministic tiebreaker to avoid env/order-dependent outcomes.
    if (candidatePath && currentPath && candidatePath.localeCompare(currentPath) < 0) return candidate;
    return current;
  };

  const setLookup = (rawKey: string, entry: RegistryEntry) => {
    const key = String(rawKey || '').trim();
    if (!key) return;
    exact.set(key, preferEntry(exact.get(key), entry));
    const lowerKey = key.toLowerCase();
    lower.set(lowerKey, preferEntry(lower.get(lowerKey), entry));
  };

  for (const entry of entries) {
    const tokenPath = String(entry.path || '').trim();
    if (!tokenPath) continue;
    const slashPath = String(entry.slashPath || '').trim();
    const cssVar = String(entry.cssVar || '').trim();
    const collection = String(entry.collection || '').trim();

    setLookup(tokenPath, entry);
    setLookup(tokenPath.replace(/\./g, '/'), entry);
    if (slashPath) {
      setLookup(slashPath, entry);
      setLookup(slashPath.replace(/\//g, '.'), entry);
    }
    if (cssVar) setLookup(cssVar, entry);

    if (collection && tokenPath.toLowerCase().startsWith(`${collection.toLowerCase()}.`)) {
      const withoutCollection = tokenPath.slice(collection.length + 1);
      setLookup(withoutCollection, entry);
      setLookup(withoutCollection.replace(/\./g, '/'), entry);
    }
  }

  return { exact, lower };
}

function resolveCanonicalTokenPath(rawRef: unknown, lookup: TokenLookup): string | null {
  const raw = String(rawRef ?? '').trim();
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  if (lowered === 'tbd' || lowered === 'null' || lowered === 'undefined') return null;

  const varRef = raw.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]+)?\)$/i);
  const normalizedRaw = varRef ? varRef[1] : raw.replace(/^\{+|\}+$/g, '').trim();
  if (!normalizedRaw) return null;

  const candidates = [
    normalizedRaw,
    normalizedRaw.replace(/\//g, '.'),
    normalizedRaw.replace(/\./g, '/'),
  ];

  for (const candidate of candidates) {
    const exactHit = lookup.exact.get(candidate);
    if (exactHit?.path) return String(exactHit.path);
    const lowerHit = lookup.lower.get(candidate.toLowerCase());
    if (lowerHit?.path) return String(lowerHit.path);
  }

  return null;
}

function collectInferredFillRefs(
  nodes: unknown,
  lookup: TokenLookup,
  parentVariantContext: string | null,
  out: Array<{ key: string; condition: string; tokenPath: string }>,
): void {
  if (!Array.isArray(nodes)) return;
  for (const item of nodes) {
    if (!isPlainObject(item)) continue;
    const nodeName = String(item.name || '').trim();
    const variantContext = FULL_VARIANT_EXPR_RE.test(nodeName)
      ? normalizeConditionLabel(nodeName)
      : parentVariantContext;

    const fillRaw = String(item.fill || '').trim();
    const canonicalFill = resolveCanonicalTokenPath(fillRaw, lookup);
    if (canonicalFill) {
      const part = choosePartKey(item, variantContext);
      out.push({
        key: `${part}.fill`,
        condition: variantContext || 'default',
        tokenPath: canonicalFill,
      });
    }

    if (Array.isArray(item.children)) {
      collectInferredFillRefs(item.children, lookup, variantContext, out);
    }
  }
}

function canonicalizeTokenMappingNode(
  node: unknown,
  lookup: TokenLookup,
): { value: unknown; changed: number } {
  if (typeof node === 'string') {
    const canonical = resolveCanonicalTokenPath(node, lookup);
    if (canonical && canonical !== node) return { value: canonical, changed: 1 };
    return { value: node, changed: 0 };
  }
  if (Array.isArray(node)) {
    let total = 0;
    const mapped = node.map((child) => {
      const result = canonicalizeTokenMappingNode(child, lookup);
      total += result.changed;
      return result.value;
    });
    return { value: mapped, changed: total };
  }
  if (!isPlainObject(node)) return { value: node, changed: 0 };

  let total = 0;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    const result = canonicalizeTokenMappingNode(value, lookup);
    next[key] = result.value;
    total += result.changed;
  }
  return { value: next, changed: total };
}

function ensureConditionMap(
  node: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const current = node[key];
  if (isPlainObject(current)) return current;
  if (typeof current === 'string') {
    const promoted = { default: current };
    node[key] = promoted;
    return promoted;
  }
  const created: Record<string, unknown> = {};
  node[key] = created;
  return created;
}

function processSpecFile(args: {
  filePath: string;
  lookup: TokenLookup;
  overwriteExisting: boolean;
  dryRun: boolean;
}): ProcessResult {
  const { filePath, lookup, overwriteExisting, dryRun } = args;

  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return {
      file: filePath,
      status: 'error',
      changed: false,
      canonicalized: 0,
      inferredAdded: 0,
      unresolvedInferred: 0,
      error: `Read failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(content);
  } catch (error) {
    return {
      file: filePath,
      status: 'error',
      changed: false,
      canonicalized: 0,
      inferredAdded: 0,
      unresolvedInferred: 0,
      error: `YAML parse failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      file: filePath,
      status: 'skip',
      changed: false,
      canonicalized: 0,
      inferredAdded: 0,
      unresolvedInferred: 0,
      reason: 'Spec is not an object.',
    };
  }

  let changed = 0;
  let inferredAdded = 0;
  let unresolvedInferred = 0;

  const spec = parsed as Record<string, unknown>;

  if (!isPlainObject(spec.token_mapping)) {
    spec.token_mapping = {};
    changed += 1;
  }

  const canonicalizedResult = canonicalizeTokenMappingNode(spec.token_mapping, lookup);
  spec.token_mapping = canonicalizedResult.value;
  changed += canonicalizedResult.changed;

  const inferred: Array<{ key: string; condition: string; tokenPath: string }> = [];
  collectInferredFillRefs(spec.anatomy, lookup, null, inferred);

  if (!isPlainObject(spec.token_mapping)) {
    spec.token_mapping = {};
    changed += 1;
  }
  const tokenMapping = spec.token_mapping as Record<string, unknown>;
  const seen = new Set<string>();
  for (const ref of inferred) {
    const signature = `${ref.key}|${ref.condition}|${ref.tokenPath}`;
    if (seen.has(signature)) continue;
    seen.add(signature);

    const conditionMap = ensureConditionMap(tokenMapping, ref.key);
    const currentValue = conditionMap[ref.condition];

    if (currentValue === undefined || String(currentValue || '').trim() === '' || String(currentValue || '').trim().toLowerCase() === 'tbd') {
      conditionMap[ref.condition] = ref.tokenPath;
      inferredAdded += 1;
      changed += 1;
      continue;
    }

    const canonicalCurrent = resolveCanonicalTokenPath(currentValue, lookup);
    if (canonicalCurrent && canonicalCurrent !== String(currentValue)) {
      conditionMap[ref.condition] = canonicalCurrent;
      changed += 1;
    }

    if (overwriteExisting && canonicalCurrent && canonicalCurrent !== ref.tokenPath) {
      conditionMap[ref.condition] = ref.tokenPath;
      changed += 1;
      inferredAdded += 1;
    }
  }

  // Count unresolved fills for visibility.
  if (Array.isArray(spec.anatomy)) {
    const stack: unknown[] = [...spec.anatomy];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!isPlainObject(node)) continue;
      const fillRaw = String(node.fill || '').trim();
      if (fillRaw && !resolveCanonicalTokenPath(fillRaw, lookup)) {
        unresolvedInferred += 1;
      }
      if (Array.isArray(node.children)) stack.push(...node.children);
    }
  }

  if (changed > 0 && !dryRun) {
    const ordered = normalizeSpecOrderLocal(spec);
    const nextContent = yaml.dump(ordered, { lineWidth: -1, noRefs: true, sortKeys: false });
    fs.writeFileSync(filePath, nextContent, 'utf8');
  }

  return {
    file: filePath,
    status: changed > 0 ? 'updated' : 'ok',
    changed: changed > 0,
    canonicalized: canonicalizedResult.changed,
    inferredAdded,
    unresolvedInferred,
  };
}

export async function runNormalizeImportedSpecTokenMapping(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);
  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const ctx = resolveRunnerSystemContextOrExit({ parsedArgs: parsed, logger });
  const specRoot = path.resolve(
    String(getStringArg(parsed, 'spec-root') || ctx.paths.specs),
  );
  const registryPath = path.resolve(
    String(getStringArg(parsed, 'registry') || ctx.paths.tokenRegistry),
  );

  const all = parseBooleanOption(parsed.all, '--all', !parsed.file);
  const overwriteExisting = parseBooleanOption(
    parsed['overwrite-existing'],
    '--overwrite-existing',
    false,
  );
  const dryRun = parseBooleanOption(parsed['dry-run'], '--dry-run', false);
  const json = parseBooleanOption(parsed.json, '--json', false);

  const files = all
    ? fs.readdirSync(specRoot)
        .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
        .map((file) => path.join(specRoot, file))
    : [path.resolve(String(parsed.file || ''))].filter(Boolean);

  if (files.length === 0) {
    throw new Error(`No spec files found in ${specRoot}`);
  }

  const registryRaw = fs.readFileSync(registryPath, 'utf8');
  const registry = JSON.parse(registryRaw) as { entries?: RegistryEntry[] };
  const lookup = buildTokenLookup(Array.isArray(registry.entries) ? registry.entries : []);

  const results = files.map((filePath) =>
    processSpecFile({ filePath, lookup, overwriteExisting, dryRun }),
  );

  const summary = {
    total: results.length,
    updated: results.filter((row) => row.status === 'updated').length,
    ok: results.filter((row) => row.status === 'ok').length,
    skipped: results.filter((row) => row.status === 'skip').length,
    errors: results.filter((row) => row.status === 'error').length,
    canonicalized: results.reduce((sum, row) => sum + row.canonicalized, 0),
    inferredAdded: results.reduce((sum, row) => sum + row.inferredAdded, 0),
    unresolvedInferred: results.reduce((sum, row) => sum + row.unresolvedInferred, 0),
    dryRun,
    system: ctx.id,
    specRoot,
    registryPath,
  };

  if (json) {
    console.log(JSON.stringify({ summary, results }, null, 2));
  } else {
    console.log(
      [
        `System: ${summary.system}`,
        `Processed: ${summary.total}`,
        `Updated: ${summary.updated}`,
        `Canonicalized refs: ${summary.canonicalized}`,
        `Inferred mappings added: ${summary.inferredAdded}`,
        `Unresolved inferred fills: ${summary.unresolvedInferred}`,
        `Errors: ${summary.errors}`,
      ].join('\n'),
    );
    if (summary.errors > 0) {
      for (const row of results.filter((item) => item.status === 'error')) {
        console.error(`- ${path.relative(process.cwd(), row.file)} :: ${row.error}`);
      }
    }
  }

  if (summary.errors > 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runNormalizeImportedSpecTokenMapping(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Token mapping normalization failed: ${message}`);
    process.exit(1);
  });
}
