import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  COMPONENT_DOCS_DIR,
  DOCS_SPEC_DIR,
  resolveProjectPath,
} from "./paths.mjs";
import {
  loadTokenRegistry,
  DEFAULT_TOKEN_REGISTRY_PATH,
} from "./token-registry.mjs";
import {
  parseMarkdownFrontmatter,
  parseYamlDocument,
} from "./parse-frontmatter.mjs";
import {
  extractGapsFromSpec,
  buildGapsChecklistLines,
  extractGapsSection,
  extractNonEmptySectionLines,
} from "./gaps.mjs";
import {
  componentNameToSnakeCase,
  isSnakeCaseFileSlug,
} from "./component-name.mjs";
import { isPlainObject } from "./is-plain-object.mjs";
import { normalizeNodeId } from "./node-id.mjs";
import { deriveFigmaFrontmatterTraceability } from "./figma-traceability.mjs";
import { isTbdMarker } from "./tbd.mjs";
import {
  ALLOWED_DOC_STATUS,
  CANONICAL_H2_ORDER,
  COMPONENT_REQUIRED_FIGMA_FRONTMATTER_FIELDS,
  REQUIRED_CANONICAL_H2,
  SPEC_ALLOWED_STATUS,
  SPEC_REQUIRED_TOP_LEVEL_FIELDS,
  TRACEABILITY_CONTRACT_VERSION,
} from "./docs-config.mjs";

export { CANONICAL_H2_ORDER, REQUIRED_CANONICAL_H2 } from "./docs-config.mjs";
export { OPTIONAL_CANONICAL_H2 } from "./docs-config.mjs";
const REQUIRED_H2 = REQUIRED_CANONICAL_H2;
const COLLECTION_PREFIXES = new Set([
  "Semantic",
  "Primitives",
  "Components",
  "A11y",
]);
const DOT_TOKEN_RE = /[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+){1,}/g;
const SLASH_TOKEN_RE = /[A-Za-z][A-Za-z0-9-]*(?:\/[A-Za-z0-9-]+){1,}/g;
const VARIABLE_ID_RE_SOURCE = "VariableID:[A-Za-z0-9:-]+";
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CSS_COLOR_FUNC_RE = /^(?:rgb|rgba|hsl|hsla)\(/i;
const CSS_DIMENSION_RE = /^-?\d+(?:\.\d+)?(?:px|rem|em|%)?$/i;
const SPEC_COMPONENTS_DIR = `${DOCS_SPEC_DIR}/components`;
const RULE_MANIFEST_PATH = resolveProjectPath(".agent", "rules", "_manifest.yml");
const SPEC_PROPERTY_GROUP_ORDER = new Map([
  ["variant", 1],
  ["enum", 1],
  ["text", 2],
  ["boolean", 3],
  ["instance_swap", 4],
]);
const CANONICAL_COMPONENT_LIST_HEADING = "component list";
const OVERVIEW_ENTRY_RE = /^-\s+\[([^\]]+)\]\(([^)]+)\)\s*$/;
const OVERVIEW_TARGET_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*\.md$/;
const FIGMA_NODE_ID_RE = /^[A-Za-z0-9]+:[A-Za-z0-9]+$/;
const HASH_RE = /^[a-f0-9]{64}$/i;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function normalizeSlashPathCandidate(tokenPath) {
  const parts = tokenPath.split("/");
  if (parts.length > 1 && COLLECTION_PREFIXES.has(parts[0])) {
    return parts.slice(1).join("/");
  }
  return tokenPath;
}

function normalizeA11yModePath(tokenPath) {
  if (tokenPath.startsWith("A11y.A11y.mode")) {
    return tokenPath.replace(/^A11y\.A11y\.mode[A-Za-z0-9_-]+\./, "A11y.A11y.");
  }
  if (tokenPath.startsWith("A11y/A11y/mode")) {
    return tokenPath.replace(/^A11y\/A11y\/mode[A-Za-z0-9_-]+\//, "A11y/A11y/");
  }
  return tokenPath;
}

function buildLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function lineFromOffset(lineStarts, offset) {
  let left = 0;
  let right = lineStarts.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const start = lineStarts[mid];
    const nextStart =
      mid + 1 < lineStarts.length
        ? lineStarts[mid + 1]
        : Number.MAX_SAFE_INTEGER;
    if (offset >= start && offset < nextStart) return mid + 1;
    if (offset < start) right = mid - 1;
    else left = mid + 1;
  }
  return 1;
}

function collectMarkdownFiles(docsRoot, explicitFilePath) {
  if (explicitFilePath) return [path.resolve(explicitFilePath)];
  if (!fs.existsSync(docsRoot)) return [];
  return fs
    .readdirSync(docsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(docsRoot, entry.name))
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function collectSpecFiles(specRoot) {
  if (!fs.existsSync(specRoot)) return [];
  return fs
    .readdirSync(specRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".yml") &&
        entry.name !== "_template.yml",
    )
    .map((entry) => path.join(specRoot, entry.name))
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function buildRegistryIndexes(registryObj) {
  const keys = Object.keys(registryObj);
  const keySet = new Set(keys);
  const lowerMap = new Map(keys.map((key) => [key.toLowerCase(), key]));
  const entriesByKey = new Map(keys.map((key) => [key, registryObj[key]]));

  const dotRoots = new Set();
  const slashRoots = new Set();
  for (const key of keys) {
    if (key.includes(".")) dotRoots.add(key.split(".")[0]);
    if (key.includes("/")) slashRoots.add(key.split("/")[0]);
  }

  return { keySet, lowerMap, dotRoots, slashRoots, entriesByKey };
}

function extractTokenCandidatesFromSpan(spanText) {
  const results = [];
  for (const regex of [DOT_TOKEN_RE, SLASH_TOKEN_RE]) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(spanText)) !== null) {
      const token = match[0]?.trim();
      if (token) results.push({ token, localOffset: match.index });
    }
  }
  return results;
}

function looksLikeTokenPath(candidate, dotRoots, slashRoots) {
  if (!candidate) return false;
  if (candidate.includes("/")) {
    const first = candidate.split("/")[0];
    if (slashRoots.has(first) || COLLECTION_PREFIXES.has(first)) return true;
    return false;
  }
  if (candidate.includes(".")) {
    const first = candidate.split(".")[0];
    return dotRoots.has(first);
  }
  return false;
}

function resolveTokenCandidate(candidate, registryIndexes) {
  const { keySet, lowerMap } = registryIndexes;
  const variants = new Set();

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

function extractResolvedTokenRefsFromText(text, registryIndexes) {
  const refs = [];
  const seen = new Set();
  const codeSpanRegex = /`([^`\n]+)`/g;
  let spanMatch;

  while ((spanMatch = codeSpanRegex.exec(String(text || ""))) !== null) {
    const span = spanMatch[1];
    const candidates = extractTokenCandidatesFromSpan(span);
    for (const item of candidates) {
      const tokenPath = item.token;
      if (
        !looksLikeTokenPath(
          tokenPath,
          registryIndexes.dotRoots,
          registryIndexes.slashRoots,
        )
      )
        continue;
      const resolution = resolveTokenCandidate(tokenPath, registryIndexes);
      if (!resolution.ok) continue;
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

function inferFallbackKind(tokenRefs) {
  const types = new Set(
    tokenRefs
      .map((ref) =>
        String(ref.entry?.type || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean),
  );
  if (types.size !== 1) return "generic";
  const onlyType = Array.from(types)[0];
  if (onlyType === "color") return "color";
  if (onlyType === "dimension") return "dimension";
  return "generic";
}

function normalizeFallbackValue(raw) {
  return String(raw || "")
    .replace(/[`*]/g, "")
    .trim()
    .replace(/^[\(\[]+/, "")
    .replace(/[\)\].,:;]+$/, "")
    .trim();
}

function hasConcreteFallbackValue(raw) {
  const value = normalizeFallbackValue(raw);
  return !!value && !/^tbd$/i.test(value) && !/^[-—]+$/.test(value);
}

function isFallbackCompatible(raw, kind) {
  const value = normalizeFallbackValue(raw);
  if (!hasConcreteFallbackValue(value)) return false;

  if (kind === "color") {
    if (CSS_COLOR_FUNC_RE.test(value)) return true;
    const parts = value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.every(
      (part) => HEX_COLOR_RE.test(part) || /^transparent$/i.test(part),
    );
  }
  if (kind === "dimension") {
    return CSS_DIMENSION_RE.test(value);
  }

  return true;
}

function extractFallbackFromLine(line, registryIndexes) {
  const rawLine = String(line || "");
  if (!rawLine) return "";

  const codeSpanRegex = /`([^`\n]+)`/g;
  const codeSpans = [];
  let match;
  while ((match = codeSpanRegex.exec(rawLine)) !== null) {
    codeSpans.push(match[1]);
  }

  for (const span of codeSpans) {
    const isTokenLike = extractTokenCandidatesFromSpan(span).some((candidate) =>
      looksLikeTokenPath(
        candidate.token,
        registryIndexes.dotRoots,
        registryIndexes.slashRoots,
      ),
    );
    if (!isTokenLike && hasConcreteFallbackValue(span)) return span;
  }

  const explicitFallbackMatch = rawLine.match(/fallback[^:]*:\s*([^|]+)$/i);
  if (
    explicitFallbackMatch &&
    hasConcreteFallbackValue(explicitFallbackMatch[1])
  ) {
    return explicitFallbackMatch[1];
  }

  const parentheticalMatch = rawLine.match(/\(([^)]+)\)/);
  if (parentheticalMatch && hasConcreteFallbackValue(parentheticalMatch[1])) {
    return parentheticalMatch[1];
  }

  return "";
}

function normalizeHeadingText(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function collectH2Headings(content) {
  const headings = [];
  const regex = /^##\s+(.+?)\s*$/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    headings.push({
      heading: match[1].trim(),
      normalized: normalizeHeadingText(match[1]),
      offset: match.index,
    });
  }
  return headings;
}

function validateSectionOrder(
  filePath,
  content,
  report,
  lineStarts,
  baseOffset = 0,
  options = {},
) {
  const allowExtraH2 = Boolean(options.allowExtraH2);
  const headings = collectH2Headings(content);
  const canonicalIndex = new Map(
    CANONICAL_H2_ORDER.map((heading, index) => [
      normalizeHeadingText(heading),
      index,
    ]),
  );
  const firstOccurrence = new Map();
  const duplicateHeadings = new Set();

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
      code: "SEC01",
      file: filePath,
      line: lineFromOffset(lineStarts, baseOffset + first.offset),
      message: `Duplicate H2 heading is not allowed: \`## ${first.heading}\`.`,
    });
  }

  for (const required of REQUIRED_H2) {
    const key = normalizeHeadingText(required);
    const found = firstOccurrence.get(key);
    if (!found) {
      report.errors.push({
        code: "SEC01",
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
        code: "SEC02",
        file: filePath,
        line: lineFromOffset(lineStarts, baseOffset + heading.offset),
        message:
          `Unauthorized H2 heading: \`## ${heading.heading}\`. ` +
          `Allowed H2 headings: ${CANONICAL_H2_ORDER.join(", ")}.`,
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
        "the previous canonical heading";
      report.errors.push({
        code: "SEC01",
        file: filePath,
        line: lineFromOffset(lineStarts, baseOffset + heading.offset),
        message:
          `Heading out of canonical order: \`## ${heading.heading}\`. ` +
          `Move it after \`## ${expectedNext}\` according to canonical H2 order.`,
      });
    }
    previousCanonicalIndex = Math.max(previousCanonicalIndex, currentIndex);
  }
}

function validateFrontmatter(filePath, frontmatter, report) {
  const status = String(frontmatter.doc_status || "").trim();
  if (!ALLOWED_DOC_STATUS.has(status)) {
    report.errors.push({
      code: "FM02",
      file: filePath,
      message:
        "Frontmatter `doc_status` must be one of: draft, ready, needs-review.",
    });
  }
}

function validateOptionalVersionBlock({
  filePath,
  versionNode,
  allowedKeys,
  report,
  context,
}) {
  if (versionNode === undefined || versionNode === null || versionNode === "")
    return;

  if (!isPlainObject(versionNode)) {
    report.errors.push({
      code: "VER01",
      file: filePath,
      message: `${context} \`version\` must be an object when declared.`,
    });
    return;
  }

  for (const [key, rawValue] of Object.entries(versionNode)) {
    if (!allowedKeys.has(key)) {
      report.errors.push({
        code: "VER01",
        file: filePath,
        message: `${context} version key \`${key}\` is not allowed.`,
      });
      continue;
    }

    const value = String(rawValue ?? "").trim();
    if (!value || isTbdMarker(value) || !SEMVER_RE.test(value)) {
      report.errors.push({
        code: "VER01",
        file: filePath,
        message: `${context} version \`${key}\` must be a SemVer string (for example \`1.2.3\`).`,
      });
    }
  }
}

function validateComponentFrontmatter(filePath, frontmatter, report) {
  if (frontmatter.doc_type !== "component") {
    report.errors.push({
      code: "FM01",
      file: filePath,
      message: "Frontmatter must include `doc_type: component`.",
    });
  }

  validateFrontmatter(filePath, frontmatter, report);

  const figma = frontmatter.figma;
  if (!figma || typeof figma !== "object" || Array.isArray(figma)) {
    report.errors.push({
      code: "FM01",
      file: filePath,
      message: "Frontmatter `figma` object is required.",
    });
    return;
  }

  for (const field of COMPONENT_REQUIRED_FIGMA_FRONTMATTER_FIELDS) {
    const value = String(figma[field] ?? "").trim();
    if (!value) {
      report.errors.push({
        code: "FM01",
        file: filePath,
        message: `Frontmatter figma.${field} is required.`,
      });
    }
  }

  const componentHash = String(figma.component_hash ?? "").trim();
  if (componentHash) {
    if (isTbdMarker(componentHash) || !HASH_RE.test(componentHash)) {
      report.errors.push({
        code: "FM01",
        file: filePath,
        message:
          "Frontmatter figma.component_hash must be a 64-char sha256 hex string when declared.",
      });
    }
  }

  const validateOptionalCountField = (fieldName) => {
    const raw = figma[fieldName];
    if (raw === undefined || raw === null || raw === "") return;
    const text = String(raw).trim();
    if (!text) return;
    if (isTbdMarker(text)) {
      report.errors.push({
        code: "FM01",
        file: filePath,
        message: `Frontmatter figma.${fieldName} must be a non-negative integer when declared.`,
      });
      return;
    }
    const value = Number(text);
    if (!Number.isInteger(value) || value < 0) {
      report.errors.push({
        code: "FM01",
        file: filePath,
        message: `Frontmatter figma.${fieldName} must be a non-negative integer when declared.`,
      });
    }
  };

  validateOptionalCountField("properties_count");
  validateOptionalCountField("variants_count");

  validateOptionalVersionBlock({
    filePath,
    versionNode: frontmatter.version,
    allowedKeys: new Set(["spec", "component", "docs"]),
    report,
    context: "Frontmatter",
  });
}

function validateOverviewFrontmatter(filePath, frontmatter, report) {
  if (frontmatter.doc_type !== "overview") {
    report.errors.push({
      code: "FM01",
      file: filePath,
      message: "Overview frontmatter must include `doc_type: overview`.",
    });
  }

  validateFrontmatter(filePath, frontmatter, report);
}

function readComponentSpecByDocPath(componentDocPath, specRoot, options = {}) {
  const explicitSpecFilePath = options.specFilePath
    ? path.resolve(String(options.specFilePath))
    : "";
  const fileBase = path.basename(
    componentDocPath,
    path.extname(componentDocPath),
  );
  const specPath =
    explicitSpecFilePath || path.join(specRoot, `${fileBase}.yml`);
  if (!fs.existsSync(specPath)) {
    return {
      specPath,
      exists: false,
      status: "",
      componentSetNodeIdRaw: "",
      componentSetNodeId: "",
      parsed: null,
    };
  }

  try {
    const parsed = parseYamlDocument(
      fs.readFileSync(specPath, "utf8"),
      `spec YAML (${path.basename(specPath)})`,
    );
    const status = String(parsed.status || "")
      .trim()
      .toLowerCase();
    const figma = isPlainObject(parsed.figma) ? parsed.figma : {};
    const componentSetNodeIdRaw = String(
      figma.component_set_node_id || "",
    ).trim();
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
      status: "",
      componentSetNodeIdRaw: "",
      componentSetNodeId: "",
      parsed: null,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

function validateMarkdownTraceabilityNodeId(
  filePath,
  frontmatter,
  specRoot,
  report,
  specResolution = {},
) {
  const figma = isPlainObject(frontmatter.figma) ? frontmatter.figma : {};
  const markdownNodeIdRaw = String(figma.component_set_node_id || "").trim();
  if (!markdownNodeIdRaw) return;

  if (isTbdMarker(markdownNodeIdRaw)) {
    report.errors.push({
      code: "TRACE01",
      file: filePath,
      message:
        "Frontmatter figma.component_set_node_id must not be `TBD` when declared.",
    });
    return;
  }

  const markdownNodeId = normalizeNodeId(markdownNodeIdRaw);
  if (!isValidNodeId(markdownNodeId)) {
    report.errors.push({
      code: "TRACE01",
      file: filePath,
      message:
        "Frontmatter figma.component_set_node_id must use Figma node-id format `123:456`.",
    });
    return;
  }

  const spec = readComponentSpecByDocPath(filePath, specRoot, specResolution);
  if (!spec.exists) {
    report.errors.push({
      code: "TRACE01",
      file: filePath,
      message:
        "Traceability mismatch: markdown declares figma.component_set_node_id but linked spec file is missing.",
      suggested: path.relative(process.cwd(), spec.specPath),
    });
    return;
  }

  if (spec.parseError) {
    report.errors.push({
      code: "TRACE01",
      file: filePath,
      message: `Linked spec cannot be parsed for traceability check: ${spec.parseError}`,
      suggested: path.relative(process.cwd(), spec.specPath),
    });
    return;
  }

  if (!spec.componentSetNodeIdRaw || isTbdMarker(spec.componentSetNodeIdRaw)) {
    report.errors.push({
      code: "TRACE01",
      file: filePath,
      message:
        "Traceability mismatch: markdown has figma.component_set_node_id but spec does not declare a concrete figma.component_set_node_id.",
      suggested: path.relative(process.cwd(), spec.specPath),
    });
    return;
  }

  if (spec.componentSetNodeId !== markdownNodeId) {
    report.errors.push({
      code: "TRACE01",
      file: filePath,
      message:
        `Traceability mismatch: markdown figma.component_set_node_id (${markdownNodeId}) ` +
        `differs from spec value (${spec.componentSetNodeId}).`,
      suggested: path.relative(process.cwd(), spec.specPath),
    });
  }
}

function validateGeneratedTraceability(
  filePath,
  frontmatter,
  specRoot,
  registryPath,
  report,
  specResolution = {},
) {
  const spec = readComponentSpecByDocPath(filePath, specRoot, specResolution);
  if (!spec.exists || spec.parseError) return;
  const regenerateCommand = buildTraceabilityRegenerationCommand({
    markdownPath: filePath,
    specPath: spec.specPath,
    registryPath,
  });

  const pipeline = isPlainObject(frontmatter.pipeline)
    ? frontmatter.pipeline
    : null;
  const dsDoc =
    pipeline && isPlainObject(pipeline.ds_component_doc)
      ? pipeline.ds_component_doc
      : null;
  if (!dsDoc) {
    report.errors.push({
      code: "TRACE02",
      file: filePath,
      message:
        "Missing frontmatter `pipeline.ds_component_doc` traceability block. Regenerate markdown using the suggested command.",
      suggested: regenerateCommand,
    });
    return;
  }

  const contractVersion = String(dsDoc.contract_version || "").trim();
  if (contractVersion !== TRACEABILITY_CONTRACT_VERSION) {
    report.errors.push({
      code: "TRACE02",
      file: filePath,
      message:
        `Unsupported traceability contract version: \`${contractVersion || "<missing>"}\`. ` +
        `Expected \`${TRACEABILITY_CONTRACT_VERSION}\`. Regenerate markdown using the suggested command.`,
      suggested: regenerateCommand,
    });
  }

  const expected = {
    spec_sha256: sha256FileCached(spec.specPath),
    token_registry_sha256: sha256FileCached(registryPath),
  };

  for (const [field, expectedValue] of Object.entries(expected)) {
    const actualValue = String(dsDoc[field] || "").trim();
    if (!actualValue) {
      report.errors.push({
        code: "TRACE02",
        file: filePath,
        message:
          `Missing frontmatter traceability field: pipeline.ds_component_doc.${field}. ` +
          "Regenerate markdown using the suggested command.",
        suggested: regenerateCommand,
      });
      continue;
    }
    if (!HASH_RE.test(actualValue)) {
      report.errors.push({
        code: "TRACE02",
        file: filePath,
        message:
          `Invalid hash format in pipeline.ds_component_doc.${field}; expected a 64-char sha256 hex string. ` +
          "Regenerate markdown using the suggested command.",
        suggested: regenerateCommand,
      });
      continue;
    }
    if (expectedValue && actualValue !== expectedValue) {
      report.errors.push({
        code: "TRACE02",
        file: filePath,
        message: `Traceability drift in pipeline.ds_component_doc.${field}. Regenerate markdown using the suggested command.`,
        expected: expectedValue,
        actual: actualValue,
        suggested: regenerateCommand,
      });
    }
  }

  const generatorScriptHash = String(
    dsDoc.generator_script_sha256 || "",
  ).trim();
  if (generatorScriptHash && !HASH_RE.test(generatorScriptHash)) {
    report.errors.push({
      code: "TRACE02",
      file: filePath,
      message:
        "Invalid hash format in pipeline.ds_component_doc.generator_script_sha256; expected a 64-char sha256 hex string.",
      suggested: regenerateCommand,
    });
  }

  const figma = isPlainObject(frontmatter.figma) ? frontmatter.figma : {};
  const expectedFigma = deriveFigmaFrontmatterTraceability(spec.parsed);

  const componentHash = String(figma.component_hash || "").trim();
  if (componentHash && componentHash !== expectedFigma.componentHash) {
    report.errors.push({
      code: "TRACE03",
      file: filePath,
      message:
        "Traceability drift in figma.component_hash. Regenerate markdown using the suggested command.",
      expected: expectedFigma.componentHash,
      actual: componentHash,
      suggested: regenerateCommand,
    });
  }

  const compareOptionalCount = (fieldName, expectedValue) => {
    const raw = figma[fieldName];
    if (raw === undefined || raw === null || raw === "") return;
    const parsed = Number(String(raw).trim());
    if (!Number.isInteger(parsed)) return;
    if (parsed !== expectedValue) {
      report.errors.push({
        code: "TRACE03",
        file: filePath,
        message: `Traceability drift in figma.${fieldName}. Regenerate markdown using the suggested command.`,
        expected: expectedValue,
        actual: parsed,
        suggested: regenerateCommand,
      });
    }
  };

  compareOptionalCount("properties_count", expectedFigma.propertiesCount);
  compareOptionalCount("variants_count", expectedFigma.variantsCount);
}

function validateGapsSectionContract(
  filePath,
  rawMarkdown,
  specRoot,
  registry,
  report,
  lineStarts,
  specResolution = {},
) {
  const spec = readComponentSpecByDocPath(filePath, specRoot, specResolution);
  const section = extractGapsSection(rawMarkdown);

  if (!spec.exists) {
    if (section) {
      report.warnings.push({
        code: "GAP00",
        file: filePath,
        line: section ? lineFromOffset(lineStarts, section.start) : undefined,
        message:
          "Gaps section exists but linked spec file is missing; deterministic gap checks were skipped.",
      });
    }
    return;
  }

  if (spec.parseError || !spec.parsed) {
    report.errors.push({
      code: "GAP01",
      file: filePath,
      message: `Unable to validate Gaps / TBD contract because spec could not be parsed: ${spec.parseError}`,
      suggested: path.relative(process.cwd(), spec.specPath),
    });
    return;
  }

  const gaps = extractGapsFromSpec({ spec: spec.parsed, registry });
  const expectedLines = buildGapsChecklistLines(gaps);
  const hasReadyStatusWithGaps = spec.status === "ready" && gaps.length > 0;
  const readyStatusWithGapsNote = hasReadyStatusWithGaps
    ? " Linked spec is also invalid: status `ready` with unresolved gaps (GAP02)."
    : "";

  if (hasReadyStatusWithGaps) {
    report.errors.push({
      code: "GAP02",
      file: spec.specPath,
      message:
        "Spec status is `ready` but unresolved gaps still exist. Resolve gaps or set status back to `draft`.",
    });
  }

  if (expectedLines.length === 0) {
    if (!section) return;
    report.errors.push({
      code: "GAP01",
      file: filePath,
      line: lineFromOffset(lineStarts, section.start),
      message:
        "`## Gaps / TBD` must be omitted when the linked spec has no unresolved gaps.",
    });
    return;
  }

  if (!section) {
    report.errors.push({
      code: "GAP01",
      file: filePath,
      message: `Missing required \`## Gaps / TBD\` section. The linked spec has unresolved gaps.${readyStatusWithGapsNote}`,
    });
    return;
  }

  const rawSectionLines = extractNonEmptySectionLines(section.body);
  if (rawSectionLines.length === 0) {
    report.errors.push({
      code: "GAP01",
      file: filePath,
      line: lineFromOffset(lineStarts, section.start),
      message: `\`## Gaps / TBD\` must contain checklist items in canonical checkbox format.${readyStatusWithGapsNote}`,
    });
    return;
  }

  const checkboxFormat = /^-\s+\[\s\]\s+\[[A-Z0-9_]+\]\s+.+$/;
  const invalidLine = rawSectionLines.find(
    (line) => !checkboxFormat.test(line),
  );
  if (invalidLine) {
    report.errors.push({
      code: "GAP01",
      file: filePath,
      line: lineFromOffset(lineStarts, section.start),
      message: `Every Gaps item must use checkbox format: \`- [ ] [GAP_TYPE] ...\`.${readyStatusWithGapsNote}`,
      details: invalidLine,
    });
    return;
  }

  const actualLines = rawSectionLines;
  const sameLength = actualLines.length === expectedLines.length;
  const sameOrder =
    sameLength &&
    actualLines.every((line, index) => line === expectedLines[index]);
  if (sameOrder) return;

  report.errors.push({
    code: "GAP01",
    file: filePath,
    line: lineFromOffset(lineStarts, section.start),
    message: `Gaps section does not match canonical deterministic content generated from spec + token registry.${readyStatusWithGapsNote}`,
    expected: expectedLines,
    actual: actualLines,
  });
}

function extractSectionBody(rawMarkdown, headingTitle) {
  const markdown = String(rawMarkdown || "");
  const escaped = String(headingTitle || "").replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const headingRegex = new RegExp(`^##\\s+${escaped}\\s*$`, "m");
  const headingMatch = headingRegex.exec(markdown);
  if (!headingMatch) return "";

  const start = headingMatch.index;
  const headingEnd = markdown.indexOf("\n", start);
  const contentStart = headingEnd === -1 ? markdown.length : headingEnd + 1;
  const rest = markdown.slice(contentStart);
  const nextHeadingMatch = /^##\s+/m.exec(rest);
  const end = nextHeadingMatch
    ? contentStart + nextHeadingMatch.index
    : markdown.length;
  return markdown.slice(contentStart, end).trim();
}

function findDiscrepancyStatuses(rawMarkdown) {
  const body = extractSectionBody(rawMarkdown, "Design–Token Discrepancies");
  if (!body) return [];
  const matches = [];
  const statusCellRegex = /\|\s*`?(open|accepted|resolved)`?\s*\|/gi;
  let match;
  while ((match = statusCellRegex.exec(body)) !== null) {
    matches.push(String(match[1] || "").toLowerCase());
  }
  return matches;
}

function validateReadyLifecycleConsistency(
  filePath,
  rawMarkdown,
  frontmatter,
  specRoot,
  report,
  lineStarts,
  specResolution = {},
) {
  const docStatus = String(frontmatter.doc_status || "")
    .trim()
    .toLowerCase();
  const figma = isPlainObject(frontmatter.figma) ? frontmatter.figma : {};
  const lastVerified = String(figma.last_verified || "").trim();
  const spec = readComponentSpecByDocPath(filePath, specRoot, specResolution);
  const specStatus = String(spec.status || "")
    .trim()
    .toLowerCase();

  if (docStatus === "ready") {
    if (!spec.exists) {
      report.errors.push({
        code: "READY01",
        file: filePath,
        message:
          "Component markdown is `ready` but linked spec file is missing.",
        suggested: path.relative(process.cwd(), spec.specPath),
      });
      return;
    }
    if (spec.parseError) {
      report.errors.push({
        code: "READY01",
        file: filePath,
        message:
          "Component markdown is `ready` but linked spec could not be parsed.",
        suggested: path.relative(process.cwd(), spec.specPath),
      });
      return;
    }
    if (specStatus !== "ready") {
      report.errors.push({
        code: "READY01",
        file: filePath,
        message: `Component markdown is \`ready\` but spec status is \`${specStatus || "missing"}\`.`,
        suggested: path.relative(process.cwd(), spec.specPath),
      });
    }
    if (!lastVerified || isTbdMarker(lastVerified)) {
      report.errors.push({
        code: "READY01",
        file: filePath,
        message:
          "Component markdown is `ready` but figma.last_verified is missing or `TBD`.",
      });
    }
    if (/\bTBD\b/i.test(rawMarkdown)) {
      report.errors.push({
        code: "READY01",
        file: filePath,
        message:
          "Component markdown is `ready` but still contains `TBD` markers.",
      });
    }
    const discrepancyStatuses = findDiscrepancyStatuses(rawMarkdown);
    if (
      discrepancyStatuses.some(
        (status) => status === "open" || status === "accepted",
      )
    ) {
      report.errors.push({
        code: "READY01",
        file: filePath,
        line: lineFromOffset(
          lineStarts,
          rawMarkdown.indexOf("## Design–Token Discrepancies"),
        ),
        message:
          "Component markdown is `ready` but has unresolved Design–Token Discrepancies (`open` or `accepted`).",
      });
    }
  }

  if (
    spec.exists &&
    !spec.parseError &&
    specStatus === "ready" &&
    docStatus !== "ready"
  ) {
    report.errors.push({
      code: "READY01",
      file: filePath,
      message: `Spec status is \`ready\` but component markdown doc_status is \`${docStatus || "missing"}\`.`,
      suggested: path.relative(process.cwd(), spec.specPath),
    });
  }
}

function validateComponentDocFileName(filePath, report) {
  const fileBase = path.basename(filePath, path.extname(filePath));
  if (isSnakeCaseFileSlug(fileBase)) return;

  const suggestedBase = componentNameToSnakeCase(fileBase);
  const suggestedPath = suggestedBase
    ? path.join(path.dirname(filePath), `${suggestedBase}.md`)
    : null;

  report.errors.push({
    code: "NAME01",
    file: filePath,
    message:
      "Component markdown filename must be snake_case (example: `status_bar.md`).",
    suggested: suggestedPath
      ? path.relative(process.cwd(), suggestedPath)
      : undefined,
  });
}

function validateVariableIds(filePath, rawMarkdown, report, lineStarts) {
  const variableIdRegex = new RegExp(VARIABLE_ID_RE_SOURCE, "g");
  let match;
  while ((match = variableIdRegex.exec(rawMarkdown)) !== null) {
    report.errors.push({
      code: "TOK03",
      file: filePath,
      line: lineFromOffset(lineStarts, match.index),
      message: `Forbidden Figma variable ID found: \`${match[0]}\`.`,
    });
  }
}

function validateTokenReferences(
  filePath,
  content,
  registryIndexes,
  report,
  lineStarts,
  baseOffset = 0,
) {
  const codeSpanRegex = /`([^`\n]+)`/g;
  let spanMatch;
  const seen = new Set();

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
          registryIndexes.slashRoots,
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
          code: "TOK01",
          file: filePath,
          line,
          token: tokenPath,
          message: resolution.message,
          suggested: resolution.suggested,
        });
      }
    }
  }
}

function normalizeCellText(cell) {
  return String(cell || "")
    .replace(/`/g, "")
    .trim();
}

function isTableLine(line) {
  const trimmed = String(line || "").trim();
  return trimmed.startsWith("|") && trimmed.includes("|");
}

function parseTableCells(line) {
  let trimmed = String(line || "").trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

function isSeparatorRow(cells) {
  if (!Array.isArray(cells) || cells.length === 0) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function collectMarkdownTables(content) {
  const lines = String(content || "").split("\n");
  const lineOffsets = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

  const tables = [];
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

function findHeaderIndex(cells, needle) {
  const key = String(needle || "")
    .trim()
    .toLowerCase();
  return cells.findIndex((cell) =>
    normalizeCellText(cell).toLowerCase().includes(key),
  );
}

function tableCellHasTokenReference(cell, registryIndexes) {
  return extractResolvedTokenRefsFromText(cell, registryIndexes).length > 0;
}

function isMissingFallbackValue(cell) {
  return !hasConcreteFallbackValue(cell);
}

function validateTokenFallbacks(
  filePath,
  content,
  registryIndexes,
  report,
  lineStarts,
  baseOffset = 0,
) {
  const tables = collectMarkdownTables(content);
  for (const table of tables) {
    const tokenCol = findHeaderIndex(table.headerCells, "token");
    if (tokenCol < 0) continue;

    const rowsWithTokenRefs = table.rows
      .map((row) => {
        const tokenCell = row.cells[tokenCol] || "";
        if (/^`?tbd`?$/i.test(normalizeCellText(tokenCell))) return null;
        const tokenRefs = extractResolvedTokenRefsFromText(
          tokenCell,
          registryIndexes,
        );
        if (tokenRefs.length === 0) return null;
        return { row, tokenRefs };
      })
      .filter(Boolean);
    if (rowsWithTokenRefs.length === 0) continue;

    const fallbackCol = findHeaderIndex(table.headerCells, "fallback");
    if (fallbackCol < 0) {
      report.errors.push({
        code: "TOK02",
        file: filePath,
        line: lineFromOffset(lineStarts, baseOffset + table.headerOffset),
        message: "Token table must include a `Fallback` column.",
      });
      continue;
    }

    for (const item of rowsWithTokenRefs) {
      const { row, tokenRefs } = item;
      const fallbackCell = row.cells[fallbackCol] || "";
      const line = lineFromOffset(lineStarts, baseOffset + row.offset);

      if (isMissingFallbackValue(fallbackCell)) {
        report.errors.push({
          code: "TOK02",
          file: filePath,
          line,
          message:
            "Token reference row is missing fallback value in `Fallback` column.",
        });
        continue;
      }

      const fallbackKind = inferFallbackKind(tokenRefs);
      if (!isFallbackCompatible(fallbackCell, fallbackKind)) {
        const expected =
          fallbackKind === "color"
            ? "a concrete color fallback (hex/rgb/hsl)"
            : fallbackKind === "dimension"
              ? "a concrete dimension fallback (px/rem/number)"
              : "a concrete fallback value";
        report.errors.push({
          code: "TOK02",
          file: filePath,
          line,
          message: `Fallback is present but not valid for token type; expected ${expected}.`,
        });
      }
    }
  }

  validateProseTokenFallbacks(
    filePath,
    content,
    registryIndexes,
    report,
    lineStarts,
    baseOffset,
    tables,
  );
}

function validateProseTokenFallbacks(
  filePath,
  content,
  registryIndexes,
  report,
  lineStarts,
  baseOffset = 0,
  tables = collectMarkdownTables(content),
) {
  const lines = String(content || "").split("\n");
  const lineOffsets = [];
  let runningOffset = 0;
  for (const line of lines) {
    lineOffsets.push(runningOffset);
    runningOffset += line.length + 1;
  }

  const tableLineSet = new Set();
  for (const table of tables) {
    const firstLine = lines.findIndex(
      (_, idx) => lineOffsets[idx] === table.headerOffset,
    );
    if (firstLine < 0) continue;
    const lastLine = firstLine + table.rows.length + 1;
    for (let i = firstLine; i <= lastLine; i += 1) tableLineSet.add(i);
  }

  for (let i = 0; i < lines.length; i += 1) {
    if (tableLineSet.has(i)) continue;
    const line = lines[i];
    if (!line || !line.includes("`")) continue;

    const tokenRefs = extractResolvedTokenRefsFromText(line, registryIndexes);
    if (tokenRefs.length === 0) continue;
    if (/tbd/i.test(line)) continue;

    let fallback = extractFallbackFromLine(line, registryIndexes);
    if (!fallback) {
      for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j += 1) {
        if (tableLineSet.has(j)) break;
        const nextLine = lines[j];
        if (!nextLine.trim()) continue;
        if (!/fallback/i.test(nextLine)) break;
        fallback = extractFallbackFromLine(nextLine, registryIndexes);
        if (fallback) break;
      }
    }

    const lineNumber = lineFromOffset(lineStarts, baseOffset + lineOffsets[i]);
    if (!hasConcreteFallbackValue(fallback)) {
      report.errors.push({
        code: "TOK02",
        file: filePath,
        line: lineNumber,
        message:
          "Token reference in prose is missing a concrete fallback value.",
      });
      continue;
    }

    const fallbackKind = inferFallbackKind(tokenRefs);
    if (!isFallbackCompatible(fallback, fallbackKind)) {
      const expected =
        fallbackKind === "color"
          ? "a concrete color fallback (hex/rgb/hsl)"
          : fallbackKind === "dimension"
            ? "a concrete dimension fallback (px/rem/number)"
            : "a concrete fallback value";
      report.errors.push({
        code: "TOK02",
        file: filePath,
        line: lineNumber,
        message: `Token reference in prose has invalid fallback; expected ${expected}.`,
      });
    }
  }
}

function validateOverviewLinks(docsRoot, componentFiles, report) {
  const overviewPath = path.join(docsRoot, "overview.md");
  if (!fs.existsSync(overviewPath)) {
    report.errors.push({
      code: "LINK01",
      file: overviewPath,
      message: "Missing components overview page.",
    });
    return;
  }

  const overviewRaw = fs.readFileSync(overviewPath, "utf8");
  const lineStarts = buildLineStarts(overviewRaw);
  const { content } = parseMarkdownFrontmatter(overviewRaw);
  const contentOffset = overviewRaw.length - content.length;

  const headingRegex = /^##\s+(.+?)\s*$/gim;
  let headingMatch;
  let sectionStart = -1;
  let sectionEnd = content.length;

  while ((headingMatch = headingRegex.exec(content)) !== null) {
    const headingText = normalizeHeadingText(headingMatch[1]);
    if (sectionStart >= 0) {
      sectionEnd = headingMatch.index;
      break;
    }
    if (headingText === CANONICAL_COMPONENT_LIST_HEADING) {
      sectionStart = headingMatch.index + headingMatch[0].length;
    }
  }

  if (sectionStart < 0) {
    report.errors.push({
      code: "LINK02",
      file: overviewPath,
      message: "Missing `## Component list` section in overview.",
    });
    return;
  }

  const sectionText = content.slice(sectionStart, sectionEnd);
  const sectionBaseOffset = contentOffset + sectionStart;
  const sectionLines = sectionText.split("\n");
  const entries = [];

  for (let i = 0, offset = 0; i < sectionLines.length; i += 1) {
    const line = sectionLines[i];
    const trimmed = String(line || "").trim();
    const lineOffset = sectionBaseOffset + offset;
    offset += line.length + 1;

    if (!trimmed) continue;
    if (!trimmed.startsWith("-")) continue;

    const parsed = trimmed.match(OVERVIEW_ENTRY_RE);
    if (!parsed) {
      report.errors.push({
        code: "LINK02",
        file: overviewPath,
        line: lineFromOffset(lineStarts, lineOffset),
        message:
          "Component list entries must use `- [Display Name](snake_case.md)` format.",
      });
      continue;
    }

    const displayName = String(parsed[1] || "")
      .trim()
      .replace(/\s+/g, " ");
    const target = String(parsed[2] || "").trim();

    if (!displayName) {
      report.errors.push({
        code: "LINK02",
        file: overviewPath,
        line: lineFromOffset(lineStarts, lineOffset),
        message: "Component list entry has an empty display name.",
      });
      continue;
    }

    if (!OVERVIEW_TARGET_RE.test(target)) {
      report.errors.push({
        code: "LINK02",
        file: overviewPath,
        line: lineFromOffset(lineStarts, lineOffset),
        message: `Component list link target must be snake_case.md: \`${target}\`.`,
      });
      continue;
    }

    entries.push({
      displayName,
      target,
      absolutePath: path.resolve(path.dirname(overviewPath), target),
      line: lineFromOffset(lineStarts, lineOffset),
    });
  }

  if (entries.length === 0) {
    report.errors.push({
      code: "LINK02",
      file: overviewPath,
      message: "Component list section has no valid entries.",
    });
    return;
  }

  const seenDisplay = new Map();
  const seenTarget = new Map();
  for (const entry of entries) {
    const displayKey = entry.displayName.toLowerCase();
    if (seenDisplay.has(displayKey)) {
      report.errors.push({
        code: "LINK02",
        file: overviewPath,
        line: entry.line,
        message: `Duplicate display name in component list: \`${entry.displayName}\`.`,
      });
    } else {
      seenDisplay.set(displayKey, entry.line);
    }

    const targetKey = entry.target.toLowerCase();
    if (seenTarget.has(targetKey)) {
      report.errors.push({
        code: "LINK02",
        file: overviewPath,
        line: entry.line,
        message: `Duplicate component link in component list: \`${entry.target}\`.`,
      });
    } else {
      seenTarget.set(targetKey, entry.line);
    }
  }

  const normalizedName = (value) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  const sortedEntries = entries.slice().sort((a, b) => {
    const aName = normalizedName(a.displayName);
    const bName = normalizedName(b.displayName);
    if (aName !== bName) return aName.localeCompare(bName, "en");
    return a.target.toLowerCase().localeCompare(b.target.toLowerCase(), "en");
  });

  for (let i = 0; i < entries.length; i += 1) {
    const current = entries[i];
    const expected = sortedEntries[i];
    if (
      current.displayName === expected.displayName &&
      current.target === expected.target
    )
      continue;
    report.errors.push({
      code: "LINK02",
      file: overviewPath,
      line: current.line,
      message:
        "Component list must be alphabetically sorted by display name (case-insensitive), " +
        "with filename tie-breaker.",
    });
    break;
  }

  const linkedSet = new Set(entries.map((entry) => entry.absolutePath));
  const componentSet = new Set(componentFiles);

  for (const entry of entries) {
    if (!fs.existsSync(entry.absolutePath)) {
      report.errors.push({
        code: "LINK01",
        file: overviewPath,
        line: entry.line,
        message: `Overview link points to missing file: ${path.relative(process.cwd(), entry.absolutePath)}.`,
      });
    }
  }

  for (const componentFile of componentSet) {
    if (!linkedSet.has(componentFile)) {
      report.errors.push({
        code: "LINK01",
        file: overviewPath,
        message: `Orphan component doc not listed in overview: ${path.relative(process.cwd(), componentFile)}.`,
      });
    }
  }
}

function validateSpecMarkdownPairing({
  componentFiles,
  docsRoot,
  specRoot,
  checkSpecs,
  explicitSpecFilePath,
  explicitFilePath,
  report,
}) {
  const componentSet = new Set(
    componentFiles.map((filePath) => path.resolve(filePath)),
  );
  const explicitPairMode = Boolean(explicitFilePath && explicitSpecFilePath);
  const resolvedExplicitFilePath = explicitFilePath
    ? path.resolve(explicitFilePath)
    : "";
  const resolvedExplicitSpecFilePath = explicitSpecFilePath
    ? path.resolve(explicitSpecFilePath)
    : "";

  for (const componentFile of componentFiles) {
    if (
      explicitPairMode &&
      path.resolve(componentFile) === resolvedExplicitFilePath
    ) {
      if (fs.existsSync(resolvedExplicitSpecFilePath)) continue;
      report.errors.push({
        code: "PAIR01",
        file: componentFile,
        message:
          "Component markdown must have a matching spec YAML file: " +
          `${path.relative(process.cwd(), resolvedExplicitSpecFilePath)}.`,
      });
      continue;
    }

    const slug = path.basename(componentFile, path.extname(componentFile));
    const expectedSpecPath = path.resolve(specRoot, `${slug}.yml`);
    if (fs.existsSync(expectedSpecPath)) continue;
    report.errors.push({
      code: "PAIR01",
      file: componentFile,
      message:
        "Component markdown must have a matching spec YAML file: " +
        `${path.relative(process.cwd(), expectedSpecPath)}.`,
    });
  }

  const specFilesForPairing = explicitSpecFilePath
    ? [path.resolve(explicitSpecFilePath)]
    : checkSpecs
      ? collectSpecFiles(specRoot)
      : [];

  for (const specFile of specFilesForPairing) {
    if (
      explicitPairMode &&
      path.resolve(specFile) === resolvedExplicitSpecFilePath
    ) {
      const expectedMarkdownPath = resolvedExplicitFilePath;
      if (
        componentSet.has(expectedMarkdownPath) ||
        fs.existsSync(expectedMarkdownPath)
      )
        continue;
      report.errors.push({
        code: "PAIR01",
        file: specFile,
        message:
          "Component spec YAML must have a matching markdown file: " +
          `${path.relative(process.cwd(), expectedMarkdownPath)}.`,
      });
      continue;
    }

    const slug = path.basename(specFile, path.extname(specFile));
    const expectedMarkdownPath = path.resolve(docsRoot, `${slug}.md`);
    if (
      componentSet.has(expectedMarkdownPath) ||
      fs.existsSync(expectedMarkdownPath)
    )
      continue;
    report.errors.push({
      code: "PAIR01",
      file: specFile,
      message:
        "Component spec YAML must have a matching markdown file: " +
        `${path.relative(process.cwd(), expectedMarkdownPath)}.`,
    });
  }
}

function toCliPath(filePath) {
  const resolved = path.resolve(String(filePath || ""));
  const relative = path.relative(process.cwd(), resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return resolved;
  }
  return relative;
}

function buildTraceabilityRegenerationCommand({
  markdownPath,
  specPath,
  registryPath,
}) {
  const specArg = JSON.stringify(toCliPath(specPath));
  const outputArg = JSON.stringify(toCliPath(markdownPath));
  const registryArg = JSON.stringify(toCliPath(registryPath));
  return `npm run ds:component-doc -- --spec-file ${specArg} --output ${outputArg} --registry ${registryArg} --force true`;
}

const FILE_HASH_CACHE = new Map();

function sha256FileCached(filePath) {
  const resolved = path.resolve(filePath);
  if (FILE_HASH_CACHE.has(resolved)) return FILE_HASH_CACHE.get(resolved);
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(resolved));
  const digest = hash.digest("hex");
  FILE_HASH_CACHE.set(resolved, digest);
  return digest;
}

function isValidNodeId(raw) {
  const normalized = normalizeNodeId(raw);
  if (!normalized) return false;
  return FIGMA_NODE_ID_RE.test(normalized);
}

function splitSpecTokenValue(rawValue) {
  return String(rawValue || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeSpecPropertyGroup(typeValue) {
  const normalizedType = String(typeValue || "")
    .trim()
    .toLowerCase();
  return SPEC_PROPERTY_GROUP_ORDER.get(normalizedType) || 5;
}

function validateSpecPropertyOrder(filePath, properties, report) {
  if (properties === undefined || properties === null) return;
  if (!Array.isArray(properties)) {
    report.errors.push({
      code: "SPEC01",
      file: filePath,
      message: "Field `properties` must be an array.",
    });
    return;
  }

  let previousGroup = -1;
  const seenNames = new Set();

  for (let i = 0; i < properties.length; i += 1) {
    const prop = properties[i];
    if (!isPlainObject(prop)) {
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message: `Property entry at index ${i} must be an object.`,
      });
      continue;
    }

    const propName = String(prop.name || "").trim();
    const propType = String(prop.type || "").trim();
    if (!propName) {
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message: `Property entry at index ${i} is missing \`name\`.`,
      });
    } else {
      const nameKey = propName.toLowerCase();
      if (seenNames.has(nameKey)) {
        report.errors.push({
          code: "DET01",
          file: filePath,
          message: `Duplicate property name in spec properties: \`${propName}\`.`,
        });
      } else {
        seenNames.add(nameKey);
      }
    }

    const currentGroup = normalizeSpecPropertyGroup(propType);
    if (currentGroup < previousGroup) {
      report.errors.push({
        code: "DET01",
        file: filePath,
        message:
          "Properties must follow canonical type group order: " +
          "variant/enum -> text -> boolean -> instance_swap -> other.",
      });
      break;
    }
    previousGroup = currentGroup;
  }
}

function validateSpecTokenMapping(
  filePath,
  tokenMapping,
  registryIndexes,
  report,
) {
  if (tokenMapping === undefined || tokenMapping === null) return;
  if (!isPlainObject(tokenMapping)) {
    report.errors.push({
      code: "SPEC01",
      file: filePath,
      message: "Field `token_mapping` must be an object.",
    });
    return;
  }

  const walk = (node, keyPath) => {
    if (typeof node === "string") {
      const values = splitSpecTokenValue(node);
      if (values.length === 0) {
        report.errors.push({
          code: "SPEC01",
          file: filePath,
          message: `Token mapping \`token_mapping.${keyPath}\` is empty.`,
        });
        return;
      }

      for (const tokenValue of values) {
        if (isTbdMarker(tokenValue)) continue;
        if (!tokenValue.includes("/") && !tokenValue.includes(".")) {
          report.errors.push({
            code: "SPEC01",
            file: filePath,
            message: `Token mapping \`token_mapping.${keyPath}\` is not a valid token path: \`${tokenValue}\`.`,
          });
          continue;
        }

        const resolution = resolveTokenCandidate(tokenValue, registryIndexes);
        if (!resolution.ok) {
          report.errors.push({
            code: "SPEC01",
            file: filePath,
            message: `Token mapping \`token_mapping.${keyPath}\`: ${resolution.message}`,
            suggested: resolution.suggested,
          });
        }
      }
      return;
    }

    if (isPlainObject(node)) {
      for (const [key, value] of Object.entries(node)) {
        const nextPath = keyPath ? `${keyPath}.${key}` : key;
        walk(value, nextPath);
      }
      return;
    }

    if (node === undefined || node === null) {
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message: `Token mapping \`token_mapping.${keyPath}\` is missing a token value.`,
      });
      return;
    }

    report.errors.push({
      code: "SPEC01",
      file: filePath,
      message: `Token mapping \`token_mapping.${keyPath}\` must be a string or object.`,
    });
  };

  walk(tokenMapping, "");
}

function validateSpecYamlFile(filePath, report, registryIndexes) {
  let parsed;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    parsed = parseYamlDocument(raw, `spec YAML (${path.basename(filePath)})`);
  } catch (error) {
    report.errors.push({
      code: "SPEC01",
      file: filePath,
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  for (const field of SPEC_REQUIRED_TOP_LEVEL_FIELDS) {
    if (!(field in parsed)) {
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message: `Missing required top-level field: \`${field}\`.`,
      });
    }
  }

  const status = String(parsed.status || "").trim();
  if (!SPEC_ALLOWED_STATUS.has(status)) {
    report.errors.push({
      code: "SPEC01",
      file: filePath,
      message: "Field `status` must be one of: draft, ready.",
    });
  }

  const figma = parsed.figma;
  if (!figma || typeof figma !== "object" || Array.isArray(figma)) {
    report.errors.push({
      code: "SPEC01",
      file: filePath,
      message: "Field `figma` must be an object.",
    });
  } else {
    for (const key of ["file", "page", "component_set"]) {
      const value = String(figma[key] ?? "").trim();
      if (!value) {
        report.errors.push({
          code: "SPEC01",
          file: filePath,
          message: `Field figma.${key} is required.`,
        });
      }
    }

    const rawNodeId = String(figma.component_set_node_id ?? "").trim();
    const hasConcreteNodeId = rawNodeId && !isTbdMarker(rawNodeId);
    if (hasConcreteNodeId && !isValidNodeId(rawNodeId)) {
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message:
          "Field figma.component_set_node_id must use Figma node-id format `123:456` when declared.",
      });
    }
    if (status === "ready" && !hasConcreteNodeId) {
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message:
          "Field figma.component_set_node_id is required for `ready` specs to guarantee deterministic Figma placement.",
      });
    }
  }

  if (registryIndexes) {
    validateSpecTokenMapping(
      filePath,
      parsed.token_mapping,
      registryIndexes,
      report,
    );
  }

  validateOptionalVersionBlock({
    filePath,
    versionNode: parsed.version,
    allowedKeys: new Set(["spec", "component"]),
    report,
    context: "Spec",
  });

  validateSpecPropertyOrder(filePath, parsed.properties, report);

  const specBase = path.basename(filePath, path.extname(filePath));
  if (!isSnakeCaseFileSlug(specBase)) {
    const suggestedBase = componentNameToSnakeCase(specBase);
    const suggestedPath = suggestedBase
      ? path.join(path.dirname(filePath), `${suggestedBase}.yml`)
      : null;
    report.errors.push({
      code: "NAME01",
      file: filePath,
      message:
        "Component spec filename must be snake_case (example: `status_bar.yml`).",
      suggested: suggestedPath
        ? path.relative(process.cwd(), suggestedPath)
        : undefined,
    });
  }

  const specDisplayName = String(parsed.name || "").trim();
  if (specDisplayName && !isTbdMarker(specDisplayName)) {
    const expectedBase = componentNameToSnakeCase(specDisplayName);
    if (expectedBase && expectedBase !== specBase) {
      report.errors.push({
        code: "NAME02",
        file: filePath,
        message:
          `Spec \`name: ${specDisplayName}\` does not match filename. ` +
          `Expected \`${expectedBase}.yml\`.`,
        suggested: path.relative(
          process.cwd(),
          path.join(path.dirname(filePath), `${expectedBase}.yml`),
        ),
      });
    }
  }
}

function validateSpecYamlFiles(
  specRoot,
  report,
  registryIndexes,
  explicitSpecFilePath = null,
) {
  const files = explicitSpecFilePath
    ? [path.resolve(explicitSpecFilePath)]
    : collectSpecFiles(specRoot);
  for (const filePath of files) {
    if (!fs.existsSync(filePath)) {
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message: "Spec YAML file not found.",
      });
      continue;
    }
    report.summary.specFilesChecked += 1;
    validateSpecYamlFile(filePath, report, registryIndexes);
  }
}

function createBaseReport() {
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    governance: {
      manifestPath: RULE_MANIFEST_PATH,
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

function loadRuleManifest(manifestPath) {
  const resolvedPath = path.resolve(manifestPath || RULE_MANIFEST_PATH);
  if (!fs.existsSync(resolvedPath)) {
    return {
      path: resolvedPath,
      checks: {},
      loaded: false,
      error: null,
    };
  }

  try {
    const parsed = parseYamlDocument(
      fs.readFileSync(resolvedPath, "utf8"),
      `rule manifest (${path.basename(resolvedPath)})`,
    );
    const checks = isPlainObject(parsed.checks) ? parsed.checks : {};
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

function annotateFindingsWithManifest(findings, manifestChecks) {
  if (!Array.isArray(findings) || findings.length === 0) return;
  for (const finding of findings) {
    const code = String(finding?.code || "").trim();
    if (!code) continue;
    const manifestEntry = manifestChecks[code];
    if (!isPlainObject(manifestEntry)) continue;
    const ruleIds = Array.isArray(manifestEntry.rule_ids)
      ? manifestEntry.rule_ids
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      : [];
    finding.rule_ids = ruleIds;
    if (typeof manifestEntry.blocking === "boolean") {
      finding.blocking = manifestEntry.blocking;
    }
  }
}

export function validateDocs(options = {}) {
  const docsRoot = path.resolve(options.docsRoot || COMPONENT_DOCS_DIR);
  const specRoot = path.resolve(options.specRoot || SPEC_COMPONENTS_DIR);
  const explicitSpecFilePath = options.specFilePath
    ? path.resolve(options.specFilePath)
    : null;
  const registryPath = path.resolve(
    options.registryPath || DEFAULT_TOKEN_REGISTRY_PATH,
  );
  const explicitFilePath = options.filePath
    ? path.resolve(options.filePath)
    : null;
  const allowExtraH2 = options.allowExtraH2 === true;
  const checkOverview = explicitFilePath
    ? false
    : options.checkOverview !== false;
  const checkSpecs = explicitFilePath ? false : options.checkSpecs !== false;

  const report = createBaseReport();
  const manifestInfo = loadRuleManifest(
    options.manifestPath || RULE_MANIFEST_PATH,
  );
  report.governance.manifestPath = manifestInfo.path;
  report.governance.manifestLoaded = manifestInfo.loaded;
  if (manifestInfo.error) {
    report.errors.push({
      code: "GOV01",
      file: manifestInfo.path,
      message: `Failed to parse rule manifest: ${manifestInfo.error}`,
    });
  }

  let registry;
  try {
    registry = loadTokenRegistry(registryPath);
  } catch (error) {
    report.errors.push({
      code: "REG01",
      file: registryPath,
      message:
        `${error instanceof Error ? error.message : String(error)}. ` +
        "Run `npm run generate:registry` before validating docs.",
    });
    report.ok = false;
    report.summary.errors = report.errors.length;
    return report;
  }

  const registryIndexes = buildRegistryIndexes(registry);
  const markdownFiles = collectMarkdownFiles(docsRoot, explicitFilePath);
  const overviewFiles = markdownFiles.filter(
    (filePath) => path.basename(filePath) === "overview.md",
  );
  const componentFiles = markdownFiles.filter(
    (filePath) => path.basename(filePath) !== "overview.md",
  );

  validateSpecMarkdownPairing({
    componentFiles,
    docsRoot,
    specRoot,
    checkSpecs,
    explicitSpecFilePath,
    explicitFilePath,
    report,
  });

  const specResolution =
    explicitFilePath && explicitSpecFilePath
      ? { specFilePath: explicitSpecFilePath }
      : {};

  for (const filePath of markdownFiles) {
    if (!fs.existsSync(filePath)) {
      report.errors.push({
        code: "DOC01",
        file: filePath,
        message: "Markdown file not found.",
      });
      continue;
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const lineStarts = buildLineStarts(raw);
    const { frontmatter, content } = parseMarkdownFrontmatter(raw);
    const contentOffset = raw.length - content.length;
    const isOverview = path.basename(filePath) === "overview.md";

    report.summary.filesChecked += 1;
    if (isOverview) {
      validateOverviewFrontmatter(filePath, frontmatter, report);
      continue;
    }

    validateComponentDocFileName(filePath, report);
    validateComponentFrontmatter(filePath, frontmatter, report);
    validateMarkdownTraceabilityNodeId(
      filePath,
      frontmatter,
      specRoot,
      report,
      specResolution,
    );
    validateGeneratedTraceability(
      filePath,
      frontmatter,
      specRoot,
      registryPath,
      report,
      specResolution,
    );
    validateGapsSectionContract(
      filePath,
      raw,
      specRoot,
      registry,
      report,
      lineStarts,
      specResolution,
    );
    validateReadyLifecycleConsistency(
      filePath,
      raw,
      frontmatter,
      specRoot,
      report,
      lineStarts,
      specResolution,
    );
    validateSectionOrder(filePath, content, report, lineStarts, contentOffset, {
      allowExtraH2,
    });
    validateVariableIds(filePath, raw, report, lineStarts);
    validateTokenReferences(
      filePath,
      content,
      registryIndexes,
      report,
      lineStarts,
      contentOffset,
    );
    validateTokenFallbacks(
      filePath,
      content,
      registryIndexes,
      report,
      lineStarts,
      contentOffset,
    );
  }

  if (checkSpecs) {
    validateSpecYamlFiles(
      specRoot,
      report,
      registryIndexes,
      explicitSpecFilePath,
    );
  }

  if (checkOverview) {
    validateOverviewLinks(docsRoot, componentFiles, report);
    for (const overviewPath of overviewFiles) {
      if (!fs.existsSync(overviewPath)) continue;
      const raw = fs.readFileSync(overviewPath, "utf8");
      const lineStarts = buildLineStarts(raw);
      validateVariableIds(overviewPath, raw, report, lineStarts);
    }
  }

  annotateFindingsWithManifest(report.errors, manifestInfo.checks);
  annotateFindingsWithManifest(report.warnings, manifestInfo.checks);

  report.summary.errors = report.errors.length;
  report.summary.warnings = report.warnings.length;
  report.ok = report.summary.errors === 0;
  return report;
}
