import fs from "node:fs";
import path from "node:path";

import { COMPONENT_DOCS_DIR } from "./paths.mjs";
import { loadTokenRegistry, DEFAULT_TOKEN_REGISTRY_PATH } from "./token-registry.mjs";
import { parseMarkdownFrontmatter } from "./parse-frontmatter.mjs";

const ALLOWED_DOC_STATUS = new Set(["draft", "ready", "needs-review"]);

export const REQUIRED_H2 = [
  "Overview",
  "Anatomy",
  "Component API",
  "Visual Specifications",
  "Variants",
  "States",
  "Usage Guidelines",
  "Content Guidelines",
  "Accessibility",
  "Related Components",
];

const OPTIONAL_H2_TAIL = new Set(["Design–Token Discrepancies", "Discrepancias detectadas", "Gaps / TBD"]);
const COLLECTION_PREFIXES = new Set(["Semantic", "Primitives", "Components", "A11y"]);
const DOT_TOKEN_RE = /[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+){1,}/g;
const SLASH_TOKEN_RE = /[A-Za-z][A-Za-z0-9-]*(?:\/[A-Za-z0-9-]+){1,}/g;
const VARIABLE_ID_RE = /VariableID:[A-Za-z0-9:-]+/g;

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
    const nextStart = mid + 1 < lineStarts.length ? lineStarts[mid + 1] : Number.MAX_SAFE_INTEGER;
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

function buildRegistryIndexes(registryObj) {
  const keys = Object.keys(registryObj);
  const keySet = new Set(keys);
  const lowerMap = new Map(keys.map((key) => [key.toLowerCase(), key]));

  const dotRoots = new Set();
  const slashRoots = new Set();
  for (const key of keys) {
    if (key.includes(".")) dotRoots.add(key.split(".")[0]);
    if (key.includes("/")) slashRoots.add(key.split("/")[0]);
  }

  return { keySet, lowerMap, dotRoots, slashRoots };
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

function normalizeHeadingText(text) {
  return String(text || "").trim().replace(/\s+/g, " ").toLowerCase();
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

function validateSectionOrder(filePath, content, report, lineStarts, baseOffset = 0) {
  const headings = collectH2Headings(content);
  const indexByHeading = new Map();
  for (const item of headings) {
    if (!indexByHeading.has(item.normalized)) indexByHeading.set(item.normalized, item);
  }

  let previousOffset = -1;
  for (const heading of REQUIRED_H2) {
    const key = normalizeHeadingText(heading);
    const found = indexByHeading.get(key);
    if (!found) {
      report.errors.push({
        code: "SEC01",
        file: filePath,
        message: `Missing required H2 heading: \`## ${heading}\`.`,
      });
      continue;
    }

    if (found.offset < previousOffset) {
      report.errors.push({
        code: "SEC01",
        file: filePath,
        line: lineFromOffset(lineStarts, baseOffset + found.offset),
        message: `Heading out of order: \`## ${heading}\`.`,
      });
    }
    previousOffset = Math.max(previousOffset, found.offset);
  }

  for (const heading of headings) {
    if (
      !REQUIRED_H2.some((item) => normalizeHeadingText(item) === heading.normalized) &&
      !OPTIONAL_H2_TAIL.has(heading.heading)
    ) {
      report.warnings.push({
        code: "SEC02",
        file: filePath,
        line: lineFromOffset(lineStarts, baseOffset + heading.offset),
        message: `Unexpected H2 heading: \`## ${heading.heading}\`.`,
      });
    }
  }
}

function validateFrontmatter(filePath, frontmatter, report) {
  if (frontmatter.doc_type !== "component") {
    report.errors.push({
      code: "FM01",
      file: filePath,
      message: "Frontmatter must include `doc_type: component`.",
    });
  }

  const status = String(frontmatter.doc_status || "").trim();
  if (!ALLOWED_DOC_STATUS.has(status)) {
    report.errors.push({
      code: "FM02",
      file: filePath,
      message: "Frontmatter `doc_status` must be one of: draft, ready, needs-review.",
    });
  }

  const figma = frontmatter.figma;
  const requiredFigmaFields = ["file_url", "page", "component", "last_verified"];
  if (!figma || typeof figma !== "object" || Array.isArray(figma)) {
    report.errors.push({
      code: "FM01",
      file: filePath,
      message: "Frontmatter `figma` object is required.",
    });
    return;
  }

  for (const field of requiredFigmaFields) {
    const value = String(figma[field] ?? "").trim();
    if (!value) {
      report.errors.push({
        code: "FM01",
        file: filePath,
        message: `Frontmatter figma.${field} is required.`,
      });
    }
  }
}

function validateVariableIds(filePath, rawMarkdown, report, lineStarts) {
  VARIABLE_ID_RE.lastIndex = 0;
  let match;
  while ((match = VARIABLE_ID_RE.exec(rawMarkdown)) !== null) {
    report.errors.push({
      code: "TOK03",
      file: filePath,
      line: lineFromOffset(lineStarts, match.index),
      message: `Forbidden Figma variable ID found: \`${match[0]}\`.`,
    });
  }
}

function validateTokenReferences(filePath, content, registryIndexes, report, lineStarts, baseOffset = 0) {
  const codeSpanRegex = /`([^`\n]+)`/g;
  let spanMatch;
  const seen = new Set();

  while ((spanMatch = codeSpanRegex.exec(content)) !== null) {
    const span = spanMatch[1];
    const spanOffset = spanMatch.index + 1;
    const candidates = extractTokenCandidatesFromSpan(span);

    for (const item of candidates) {
      const tokenPath = item.token;
      if (!looksLikeTokenPath(tokenPath, registryIndexes.dotRoots, registryIndexes.slashRoots)) continue;

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
  const linkRegex = /\[[^\]]+\]\(([^)]+)\)/g;
  const linkedFiles = [];
  let match;
  while ((match = linkRegex.exec(overviewRaw)) !== null) {
    const linkTarget = String(match[1] || "").trim();
    if (!linkTarget || /^https?:\/\//i.test(linkTarget)) continue;
    if (!linkTarget.endsWith(".md")) continue;
    linkedFiles.push(path.resolve(path.dirname(overviewPath), linkTarget));
  }

  const linkedSet = new Set(linkedFiles);
  const componentSet = new Set(componentFiles);

  for (const linked of linkedSet) {
    if (!fs.existsSync(linked)) {
      report.errors.push({
        code: "LINK01",
        file: overviewPath,
        message: `Overview link points to missing file: ${path.relative(process.cwd(), linked)}.`,
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

function createBaseReport() {
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    summary: {
      filesChecked: 0,
      tokenRefsChecked: 0,
      tokenRefsInvalid: 0,
      errors: 0,
      warnings: 0,
    },
    errors: [],
    warnings: [],
  };
}

export function validateDocs(options = {}) {
  const docsRoot = path.resolve(options.docsRoot || COMPONENT_DOCS_DIR);
  const registryPath = path.resolve(options.registryPath || DEFAULT_TOKEN_REGISTRY_PATH);
  const explicitFilePath = options.filePath ? path.resolve(options.filePath) : null;
  const checkOverview = explicitFilePath ? false : options.checkOverview !== false;

  const report = createBaseReport();

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
  const componentFiles = markdownFiles.filter((filePath) => path.basename(filePath) !== "overview.md");

  for (const filePath of componentFiles) {
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

    report.summary.filesChecked += 1;
    validateFrontmatter(filePath, frontmatter, report);
    validateSectionOrder(filePath, content, report, lineStarts, contentOffset);
    validateVariableIds(filePath, raw, report, lineStarts);
    validateTokenReferences(filePath, content, registryIndexes, report, lineStarts, contentOffset);
  }

  if (checkOverview) {
    validateOverviewLinks(docsRoot, componentFiles, report);
  }

  report.summary.errors = report.errors.length;
  report.summary.warnings = report.warnings.length;
  report.ok = report.summary.errors === 0;
  return report;
}
