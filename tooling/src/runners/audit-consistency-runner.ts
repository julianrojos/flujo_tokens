#!/usr/bin/env node

/**
 * Audit Consistency Runner
 *
 * Audits consistency between spec ↔ markdown ↔ token-registry ↔ Figma.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseArgs, printUsage } from '../utils/parse-args.js';
import { resolveSystemContextSafe } from '../utils/system-context.js';
import { logger } from '../utils/logger.js';

// Import from existing libs during migration
import { parseMarkdownFrontmatter, parseYamlDocument } from '../../scripts/lib/parse-frontmatter.mjs';
import { validateDocs } from '../../scripts/lib/docs-validator.mjs';
import { loadTokenRegistry, DEFAULT_TOKEN_REGISTRY_PATH } from '../../scripts/lib/token-registry.mjs';
import { componentNameToSnakeCase } from '../../scripts/lib/component-name.mjs';
import { normalizeNodeId } from '../../scripts/lib/node-id.mjs';
import { extractSectionBody } from '../../scripts/lib/markdown-sections.mjs';
import { TOKEN_COLLECTION_PREFIXES } from '../../scripts/lib/docs-config.mjs';

const TOKEN_CODES = new Set(['TOK01', 'TOK02', 'TOK03', 'SPEC01', 'TOKEN_MISSING', 'TOKEN_AMBIGUOUS', 'TOKEN_DEPRECATED']);

const CLI_CONFIG = {
  command: 'ds:audit-consistency [options]',
  description: 'Audits consistency between spec ↔ markdown ↔ token-registry ↔ Figma.',
  options: [
    {
      name: '--docs-root',
      description: 'Component docs root directory.',
      defaultValue: 'docs/components',
    },
    {
      name: '--spec-root',
      description: 'Component spec directory.',
      defaultValue: 'docs/_spec/components',
    },
    {
      name: '--registry',
      description: 'Token registry JSON path.',
      defaultValue: 'docs/_generated/token-registry.json',
    },
    {
      name: '--component-name',
      description: 'Audit specific component by name.',
    },
    {
      name: '--system',
      description: 'Target design system context.',
    },
    {
      name: '--help',
      description: 'Show this help message.',
    },
  ],
};

function collectComponentPairs(params: { docsRoot: string; specRoot: string; componentName?: string | null }) {
  const { docsRoot, specRoot, componentName } = params;
  const markdownBySlug = new Map<string, string>();
  const specBySlug = new Map<string, string>();

  if (fs.existsSync(docsRoot)) {
    for (const entry of fs.readdirSync(docsRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === 'overview.md') continue;
      const slug = path.basename(entry.name, '.md');
      markdownBySlug.set(slug, path.join(docsRoot, entry.name));
    }
  }

  if (fs.existsSync(specRoot)) {
    for (const entry of fs.readdirSync(specRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.yml') || entry.name === '_template.yml') continue;
      const slug = path.basename(entry.name, '.yml');
      specBySlug.set(slug, path.join(specRoot, entry.name));
    }
  }

  const slugs = componentName
    ? [componentNameToSnakeCase(componentName)]
    : Array.from(new Set([...markdownBySlug.keys(), ...specBySlug.keys()])).sort((a, b) =>
        a.localeCompare(b, 'en', { sensitivity: 'base' }),
      );

  return slugs
    .filter(Boolean)
    .map((slug) => ({
      slug,
      markdownPath: markdownBySlug.get(slug) || '',
      specPath: specBySlug.get(slug) || '',
    }));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

function escapeRegex(value: string): string {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

function splitSpecTokenValue(raw: string): string[] {
  return String(raw || '')
    .split(',')
    .map((piece) => piece.trim())
    .filter(Boolean);
}

function collectTokenMappingValues(node: unknown, bucket: string[] = []): string[] {
  if (typeof node === 'string') {
    for (const token of splitSpecTokenValue(node)) bucket.push(token);
    return bucket;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectTokenMappingValues(item, bucket);
    return bucket;
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node)) collectTokenMappingValues(value, bucket);
  }
  return bucket;
}

function buildRegistryLookup(registry: any) {
  const entries: any[] = [];
  const seen = new Set<string>();

  for (const value of Object.values(registry)) {
    if (!value || typeof value !== 'object') continue;
    const pathKey = String(value.path || '').trim();
    const slashKey = String(value.slashPath || '').trim();
    const dedupeKey = `${pathKey}|${slashKey}`;
    if (!pathKey && !slashKey) continue;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    entries.push(value);
  }

  const byPath = new Map<string, any>();
  const bySlash = new Map<string, any>();
  for (const entry of entries) {
    const pathKey = String(entry.path || '').trim();
    const slashKey = String(entry.slashPath || '').trim();
    if (pathKey) byPath.set(pathKey, entry);
    if (slashKey) bySlash.set(slashKey, entry);
  }

  return { entries, byPath, bySlash };
}

function resolveTokenForms(token: string, lookup: ReturnType<typeof buildRegistryLookup>): string[] {
  const value = String(token || '').trim();
  if (!value) return [];

  const directByPath = lookup.byPath.get(value);
  const directBySlash = lookup.bySlash.get(value);
  const entry = directByPath || directBySlash;
  if (entry) {
    const forms = [
      String(entry.path || '').trim(),
      String(entry.slashPath || '').trim(),
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

function includesAnyTokenForm(sectionText: string, forms: string[]): boolean {
  const haystack = String(sectionText || '');
  for (const form of forms) {
    if (!form) continue;
    const escaped = escapeRegex(form);
    if (new RegExp(`\`${escaped}\``).test(haystack)) return true;
    if (
      new RegExp(`(^|[^A-Za-z0-9_./-])${escaped}([^A-Za-z0-9_./-]|$)`, 'i').test(haystack)
    )
      return true;
  }
  return false;
}

function checkSpecMarkdownConsistency(params: {
  spec: any;
  frontmatter: Record<string, unknown>;
  markdownContent: string;
  lookup: ReturnType<typeof buildRegistryLookup>;
}) {
  const { spec, frontmatter, markdownContent, lookup } = params;
  const errors: string[] = [];
  const componentApi = extractSectionBody(markdownContent, 'Component API');
  const visualSpecs = extractSectionBody(markdownContent, 'Visual Specifications');

  const properties = Array.isArray(spec.properties) ? spec.properties : [];
  for (const property of properties) {
    const name = String(property?.name ?? '').trim();
    if (!name) continue;
    if (!containsWholeTerm(componentApi, name)) {
      errors.push(`Missing property in markdown Component API: \`${name}\`.`);
    }

    const type = String(property?.type ?? '').trim().toLowerCase();
    if (type === 'enum') {
      const values = normalizeStringArray(property?.values);
      for (const value of values) {
        if (!containsWholeTerm(componentApi, value)) {
          errors.push(`Missing enum value \`${value}\` for property \`${name}\` in Component API.`);
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

  const specStatus = String(spec.status || '').trim().toLowerCase();
  const docStatus = String(frontmatter.doc_status || '').trim().toLowerCase();
  if (
    (specStatus === 'ready' && docStatus !== 'ready') ||
    (docStatus === 'ready' && specStatus !== 'ready')
  ) {
    errors.push(
      `Lifecycle mismatch: spec status is \`${specStatus || 'missing'}\` but markdown doc_status is \`${docStatus || 'missing'}\`.`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function checkMarkdownFigmaConsistency(params: {
  spec: any;
  frontmatter: Record<string, unknown>;
  markdownContent: string;
}) {
  const { spec, frontmatter, markdownContent } = params;
  const errors: string[] = [];
  const figmaFm = frontmatter?.figma && typeof frontmatter.figma === 'object' ? frontmatter.figma : {};
  const figmaSpec = spec?.figma && typeof spec.figma === 'object' ? spec.figma : {};

  const specComponentSet = String(figmaSpec.component_set || '').trim();
  const markdownComponent = String(figmaFm.component || '').trim();
  if (specComponentSet && markdownComponent && specComponentSet !== markdownComponent) {
    errors.push(
      `Figma component mismatch: spec figma.component_set is \`${specComponentSet}\`, markdown figma.component is \`${markdownComponent}\`.`,
    );
  }

  const specPage = String(figmaSpec.page || '').trim();
  const markdownPage = String(figmaFm.page || '').trim();
  if (specPage && markdownPage && specPage !== markdownPage) {
    errors.push(`Figma page mismatch: spec page is \`${specPage}\`, markdown page is \`${markdownPage}\`.`);
  }

  const specNode = normalizeNodeId(String(figmaSpec.component_set_node_id || '').trim());
  const markdownNode = normalizeNodeId(String(figmaFm.component_set_node_id || '').trim());
  if (specNode && markdownNode && specNode !== markdownNode) {
    errors.push(
      `Figma node mismatch: spec figma.component_set_node_id is \`${specNode}\`, markdown frontmatter has \`${markdownNode}\`.`,
    );
  }

  const stateProperty = (Array.isArray(spec.properties) ? spec.properties : []).find(
    (property) => String(property?.name || '').trim().toLowerCase() === 'state',
  );
  if (stateProperty) {
    const stateSection = extractSectionBody(markdownContent, 'States');
    const stateValues = normalizeStringArray(stateProperty.values);
    for (const stateValue of stateValues) {
      if (!containsWholeTerm(stateSection, stateValue)) {
        errors.push(`State \`${stateValue}\` is defined in spec but missing in markdown \`## States\` section.`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function checkTokenValidity(params: {
  markdownPath: string;
  specPath: string;
  docsRoot: string;
  specRoot: string;
  registryPath: string;
}) {
  const { markdownPath, specPath, docsRoot, specRoot, registryPath } = params;
  const report = validateDocs({
    docsRoot,
    specRoot,
    registryPath,
    filePath: markdownPath,
    specFilePath: specPath,
    checkOverview: false,
    checkSpecs: true,
  });

  const tokenErrors = report.errors.filter((finding) =>
    TOKEN_CODES.has(String(finding.code || '')),
  );
  const tokenWarnings = report.warnings.filter((finding) =>
    TOKEN_CODES.has(String(finding.code || '')),
  );

  return {
    ok: tokenErrors.length === 0,
    errors: tokenErrors,
    warnings: tokenWarnings,
  };
}

function buildSuggestedCommands(params: { markdownPath: string; specPath: string; registryPath: string }) {
  const { markdownPath, specPath, registryPath } = params;
  return [
    `npm run validate:docs -- --check token-registry --file "${markdownPath}" --spec-file "${specPath}" --no-overview true`,
    `npm run ds:component-doc -- --spec-file "${specPath}" --output "${markdownPath}" --registry "${registryPath}" --force true`,
    'npm run generate:registry',
  ];
}

export async function runAuditConsistency(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const ctx = resolveSystemContextSafe({ system: parsed.system });
  const docsRoot = path.resolve(String(parsed['docs-root'] || ctx.paths.docs));
  const specRoot = path.resolve(String(parsed['spec-root'] || ctx.paths.specs));
  const registryPath = path.resolve(String(parsed.registry || DEFAULT_TOKEN_REGISTRY_PATH));
  const componentName = String(parsed['component-name'] || '').trim() || null;

  let registry: any;
  try {
    registry = loadTokenRegistry(registryPath);
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          generatedAt: new Date().toISOString(),
          summary: { componentsAudited: 0, failures: 1 },
          errors: [
            {
              code: 'AUDIT_REGISTRY',
              message: error instanceof Error ? error.message : String(error),
              suggested: 'Run `npm run generate:registry` before auditing consistency.',
            },
          ],
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const lookup = buildRegistryLookup(registry);
  const pairs = collectComponentPairs({ docsRoot, specRoot, componentName });

  if (pairs.length === 0) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          generatedAt: new Date().toISOString(),
          summary: { componentsAudited: 0, failures: 1 },
          errors: [
            {
              code: 'AUDIT_INPUT',
              message: 'No component pairs found to audit.',
              details: { docsRoot, specRoot, componentName },
            },
          ],
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const componentReports: any[] = [];

  for (const pair of pairs) {
    const problems: string[] = [];
    if (!pair.markdownPath || !fs.existsSync(pair.markdownPath)) {
      problems.push(`Missing markdown file: ${pair.markdownPath || `<docs/components/${pair.slug}.md>`}`);
    }
    if (!pair.specPath || !fs.existsSync(pair.specPath)) {
      problems.push(`Missing spec file: ${pair.specPath || `<docs/_spec/components/${pair.slug}.yml>`}`);
    }

    if (problems.length > 0) {
      componentReports.push({
        component: pair.slug,
        ok: false,
        paths: { markdown: pair.markdownPath || null, spec: pair.specPath || null },
        checks: {
          spec_markdown_consistency: { ok: false, errors: problems },
          markdown_figma_consistency: { ok: false, errors: [] },
          token_validity: { ok: false, errors: [] },
        },
        suggested: buildSuggestedCommands({
          markdownPath: pair.markdownPath || path.join(docsRoot, `${pair.slug}.md`),
          specPath: pair.specPath || path.join(specRoot, `${pair.slug}.yml`),
          registryPath,
        }),
      });
      continue;
    }

    let spec: any;
    let markdown: string;
    let frontmatter: Record<string, unknown>;
    try {
      spec = parseYamlDocument(
        fs.readFileSync(pair.specPath, 'utf8'),
        `spec YAML (${path.basename(pair.specPath)})`,
      );
      markdown = fs.readFileSync(pair.markdownPath, 'utf8');
      frontmatter = parseMarkdownFrontmatter(markdown).frontmatter;
    } catch (error) {
      componentReports.push({
        component: pair.slug,
        ok: false,
        paths: { markdown: pair.markdownPath, spec: pair.specPath },
        checks: {
          spec_markdown_consistency: {
            ok: false,
            errors: [error instanceof Error ? error.message : String(error)],
          },
          markdown_figma_consistency: { ok: false, errors: [] },
          token_validity: { ok: false, errors: [] },
        },
        suggested: buildSuggestedCommands({
          markdownPath: pair.markdownPath,
          specPath: pair.specPath,
          registryPath,
        }),
      });
      continue;
    }

    const specMarkdown = checkSpecMarkdownConsistency({
      spec,
      frontmatter: frontmatter && typeof frontmatter === 'object' ? frontmatter : {},
      markdownContent: markdown,
      lookup,
    });
    const markdownFigma = checkMarkdownFigmaConsistency({
      spec,
      frontmatter: frontmatter && typeof frontmatter === 'object' ? frontmatter : {},
      markdownContent: markdown,
    });
    const tokenValidity = checkTokenValidity({
      markdownPath: pair.markdownPath,
      specPath: pair.specPath,
      docsRoot,
      specRoot,
      registryPath,
    });

    componentReports.push({
      component: pair.slug,
      ok: specMarkdown.ok && markdownFigma.ok && tokenValidity.ok,
      paths: { markdown: pair.markdownPath, spec: pair.specPath },
      checks: {
        spec_markdown_consistency: specMarkdown,
        markdown_figma_consistency: markdownFigma,
        token_validity: tokenValidity,
      },
      suggested: buildSuggestedCommands({
        markdownPath: pair.markdownPath,
        specPath: pair.specPath,
        registryPath,
      }),
    });
  }

  const failedComponents = componentReports.filter((item) => !item.ok);
  const report = {
    ok: failedComponents.length === 0,
    generatedAt: new Date().toISOString(),
    summary: {
      componentsAudited: componentReports.length,
      passed: componentReports.length - failedComponents.length,
      failures: failedComponents.length,
    },
    components: componentReports,
  };

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exit(1);
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runAuditConsistency(process.argv.slice(2)).catch((error) => {
    logger.error('Audit consistency runner failed:', error);
    process.exit(1);
  });
}
