import fs from "node:fs";
import path from "node:path";
import {
  componentNameToSnakeCase,
  isSnakeCaseFileSlug,
} from "../component-name.mjs";
import {
  CANONICAL_H2_ORDER,
  REQUIRED_CANONICAL_H2,
} from "../docs-config.mjs";

const VARIABLE_ID_RE_SOURCE = "\\bVariableID:[A-Za-z0-9:-]+\\b";
const MARKDOWN_LINK_RE = /(?<!!)\[[^\]]*\]\(([^)\n]+)\)/g;
const PLACEHOLDER_PATTERNS = [
  { regex: /\bTODO\b/gi, label: "TODO" },
  { regex: /\bXXX\b/gi, label: "XXX" },
  { regex: /\{placeholder\}/gi, label: "{placeholder}" },
  { regex: /<placeholder>/gi, label: "<placeholder>" },
];
const HEADING_ANCHOR_CACHE = new Map();

export function normalizeHeadingText(text) {
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

export function validateSectionOrder(
  filePath,
  content,
  report,
  lineStarts,
  lineFromOffset,
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

  for (const required of REQUIRED_CANONICAL_H2) {
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

export function validateComponentDocFileName(filePath, report) {
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

export function validateVariableIds(filePath, rawMarkdown, report, lineStarts, lineFromOffset) {
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

export function validateEditorialPlaceholders(
  filePath,
  content,
  report,
  lineStarts,
  lineFromOffset,
  baseOffset = 0,
) {
  const source = String(content || "");
  for (const pattern of PLACEHOLDER_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(source)) !== null) {
      report.errors.push({
        code: "QLT01",
        file: filePath,
        line: lineFromOffset(lineStarts, baseOffset + match.index),
        message: `Unresolved editorial placeholder marker found: \`${pattern.label}\`.`,
      });
    }
  }
}

function normalizeMarkdownAnchor(value) {
  const raw = String(value || "").trim().replace(/^#/, "");
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim().toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

function slugifyHeading(text) {
  const normalized = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[`*_~()[\]{}!?.:,;'"\\/<>@#$%^&+=|]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized;
}

function collectHeadingAnchorsFromMarkdown(rawMarkdown) {
  const content = String(rawMarkdown || "");
  const headingRegex = /^#{1,6}\s+(.+?)\s*$/gm;
  const counts = new Map();
  const anchors = new Set();
  let match;
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

function getHeadingAnchorsForFile(filePath) {
  const resolved = path.resolve(filePath);
  if (HEADING_ANCHOR_CACHE.has(resolved)) {
    return HEADING_ANCHOR_CACHE.get(resolved);
  }
  if (!fs.existsSync(resolved)) {
    const empty = new Set();
    HEADING_ANCHOR_CACHE.set(resolved, empty);
    return empty;
  }
  const raw = fs.readFileSync(resolved, "utf8");
  const anchors = collectHeadingAnchorsFromMarkdown(raw);
  HEADING_ANCHOR_CACHE.set(resolved, anchors);
  return anchors;
}

function normalizeLinkTarget(rawTarget) {
  let target = String(rawTarget || "").trim();
  if (!target) return "";
  if (target.startsWith("<") && target.endsWith(">")) {
    target = target.slice(1, -1).trim();
  }
  const whitespaceIndex = target.search(/\s/);
  if (whitespaceIndex > 0) {
    target = target.slice(0, whitespaceIndex).trim();
  }
  return target;
}

function isExternalLinkTarget(target) {
  const value = String(target || "").trim();
  if (!value) return false;
  if (value.startsWith("#")) return false;
  if (value.startsWith("//")) return true;
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function resolveInternalLink(filePath, target) {
  const hashIndex = target.indexOf("#");
  const pathPart = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
  const anchorPart = hashIndex >= 0 ? target.slice(hashIndex + 1) : "";

  const resolvedPath = pathPart
    ? pathPart.startsWith("/")
      ? path.resolve(process.cwd(), pathPart.slice(1))
      : path.resolve(path.dirname(filePath), pathPart)
    : path.resolve(filePath);

  return {
    resolvedPath,
    anchor: normalizeMarkdownAnchor(anchorPart),
  };
}

export function validateInternalLinks(filePath, rawMarkdown, report, lineStarts, lineFromOffset) {
  const content = String(rawMarkdown || "");
  const contentOffset = 0;

  MARKDOWN_LINK_RE.lastIndex = 0;
  let match;
  while ((match = MARKDOWN_LINK_RE.exec(content)) !== null) {
    const normalizedTarget = normalizeLinkTarget(match[1]);
    if (!normalizedTarget) continue;
    if (isExternalLinkTarget(normalizedTarget)) continue;

    const line = lineFromOffset(lineStarts, contentOffset + match.index);
    const { resolvedPath, anchor } = resolveInternalLink(
      filePath,
      normalizedTarget,
    );

    if (!fs.existsSync(resolvedPath)) {
      report.errors.push({
        code: "LINK03",
        file: filePath,
        line,
        message: `Internal link target does not exist: \`${normalizedTarget}\`.`,
        suggested: path.relative(process.cwd(), resolvedPath),
      });
      continue;
    }

    if (!anchor) continue;
    if (path.extname(resolvedPath).toLowerCase() !== ".md") continue;

    const anchors = getHeadingAnchorsForFile(resolvedPath);
    if (anchors.has(anchor)) continue;

    report.errors.push({
      code: "LINK03",
      file: filePath,
      line,
      message:
        `Internal link anchor is missing in target file: \`${normalizedTarget}\`.`,
      suggested: path.relative(process.cwd(), resolvedPath),
    });
  }
}
