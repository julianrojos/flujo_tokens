#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { parseArgs } from "./lib/parse-args.mjs";
import { parseMarkdownFrontmatter, parseYamlDocument } from "./lib/parse-frontmatter.mjs";
import { validateDocs } from "./lib/docs-validator.mjs";
import { loadTokenRegistry, DEFAULT_TOKEN_REGISTRY_PATH } from "./lib/token-registry.mjs";
import { componentNameToSnakeCase } from "./lib/component-name.mjs";
import { DOCS_ROOT, DOCS_SPEC_DIR } from "./lib/paths.mjs";
import { normalizeNodeId } from "./lib/node-id.mjs";
import { extractSectionBody } from "./lib/markdown-sections.mjs";
import { TOKEN_COLLECTION_PREFIXES } from "./lib/docs-config.mjs";

const TOKEN_CODES = new Set(["TOK01", "TOK02", "TOK03", "SPEC01", "TOKEN_MISSING", "TOKEN_AMBIGUOUS", "TOKEN_DEPRECATED"]);

function collectComponentPairs({ docsRoot, specRoot, componentName }) {
  const markdownBySlug = new Map();
  const specBySlug = new Map();

  if (fs.existsSync(docsRoot)) {
    for (const entry of fs.readdirSync(docsRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === "overview.md") continue;
      const slug = path.basename(entry.name, ".md");
      markdownBySlug.set(slug, path.join(docsRoot, entry.name));
    }
  }

  if (fs.existsSync(specRoot)) {
    for (const entry of fs.readdirSync(specRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".yml") || entry.name === "_template.yml") continue;
      const slug = path.basename(entry.name, ".yml");
      specBySlug.set(slug, path.join(specRoot, entry.name));
    }
  }

  const slugs = componentName
    ? [componentNameToSnakeCase(componentName)]
    : Array.from(new Set([...markdownBySlug.keys(), ...specBySlug.keys()])).sort((a, b) =>
        a.localeCompare(b, "en", { sensitivity: "base" })
      );

  return slugs
    .filter(Boolean)
    .map((slug) => ({
      slug,
      markdownPath: markdownBySlug.get(slug) || "",
      specPath: specBySlug.get(slug) || "",
    }));
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWholeTerm(haystack, term) {
  const source = String(haystack || "");
  const needle = String(term || "").trim();
  if (!needle) return false;
  const pattern = new RegExp(
    `(^|[^A-Za-z0-9_])${escapeRegex(needle)}([^A-Za-z0-9_]|$)`,
    "i",
  );
  return pattern.test(source);
}

function splitSpecTokenValue(raw) {
  return String(raw || "")
    .split(",")
    .map((piece) => piece.trim())
    .filter(Boolean);
}

function collectTokenMappingValues(node, bucket = []) {
  if (typeof node === "string") {
    for (const token of splitSpecTokenValue(node)) bucket.push(token);
    return bucket;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectTokenMappingValues(item, bucket);
    return bucket;
  }
  if (node && typeof node === "object") {
    for (const value of Object.values(node)) collectTokenMappingValues(value, bucket);
  }
  return bucket;
}

function buildRegistryLookup(registry) {
  const entries = [];
  const seen = new Set();

  for (const value of Object.values(registry)) {
    if (!value || typeof value !== "object") continue;
    const pathKey = String(value.path || "").trim();
    const slashKey = String(value.slashPath || "").trim();
    const dedupeKey = `${pathKey}|${slashKey}`;
    if (!pathKey && !slashKey) continue;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    entries.push(value);
  }

  const byPath = new Map();
  const bySlash = new Map();
  for (const entry of entries) {
    const pathKey = String(entry.path || "").trim();
    const slashKey = String(entry.slashPath || "").trim();
    if (pathKey) byPath.set(pathKey, entry);
    if (slashKey) bySlash.set(slashKey, entry);
  }

  return { entries, byPath, bySlash };
}

function resolveTokenForms(token, lookup) {
  const value = String(token || "").trim();
  if (!value) return [];

  const directByPath = lookup.byPath.get(value);
  const directBySlash = lookup.bySlash.get(value);
  const entry = directByPath || directBySlash;
  if (entry) {
    const forms = [String(entry.path || "").trim(), String(entry.slashPath || "").trim(), value].filter(Boolean);
    return Array.from(new Set(forms));
  }

  if (value.includes(".")) {
    const parts = value.split(".").filter(Boolean);
    const slash =
      parts.length > 1 && TOKEN_COLLECTION_PREFIXES.has(parts[0]) ? parts.slice(1).join("/") : parts.join("/");
    return Array.from(new Set([value, slash].filter(Boolean)));
  }

  if (value.includes("/")) {
    return [value];
  }

  return [value];
}

function includesAnyTokenForm(sectionText, forms) {
  const haystack = String(sectionText || "");
  for (const form of forms) {
    if (!form) continue;
    const escaped = escapeRegex(form);
    if (new RegExp(`\`${escaped}\``).test(haystack)) return true;
    if (
      new RegExp(`(^|[^A-Za-z0-9_./-])${escaped}([^A-Za-z0-9_./-]|$)`, "i").test(
        haystack,
      )
    )
      return true;
  }
  return false;
}

function checkSpecMarkdownConsistency({ spec, frontmatter, markdownContent, lookup }) {
  const errors = [];
  const componentApi = extractSectionBody(markdownContent, "Component API");
  const visualSpecs = extractSectionBody(markdownContent, "Visual Specifications");

  const properties = Array.isArray(spec.properties) ? spec.properties : [];
  for (const property of properties) {
    const name = String(property?.name ?? "").trim();
    if (!name) continue;
    if (!containsWholeTerm(componentApi, name)) {
      errors.push(`Missing property in markdown Component API: \`${name}\`.`);
    }

    const type = String(property?.type ?? "").trim().toLowerCase();
    if (type === "enum") {
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
        `Token mapping value \`${token}\` from spec is not documented in markdown Visual Specifications.`
      );
    }
  }

  const specStatus = String(spec.status || "").trim().toLowerCase();
  const docStatus = String(frontmatter.doc_status || "").trim().toLowerCase();
  if ((specStatus === "ready" && docStatus !== "ready") || (docStatus === "ready" && specStatus !== "ready")) {
    errors.push(
      `Lifecycle mismatch: spec status is \`${specStatus || "missing"}\` but markdown doc_status is \`${docStatus || "missing"}\`.`
    );
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function checkMarkdownFigmaConsistency({ spec, frontmatter, markdownContent }) {
  const errors = [];
  const figmaFm = frontmatter?.figma && typeof frontmatter.figma === "object" ? frontmatter.figma : {};
  const figmaSpec = spec?.figma && typeof spec.figma === "object" ? spec.figma : {};

  const specComponentSet = String(figmaSpec.component_set || "").trim();
  const markdownComponent = String(figmaFm.component || "").trim();
  if (specComponentSet && markdownComponent && specComponentSet !== markdownComponent) {
    errors.push(
      `Figma component mismatch: spec figma.component_set is \`${specComponentSet}\`, markdown figma.component is \`${markdownComponent}\`.`
    );
  }

  const specPage = String(figmaSpec.page || "").trim();
  const markdownPage = String(figmaFm.page || "").trim();
  if (specPage && markdownPage && specPage !== markdownPage) {
    errors.push(`Figma page mismatch: spec page is \`${specPage}\`, markdown page is \`${markdownPage}\`.`);
  }

  const specNode = normalizeNodeId(String(figmaSpec.component_set_node_id || "").trim());
  const markdownNode = normalizeNodeId(String(figmaFm.component_set_node_id || "").trim());
  if (specNode && markdownNode && specNode !== markdownNode) {
    errors.push(
      `Figma node mismatch: spec figma.component_set_node_id is \`${specNode}\`, markdown frontmatter has \`${markdownNode}\`.`
    );
  }

  const stateProperty = (Array.isArray(spec.properties) ? spec.properties : []).find((property) =>
    String(property?.name || "").trim().toLowerCase() === "state"
  );
  if (stateProperty) {
    const stateSection = extractSectionBody(markdownContent, "States");
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

function checkTokenValidity({ markdownPath, specPath, docsRoot, specRoot, registryPath }) {
  const report = validateDocs({
    docsRoot,
    specRoot,
    registryPath,
    filePath: markdownPath,
    specFilePath: specPath,
    checkOverview: false,
    checkSpecs: true,
  });

  const tokenErrors = report.errors.filter((finding) => TOKEN_CODES.has(String(finding.code || "")));
  const tokenWarnings = report.warnings.filter((finding) => TOKEN_CODES.has(String(finding.code || "")));

  return {
    ok: tokenErrors.length === 0,
    errors: tokenErrors,
    warnings: tokenWarnings,
  };
}

function buildSuggestedCommands({ markdownPath, specPath, registryPath }) {
  return [
    `npm run validate:docs -- --check token-registry --file "${markdownPath}" --spec-file "${specPath}" --no-overview true`,
    `npm run ds:component-doc -- --spec-file "${specPath}" --output "${markdownPath}" --registry "${registryPath}" --force true`,
    "npm run generate:registry",
  ];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const docsRoot = path.resolve(args["docs-root"] || path.join(DOCS_ROOT, "components"));
  const specRoot = path.resolve(args["spec-root"] || path.join(DOCS_SPEC_DIR, "components"));
  const registryPath = path.resolve(args.registry || DEFAULT_TOKEN_REGISTRY_PATH);
  const componentName = String(args["component-name"] || "").trim();

  let registry;
  try {
    registry = loadTokenRegistry(registryPath);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: false,
          generatedAt: new Date().toISOString(),
          summary: { componentsAudited: 0, failures: 1 },
          errors: [
            {
              code: "AUDIT_REGISTRY",
              message: error instanceof Error ? error.message : String(error),
              suggested: "Run `npm run generate:registry` before auditing consistency.",
            },
          ],
        },
        null,
        2
      )}\n`
    );
    process.exit(1);
  }

  const lookup = buildRegistryLookup(registry);
  const pairs = collectComponentPairs({ docsRoot, specRoot, componentName });
  if (pairs.length === 0) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: false,
          generatedAt: new Date().toISOString(),
          summary: { componentsAudited: 0, failures: 1 },
          errors: [
            {
              code: "AUDIT_INPUT",
              message: "No component pairs found to audit.",
              details: { docsRoot, specRoot, componentName: componentName || null },
            },
          ],
        },
        null,
        2
      )}\n`
    );
    process.exit(1);
  }

  const componentReports = [];

  for (const pair of pairs) {
    const problems = [];
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

    let spec;
    let markdown;
    let frontmatter;
    try {
      spec = parseYamlDocument(
        fs.readFileSync(pair.specPath, "utf8"),
        `spec YAML (${path.basename(pair.specPath)})`
      );
      markdown = fs.readFileSync(pair.markdownPath, "utf8");
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
      frontmatter: frontmatter && typeof frontmatter === "object" ? frontmatter : {},
      markdownContent: markdown,
      lookup,
    });
    const markdownFigma = checkMarkdownFigmaConsistency({
      spec,
      frontmatter: frontmatter && typeof frontmatter === "object" ? frontmatter : {},
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

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.ok ? 0 : 1);
}

main();
