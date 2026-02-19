import fs from "node:fs";
import yaml from "js-yaml";

import { CANONICAL_H2_ORDER } from "./docs-config.mjs";
import { isPlainObject } from "./is-plain-object.mjs";
import { parseMarkdownFrontmatter } from "./parse-frontmatter.mjs";

const FRONTMATTER_KEY_ORDER = [
  "doc_type",
  "doc_status",
  "figma",
  "pipeline",
  "version",
];
const FIGMA_KEY_ORDER = [
  "file_url",
  "page",
  "component",
  "component_set_node_id",
  "last_verified",
  "component_hash",
  "properties_count",
  "variants_count",
];
const HEADING_LOOKUP = new Map(
  CANONICAL_H2_ORDER.map((heading) => [
    normalizeHeadingToken(heading),
    heading,
  ]),
);

HEADING_LOOKUP.set(
  normalizeHeadingToken("Design-Token Discrepancies"),
  "Design–Token Discrepancies",
);

function normalizeHeadingToken(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[–—-]/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function orderObjectKeys(source, preferredOrder) {
  const next = {};
  for (const key of preferredOrder) {
    if (key in source) next[key] = source[key];
  }
  for (const [key, value] of Object.entries(source)) {
    if (!(key in next)) next[key] = value;
  }
  return next;
}

function normalizeFrontmatterOrder(markdown) {
  const { frontmatter, content } = parseMarkdownFrontmatter(markdown);
  if (!isPlainObject(frontmatter) || Object.keys(frontmatter).length === 0) {
    return markdown;
  }

  const fm = { ...frontmatter };
  if (isPlainObject(fm.figma)) {
    fm.figma = orderObjectKeys(fm.figma, FIGMA_KEY_ORDER);
  }
  const ordered = orderObjectKeys(fm, FRONTMATTER_KEY_ORDER);
  const frontmatterYaml = yaml.dump(ordered, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });

  const normalizedContent = String(content || "").replace(/^\n+/, "");
  return `---\n${frontmatterYaml.trimEnd()}\n---\n\n${normalizedContent}`;
}

function normalizeSectionHeadings(markdown) {
  return String(markdown || "").replace(
    /^##\s+(.+?)\s*$/gm,
    (_match, headingText) => {
      const normalized = normalizeHeadingToken(headingText);
      const canonical = HEADING_LOOKUP.get(normalized);
      return canonical ? `## ${canonical}` : `## ${String(headingText).trim()}`;
    },
  );
}

function normalizeTokenReferences(markdown) {
  return String(markdown || "").replace(
    /(^|[^`])((?:[A-Z][A-Za-z0-9-]*)(?:[./][A-Za-z0-9-]+)+)\s*\((#[0-9A-Fa-f]{3,8}|-?\d+(?:\.\d+)?(?:px|rem|em|%)?)\)/gm,
    (match, prefix, tokenPath, fallback) => {
      const hasBackticks = match.includes("`");
      if (hasBackticks) return match;
      return `${prefix}\`${tokenPath}\` (${fallback})`;
    },
  );
}

function normalizeTbdMarkers(markdown) {
  return String(markdown || "").replace(
    /\b(?:T\.?\s*B\.?\s*D\.?|To Be Determined)\b/gi,
    "TBD",
  );
}

function normalizeTableFormatting(markdown) {
  const lines = String(markdown || "").split("\n");
  const normalized = lines.map((line) => {
    if (!/^\s*\|.*\|\s*$/.test(line)) return line;
    const trimmed = line.trim();
    const content = trimmed.slice(1, -1);
    const cells = content.split("|").map((cell) => cell.trim());
    if (cells.length === 0) return line;
    return `| ${cells.join(" | ")} |`;
  });
  return normalized.join("\n");
}

function stripWrappedMarkdownFence(markdown) {
  const match = String(markdown || "").match(
    /^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i,
  );
  if (!match) return markdown;
  return match[1].trim();
}

function removeLeadingAgentPreamble(markdown) {
  const lines = String(markdown || "").split("\n");
  const trimmed = [];
  let skipping = true;
  const preambleLineRe =
    /^(?:here(?:'|’)s|i(?:'|’)ve|i have|let me|sure,|of course|perfecto|listo)\b/i;

  for (const line of lines) {
    const isContentStart =
      /^---\s*$/.test(line.trim()) ||
      /^#\s+/.test(line.trim()) ||
      /^##\s+/.test(line.trim()) ||
      /^\|\s*[^|]+\|/.test(line.trim());

    if (skipping && !isContentStart && preambleLineRe.test(line.trim())) {
      continue;
    }

    if (line.trim() !== "") skipping = false;
    trimmed.push(line);
  }

  return trimmed.join("\n");
}

function removeAgentArtifacts(markdown) {
  let result = String(markdown || "");
  result = result.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  result = stripWrappedMarkdownFence(result);
  result = removeLeadingAgentPreamble(result);
  return result.trim();
}

export function normalizeAgentOutput(markdown) {
  const steps = [
    removeAgentArtifacts,
    normalizeTbdMarkers,
    normalizeTokenReferences,
    normalizeSectionHeadings,
    normalizeFrontmatterOrder,
    normalizeTableFormatting,
  ];

  let result = String(markdown || "");
  for (const step of steps) {
    result = step(result);
  }

  return `${result.trimEnd()}\n`;
}

export function normalizeAgentOutputFile(filePath) {
  const current = fs.readFileSync(filePath, "utf8");
  const next = normalizeAgentOutput(current);
  if (next !== current) {
    fs.writeFileSync(filePath, next, "utf8");
  }
  return {
    changed: next !== current,
    markdown: next,
  };
}
