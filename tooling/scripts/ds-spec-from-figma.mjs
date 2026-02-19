#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

import { parseArgs } from "./lib/parse-args.mjs";
import { runAgentPrompt } from "./lib/agent-runner.mjs";
import { validateDocs } from "./lib/docs-validator.mjs";
import { parseYamlDocument } from "./lib/parse-frontmatter.mjs";
import { DOCS_SPEC_DIR, PROJECT_ROOT } from "./lib/paths.mjs";
import {
  DEFAULT_TOKEN_REGISTRY_PATH,
  loadTokenRegistry,
} from "./lib/token-registry.mjs";
import {
  componentNameToSnakeCase,
  componentNameToDisplayName,
  normalizeComponentName,
} from "./lib/component-name.mjs";
import { isPlainObject } from "./lib/is-plain-object.mjs";
import { normalizeNodeId } from "./lib/node-id.mjs";
import { isTbdMarker } from "./lib/tbd.mjs";
import { SPEC_REQUIRED_TOP_LEVEL_FIELDS } from "./lib/docs-config.mjs";
import { buildAgentPrompt, RULE_BLOCKS } from "./lib/prompts.mjs";
import { GOLDEN_COMPONENT_SPEC_SAMPLE_PATH } from "./lib/doc-templates.mjs";

const SPEC_COMPONENTS_DIR = path.join(DOCS_SPEC_DIR, "components");
const SPEC_TEMPLATE_PATH = path.join(SPEC_COMPONENTS_DIR, "_template.yml");
const SPEC_TOP_LEVEL_ORDER = [
  "name",
  "status",
  "figma",
  "summary",
  "anatomy",
  "properties",
  "content_guidelines",
  "best_practices",
  "accessibility",
  "token_mapping",
  "qa",
  "related_components",
];
const FIGMA_FIELD_ORDER = [
  "file",
  "page",
  "component_set",
  "component_set_node_id",
];
const PROPERTY_FIELD_ORDER = [
  "name",
  "type",
  "values",
  "default",
  "required",
  "description",
];
const PROPERTY_TYPE_ORDER = new Map([
  ["variant", 1],
  ["enum", 1],
  ["text", 2],
  ["boolean", 3],
  ["instance_swap", 4],
]);

function normalizePropertyType(rawType) {
  const withoutSuffix = String(rawType || "")
    .trim()
    .split("#")[0]
    .trim();
  if (!withoutSuffix) return "";

  return withoutSuffix
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

function parseFigmaUrl(figmaUrl) {
  if (!figmaUrl) return { fileKey: "", nodeId: "" };
  let url;
  try {
    url = new URL(figmaUrl);
  } catch {
    return { fileKey: "", nodeId: "" };
  }

  const pathnameParts = url.pathname.split("/").filter(Boolean);
  const designIndex = pathnameParts.findIndex((part) => part === "design");
  const fileKey =
    designIndex >= 0 && pathnameParts[designIndex + 1]
      ? pathnameParts[designIndex + 1]
      : "";

  const nodeId = normalizeNodeId(url.searchParams.get("node-id") || "");
  return { fileKey, nodeId };
}

function deepClone(value) {
  if (Array.isArray(value)) return value.map((item) => deepClone(item));
  if (isPlainObject(value)) {
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = deepClone(child);
    }
    return result;
  }
  return value;
}

function mergeWithTemplate(templateValue, generatedValue) {
  if (generatedValue === undefined) return deepClone(templateValue);

  if (Array.isArray(templateValue)) {
    return Array.isArray(generatedValue)
      ? deepClone(generatedValue)
      : deepClone(templateValue);
  }

  if (isPlainObject(templateValue)) {
    const generatedObject = isPlainObject(generatedValue) ? generatedValue : {};
    const result = {};

    for (const [key, childTemplate] of Object.entries(templateValue)) {
      result[key] = mergeWithTemplate(childTemplate, generatedObject[key]);
    }

    for (const [key, childValue] of Object.entries(generatedObject)) {
      if (!(key in result)) result[key] = deepClone(childValue);
    }

    return result;
  }

  return deepClone(generatedValue);
}

function normalizeSpecOrder(spec) {
  const ordered = {};
  for (const key of SPEC_TOP_LEVEL_ORDER) {
    if (key in spec) ordered[key] = spec[key];
  }
  for (const [key, value] of Object.entries(spec)) {
    if (!(key in ordered)) ordered[key] = value;
  }
  if (isPlainObject(ordered.figma)) {
    const figmaOrdered = {};
    for (const key of FIGMA_FIELD_ORDER) {
      if (key in ordered.figma) figmaOrdered[key] = ordered.figma[key];
    }
    for (const [key, value] of Object.entries(ordered.figma)) {
      if (!(key in figmaOrdered)) figmaOrdered[key] = value;
    }
    ordered.figma = figmaOrdered;
  }

  if (Array.isArray(ordered.properties)) {
    const stableDecorated = ordered.properties.map((item, index) => ({
      item: isPlainObject(item) ? item : {},
      index,
    }));
    stableDecorated.sort((a, b) => {
      const typeA = normalizePropertyType(a.item.type);
      const typeB = normalizePropertyType(b.item.type);
      const groupA = PROPERTY_TYPE_ORDER.get(typeA) || Number.MAX_SAFE_INTEGER;
      const groupB = PROPERTY_TYPE_ORDER.get(typeB) || Number.MAX_SAFE_INTEGER;
      if (groupA !== groupB) return groupA - groupB;
      return a.index - b.index;
    });

    ordered.properties = stableDecorated.map(({ item }) => {
      const propertyOrdered = {};
      for (const key of PROPERTY_FIELD_ORDER) {
        if (key in item) propertyOrdered[key] = item[key];
      }
      for (const [key, value] of Object.entries(item)) {
        if (!(key in propertyOrdered)) propertyOrdered[key] = value;
      }
      return propertyOrdered;
    });
  }

  return ordered;
}

function normalizeCompareKey(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function extractUniqueRegistryEntries(registryIndex) {
  const unique = [];
  const seen = new Set();

  for (const entry of Object.values(registryIndex || {})) {
    if (!entry || typeof entry !== "object") continue;
    const marker = [
      String(entry.path || ""),
      String(entry.slashPath || ""),
      String(entry.cssVar || ""),
      String(entry.collection || ""),
    ].join("|");
    if (seen.has(marker)) continue;
    seen.add(marker);
    unique.push(entry);
  }

  return unique;
}

function pickComponentTokenCandidates(registryEntries, componentName) {
  const componentKey = normalizeCompareKey(componentName);
  if (!componentKey) return [];

  const matches = [];
  for (const entry of registryEntries) {
    if (!entry.path || !String(entry.path).includes(".")) continue;
    if (String(entry.collection || "").toLowerCase() !== "components") continue;
    const parts = String(entry.path).split(".");
    if (parts.length < 3) continue;
    if (normalizeCompareKey(parts[1]) !== componentKey) continue;
    matches.push(entry);
  }
  return matches;
}

function buildTokenMenuLines(registryEntries, componentName, limit = 24) {
  const preferred = pickComponentTokenCandidates(
    registryEntries,
    componentName,
  );
  const fallback = registryEntries.filter((entry) => {
    const collection = String(entry.collection || "").toLowerCase();
    return collection === "semantic" || collection === "primitives";
  });
  const source = preferred.length > 0 ? preferred : fallback;
  const selected = source.slice(0, Math.max(0, limit));
  return selected.map((entry) => {
    const tokenPath = String(entry.slashPath || entry.path || "").trim();
    const tokenType = String(entry.type || "unknown").trim();
    const resolved = String(entry.resolvedValue || "").trim();
    return resolved
      ? `${tokenPath} (${tokenType}: ${resolved})`
      : `${tokenPath} (${tokenType})`;
  });
}

function extractKeywords(raw) {
  const stopWords = new Set([
    "default",
    "state",
    "type",
    "variant",
    "token",
    "tokens",
    "value",
    "values",
  ]);
  return String(raw || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part && !stopWords.has(part));
}

function scoreTokenCandidate(entry, keywords) {
  const haystack =
    `${String(entry.path || "")} ${String(entry.slashPath || "")}`.toLowerCase();
  let score = 0;

  for (const keyword of keywords) {
    if (!keyword) continue;
    if (haystack.includes(keyword)) score += 1;
  }

  return score;
}

function pickBestTokenPath(candidates, keyPath, condition) {
  const keywords = extractKeywords(`${keyPath} ${condition}`);
  if (keywords.length === 0) return "";

  let best = null;
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
      const currentLen = String(candidate.path || "").length;
      const bestLen = String(best.path || "").length;
      if (currentLen < bestLen) best = candidate;
    }
  }

  const isStrongMatch = bestScore >= 2;
  const isUniqueSingleKeywordMatch = bestScore === 1 && bestScoreCount === 1;
  if (!best || (!isStrongMatch && !isUniqueSingleKeywordMatch)) return "";
  return String(best.slashPath || best.path || "").trim();
}

function prefillTokenMapping(node, componentTokenCandidates, keyPath = "") {
  if (!isPlainObject(node)) return 0;
  let filledCount = 0;

  const entries = Object.entries(node);
  const isConditionMap =
    entries.length > 0 &&
    entries.every(([, value]) => typeof value === "string");

  if (isConditionMap) {
    for (const [condition, value] of entries) {
      if (!isTbdMarker(value)) continue;
      const suggestion = pickBestTokenPath(
        componentTokenCandidates,
        keyPath,
        condition,
      );
      if (!suggestion) continue;
      node[condition] = suggestion;
      filledCount += 1;
    }
    return filledCount;
  }

  for (const [key, value] of entries) {
    const nextPath = keyPath ? `${keyPath}.${key}` : key;

    if (typeof value === "string") {
      if (!isTbdMarker(value)) continue;
      const suggestion = pickBestTokenPath(
        componentTokenCandidates,
        nextPath,
        key,
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
        nextPath,
      );
    }
  }

  return filledCount;
}

function countTbdValues(value) {
  if (typeof value === "string") return isTbdMarker(value) ? 1 : 0;
  if (Array.isArray(value))
    return value.reduce((sum, item) => sum + countTbdValues(item), 0);
  if (isPlainObject(value)) {
    return Object.values(value).reduce(
      (sum, item) => sum + countTbdValues(item),
      0,
    );
  }
  return 0;
}

function formatYamlFile(outputPath) {
  const result = spawnSync("npx", ["prettier", "--write", outputPath], {
    stdio: "inherit",
  });
  if (result.error) {
    throw new Error(
      `Failed to run Prettier for YAML output: ${result.error.message}`,
    );
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`Prettier exited with code ${result.status}`);
  }
}

function buildOutputPath(args, specRoot, componentSlug, nodeId) {
  if (args.output) return path.resolve(args.output);
  if (componentSlug)
    return path.join(path.resolve(specRoot), `${componentSlug}.yml`);
  if (nodeId)
    return path.join(
      path.resolve(specRoot),
      `component_${nodeId.replace(":", "_")}.yml`,
    );
  return "";
}

function buildPrompt({
  figmaUrl,
  nodeId,
  componentName,
  outputPath,
  templatePath,
  registryPath,
  fileKeyFromUrl,
  tokenMenuLines,
}) {
  return buildAgentPrompt({
    context: [
      "Generate one component spec YAML from Figma for this repository's documentation pipeline.",
      componentName ? `Expected component name: ${componentName}` : "",
      nodeId ? `Target component set node id: ${nodeId}` : "",
      fileKeyFromUrl ? `Figma file key from URL: ${fileKeyFromUrl}` : "",
    ],
    sources: [
      figmaUrl
        ? `Figma URL: ${figmaUrl}`
        : "Figma URL: not provided (use node id or name lookup).",
      `Spec template: ${templatePath}`,
      `Token registry: ${registryPath}`,
      `Golden spec example for structure/detail: ${GOLDEN_COMPONENT_SPEC_SAMPLE_PATH}`,
      ...(tokenMenuLines.length > 0
        ? [
            "Token menu (prefer these exact paths when applicable):",
            ...tokenMenuLines,
          ]
        : []),
      "Existing spec reference: docs/_spec/components/alert.yml",
      `Output path (required): ${outputPath}`,
    ],
    constraints: [
      RULE_BLOCKS.FIGMA_MCP_WORKFLOW,
      "Write YAML only (no markdown, no code fences).",
      `Include required top-level fields: ${SPEC_REQUIRED_TOP_LEVEL_FIELDS.join(", ")}.`,
      `Top-level YAML key order must be: ${SPEC_TOP_LEVEL_ORDER.join(" -> ")}.`,
      "Set figma.file, figma.page, figma.component_set from evidence.",
      "Set figma.component_set_node_id when node-id is available from URL/context.",
      "In token_mapping, use token paths that exist in the token registry.",
      "Prefer token paths from the provided token menu before proposing any other registry path.",
      "If a field is not inferable, set it to `TBD` instead of guessing.",
      RULE_BLOCKS.NO_VARIABLE_IDS,
      "Keep language in English and concise.",
    ],
    expectedOutput: [
      "Write/update exactly one file at the output path.",
      "Return a short report: output path, component name, unresolved TBD count.",
    ],
  });
}

function ensureSpecMetadata(spec, { componentName, nodeId, fileKeyFromUrl }) {
  if (!isPlainObject(spec.figma)) spec.figma = {};
  if (componentName && isTbdMarker(spec.name))
    spec.name = componentNameToDisplayName(componentName);
  if (componentName && !String(spec.name || "").trim())
    spec.name = componentNameToDisplayName(componentName);

  if (fileKeyFromUrl && (!spec.figma.file || isTbdMarker(spec.figma.file))) {
    spec.figma.file = fileKeyFromUrl;
  }
  if (
    nodeId &&
    (!spec.figma.component_set_node_id ||
      isTbdMarker(spec.figma.component_set_node_id))
  ) {
    spec.figma.component_set_node_id = nodeId;
  }
  return spec;
}

function validateGeneratedSpec(outputPath, registryPath) {
  const report = validateDocs({
    docsRoot: path.join(PROJECT_ROOT, "__docs_validation_stub__"),
    registryPath,
    checkOverview: false,
    checkSpecs: true,
    specFilePath: outputPath,
  });

  const relevantErrors = report.errors.filter(
    (error) => path.resolve(error.file || "") === path.resolve(outputPath),
  );
  return {
    ok: report.ok,
    report,
    errors: relevantErrors.length > 0 ? relevantErrors : report.errors,
  };
}

function buildSpecValidationFeedbackPrompt({
  basePrompt,
  outputPath,
  validationErrors,
}) {
  return (
    `${basePrompt}\n\n` +
    "Validation Feedback\n" +
    `- The generated spec at \`${outputPath}\` failed validation.\n` +
    "- Fix the same output file in place.\n" +
    "- Keep required top-level fields and canonical key order.\n" +
    "- Validation errors (JSON):\n" +
    `${JSON.stringify(validationErrors, null, 2)}\n`
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const figmaUrl = String(args.url || "").trim();
  const explicitNodeId = normalizeNodeId(args["component-set-node-id"] || "");
  const rawComponentName = String(args["component-name"] || "").trim();
  const normalizedName = normalizeComponentName(rawComponentName);
  const componentName = normalizedName.displayName;
  const componentSlug = normalizedName.fileSlug;
  const specRoot = args["spec-root"] || SPEC_COMPONENTS_DIR;
  const templatePath = path.resolve(args.template || SPEC_TEMPLATE_PATH);
  const registryPath = path.resolve(
    args.registry || DEFAULT_TOKEN_REGISTRY_PATH,
  );
  const force = String(args.force || "false") === "true";
  const skipValidation = String(args["skip-validation"] || "false") === "true";
  const agent = args.agent || "auto";

  if (skipValidation && !force) {
    console.error(
      "Validation gate bypass requires explicit force.\n" +
        "Use `--skip-validation true --force true` only for exceptional cases.",
    );
    process.exit(1);
  }

  const parsedUrl = parseFigmaUrl(figmaUrl);
  const fileKeyFromUrl = parsedUrl.fileKey;
  const nodeId = explicitNodeId || parsedUrl.nodeId;

  if (!figmaUrl && !nodeId && !rawComponentName) {
    console.error(
      "Missing Figma source.\nUse one of:\n- --url <figma-url>\n- --component-set-node-id <node-id>\n- --component-name <name> (less deterministic)",
    );
    process.exit(1);
  }

  const outputPath = buildOutputPath(args, specRoot, componentSlug, nodeId);
  if (!outputPath) {
    console.error(
      "Missing output target.\nProvide --output or --component-name.",
    );
    process.exit(1);
  }

  if (!fs.existsSync(templatePath)) {
    console.error(`Spec template not found: ${templatePath}`);
    process.exit(1);
  }

  let registryIndex;
  try {
    registryIndex = loadTokenRegistry(registryPath);
  } catch (error) {
    console.error(
      `${error instanceof Error ? error.message : String(error)}. Run \`npm run generate:registry\` first.`,
    );
    process.exit(1);
  }

  const prompt = buildPrompt({
    figmaUrl,
    nodeId,
    componentName,
    outputPath,
    templatePath,
    registryPath,
    fileKeyFromUrl,
    tokenMenuLines: buildTokenMenuLines(
      extractUniqueRegistryEntries(registryIndex),
      componentName || componentSlug,
    ),
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  try {
    const materializeAndWriteSpec = () => {
      if (!fs.existsSync(outputPath)) {
        throw new Error(
          `Expected generated spec file not found at ${outputPath}`,
        );
      }

      const templateSpec = parseYamlDocument(
        fs.readFileSync(templatePath, "utf8"),
        `spec template (${templatePath})`,
      );
      const generatedSpecRaw = parseYamlDocument(
        fs.readFileSync(outputPath, "utf8"),
        `generated spec (${outputPath})`,
      );

      const mergedSpec = mergeWithTemplate(templateSpec, generatedSpecRaw);
      ensureSpecMetadata(mergedSpec, { componentName, nodeId, fileKeyFromUrl });

      const registryEntries = extractUniqueRegistryEntries(registryIndex);
      const tokenCandidates = pickComponentTokenCandidates(
        registryEntries,
        mergedSpec.name || componentName,
      );
      const prefilledCount = prefillTokenMapping(
        mergedSpec.token_mapping,
        tokenCandidates,
        "token_mapping",
      );

      const normalizedSpec = normalizeSpecOrder(mergedSpec);
      fs.writeFileSync(
        outputPath,
        yaml.dump(normalizedSpec, {
          lineWidth: 120,
          noRefs: true,
          sortKeys: false,
        }),
        "utf8",
      );
      formatYamlFile(outputPath);

      return {
        normalizedSpec,
        prefilledCount,
      };
    };

    runAgentPrompt({
      prompt,
      agent,
      label: `spec-from-figma-${componentNameToSnakeCase(componentName || nodeId || "component")}`,
    });
    let { normalizedSpec, prefilledCount } = materializeAndWriteSpec();

    let validationReport = null;
    if (!skipValidation) {
      let validation = validateGeneratedSpec(outputPath, registryPath);
      if (!validation.ok) {
        const feedbackPrompt = buildSpecValidationFeedbackPrompt({
          basePrompt: prompt,
          outputPath,
          validationErrors: validation.errors,
        });
        runAgentPrompt({
          prompt: feedbackPrompt,
          agent,
          label: `spec-from-figma-repair-${componentNameToSnakeCase(componentName || nodeId || "component")}`,
        });
        ({ normalizedSpec, prefilledCount } = materializeAndWriteSpec());
        validation = validateGeneratedSpec(outputPath, registryPath);
        if (!validation.ok) {
          throw new Error(
            `Generated spec failed validation after automatic repair.\n${JSON.stringify(
              {
                file: outputPath,
                errors: validation.errors,
              },
              null,
              2,
            )}`,
          );
        }
      }
      validationReport = validation.report;
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          outputPath,
          componentName: normalizedSpec.name || componentName || null,
          componentSetNodeId: nodeId || null,
          tokenPrefilled: prefilledCount,
          unresolvedTbdCount: countTbdValues(normalizedSpec),
          validation: validationReport
            ? {
                ok: validationReport.ok,
                errors: validationReport.summary.errors,
                warnings: validationReport.summary.warnings,
              }
            : { skipped: true },
        },
        null,
        2,
      )}\n`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
