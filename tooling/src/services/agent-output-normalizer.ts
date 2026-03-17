/**
 * Agent Output Normalizer
 * 
 * Normalizes AI agent output to match project documentation standards.
 * Handles frontmatter ordering, heading normalization, and artifact removal.
 */

import * as fs from "node:fs";
import yaml from "js-yaml";

import { CANONICAL_H2_ORDER } from "../utils/docs-config.js";
import { isPlainObject } from "../utils/is-plain-object.js";
import { parseMarkdownFrontmatter } from "../utils/parse-frontmatter.js";

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

/**
 * Normalize heading token for comparison.
 */
function normalizeHeadingToken(raw: unknown): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[–—-]/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Order object keys according to preferred order.
 */
function orderObjectKeys<T extends Record<string, unknown>>(
  source: T,
  preferredOrder: string[],
): T {
  const next: Partial<T> = {};
  for (const key of preferredOrder) {
    if (key in source) next[key as keyof T] = source[key as keyof T];
  }
  for (const [key, value] of Object.entries(source)) {
    if (!(key in next)) next[key as keyof T] = value as T[keyof T];
  }
  return next as T;
}

/**
 * Normalize frontmatter key ordering in markdown.
 */
function normalizeFrontmatterOrder(markdown: string): string {
  const { frontmatter, content } = parseMarkdownFrontmatter(markdown);
  if (!isPlainObject(frontmatter) || Object.keys(frontmatter).length === 0) {
    return markdown;
  }

  const fm = { ...frontmatter } as Record<string, unknown>;
  if (isPlainObject(fm.figma)) {
    fm.figma = orderObjectKeys(fm.figma as Record<string, unknown>, FIGMA_KEY_ORDER);
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

/**
 * Normalize section headings to canonical form.
 */
function normalizeSectionHeadings(markdown: string): string {
  return String(markdown || "").replace(
    /^##\s+(.+?)\s*$/gm,
    (_match, headingText) => {
      const normalized = normalizeHeadingToken(headingText);
      const canonical = HEADING_LOOKUP.get(normalized);
      return canonical ? `## ${canonical}` : `## ${String(headingText).trim()}`;
    },
  );
}

/**
 * Normalize token references to use backticks.
 */
function normalizeTokenReferences(markdown: string): string {
  return String(markdown || "").replace(
    /(^|[^`])((?:[A-Z][A-Za-z0-9-]*)(?:[./][A-Za-z0-9-]+)+)\s*\((#[0-9A-Fa-f]{3,8}|-?\d+(?:\.\d+)?(?:px|rem|em|%)?)\)/gm,
    (match, prefix, tokenPath, fallback) => {
      const hasBackticks = match.includes("`");
      if (hasBackticks) return match;
      return `${prefix}\`${tokenPath}\` (${fallback})`;
    },
  );
}

/**
 * Normalize TBD markers to standard form.
 */
function normalizeTbdMarkers(markdown: string): string {
  return String(markdown || "").replace(
    /\b(?:T\.?\s*B\.?\s*D\.?|To Be Determined)\b/gi,
    "TBD",
  );
}

/**
 * Normalize table formatting.
 */
function normalizeTableFormatting(markdown: string): string {
  const lines = String(markdown || "").split("\n");
  const normalized = lines.map((line) => {
    if (!/^\s*\|.*\|\s*$/.test(line)) return line;
    const trimmed = line.trim();
    const content = trimmed.slice(1, -1);
    // Split on unescaped pipes only (respects \| escape sequences)
    const cells = content.split(/(?<!\\)\|/).map((cell) => cell.trim());
    if (cells.length === 0) return line;
    return `| ${cells.join(" | ")} |`;
  });
  return normalized.join("\n");
}

/**
 * Strip wrapped markdown fence from output.
 */
function stripWrappedMarkdownFence(markdown: string): string {
  const match = String(markdown || "").match(
    /^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i,
  );
  if (!match) return markdown;
  return match[1].trim();
}

/**
 * Remove leading agent preamble lines.
 */
function removeLeadingAgentPreamble(markdown: string): string {
  const lines = String(markdown || "").split("\n");
  const trimmed: string[] = [];
  let skipping = true;
  const preambleLineRe =
    /^(?:here(?:'|')s|i(?:'|')ve|i have|let me|sure,|of course|perfecto|listo)\b/i;

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

/**
 * Remove agent artifacts from output.
 */
function removeAgentArtifacts(markdown: string): string {
  let result = String(markdown || "");
  result = result.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  result = stripWrappedMarkdownFence(result);
  result = removeLeadingAgentPreamble(result);
  return result.trim();
}

/**
 * Normalize complete agent output.
 */
export function normalizeAgentOutput(markdown: string): string {
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

/**
 * Normalize agent output file in place.
 */
export function normalizeAgentOutputFile(filePath: string): {
  changed: boolean;
  markdown: string;
} {
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
