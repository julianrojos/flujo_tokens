import * as fs from "node:fs";
import path from "node:path";

import { isPlainObject } from "./is-plain-object.js";
import { parseMarkdownFrontmatter } from "./parse-frontmatter.js";

const VARIABLE_ID_RE = /VariableID:[A-Za-z0-9:-]+/g;
const IMPLEMENTATION_CODE_FENCE_RE =
  /```(?:js|javascript|ts|tsx|jsx|html|css|scss|sass|vue|react|swift|kotlin|dart|java|go|rust|c|cpp|c#|php|rb)\b/i;

export interface AgentOutputContractOptions {
  markdown?: string;
  expectedComponentName?: string;
  unresolvedGapCount?: number;
}

export interface AgentOutputError {
  code: string;
  message: string;
}

export interface AgentOutputContractResult {
  errors: AgentOutputError[];
}

/**
 * Allowed doc status values.
 */
export const ALLOWED_DOC_STATUS = new Set(["draft", "ready", "needs-review"]);

/**
 * Canonical H2 heading order for component docs.
 */
export const CANONICAL_H2_ORDER = [
  "Overview",
  "Anatomy",
  "Properties",
  "Variants",
  "States",
  "Behaviors",
  "Accessibility",
  "Code examples",
  "Design tokens",
  "References",
];

/**
 * Required canonical H2 headings.
 */
export const REQUIRED_CANONICAL_H2 = ["Overview", "Anatomy", "Properties"];

/**
 * Normalize a heading string to a comparable key.
 */
function normalizeHeadingKey(raw: unknown): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[–—-]/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract H2 headings from markdown content.
 */
function extractH2Headings(markdownContent: string): string[] {
  const headings: string[] = [];
  const h2Regex = /^##\s+(.+?)\s*$/gm;
  let match: RegExpExecArray | null;
  
  while ((match = h2Regex.exec(String(markdownContent || ""))) !== null) {
    headings.push(String(match[1] || "").trim());
  }
  return headings;
}

/**
 * Check if a value is a valid lastVerified date.
 */
function isValidLastVerified(value: unknown): boolean {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (/^tbd$/i.test(raw)) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return true;
  const asDate = new Date(raw);
  return !Number.isNaN(asDate.getTime());
}

/**
 * Check if a value is a valid Figma file URL.
 * Accepts TBD marker or a valid HTTP(S) URL with figma.com hostname.
 */
function isValidFileUrl(value: unknown): boolean {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (/^tbd$/i.test(raw)) return true;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    // Validate that the hostname is figma.com or a subdomain
    const hostname = parsed.hostname.toLowerCase();
    return hostname === "figma.com" || hostname.endsWith(".figma.com");
  } catch {
    return false;
  }
}

/**
 * Sanitize a component slug.
 */
function sanitizeComponentSlug(raw: unknown): string {
  return (
    String(raw || "component")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "component"
  );
}

/**
 * Validate agent output against the contract.
 * Checks frontmatter, headings, variable IDs, and code examples.
 */
export function validateAgentOutputContract(
  options: AgentOutputContractOptions = {}
): AgentOutputContractResult {
  const { markdown, expectedComponentName, unresolvedGapCount } = options;
  const errors: AgentOutputError[] = [];
  const source = String(markdown || "");
  
  let frontmatter: Record<string, unknown> = {};
  let content = source;
  let frontmatterParseError = "";
  
  try {
    const result = parseMarkdownFrontmatter(source);
    frontmatter = result.frontmatter as Record<string, unknown>;
    content = result.content;
  } catch (error) {
    frontmatterParseError = error instanceof Error ? error.message : String(error);
  }

  if (frontmatterParseError) {
    errors.push({
      code: "AOC01",
      message: `Invalid markdown frontmatter: ${frontmatterParseError}`,
    });
  }

  if (
    !frontmatterParseError &&
    (!isPlainObject(frontmatter) || Object.keys(frontmatter).length === 0)
  ) {
    errors.push({
      code: "AOC01",
      message: "Missing YAML frontmatter block.",
    });
  } else if (!frontmatterParseError) {
    if (frontmatter.doc_type !== "component") {
      errors.push({
        code: "AOC01",
        message: "Frontmatter `doc_type` must be `component`.",
      });
    }

    const status = String(frontmatter.doc_status || "").trim();
    if (!ALLOWED_DOC_STATUS.has(status)) {
      errors.push({
        code: "AOC01",
        message:
          "Frontmatter `doc_status` must be one of: draft, ready, needs-review.",
      });
    }

    const figma = frontmatter.figma;
    if (!isPlainObject(figma)) {
      errors.push({
        code: "AOC01",
        message: "Frontmatter `figma` object is required.",
      });
    } else {
      if (!isValidFileUrl(figma.file_url)) {
        errors.push({
          code: "AOC01",
          message: "Frontmatter `figma.file_url` must be a valid URL or `TBD`.",
        });
      }
      if (!isValidLastVerified(figma.last_verified)) {
        errors.push({
          code: "AOC01",
          message:
            "Frontmatter `figma.last_verified` must be ISO date/time or `TBD`.",
        });
      }
    }
  }

  const h1Match = String(content || "").match(/^#\s+(.+?)\s*$/m);
  if (!h1Match) {
    errors.push({
      code: "AOC02",
      message: "Missing H1 heading.",
    });
  } else if (
    expectedComponentName &&
    String(h1Match[1] || "")
      .trim()
      .toLowerCase() !== String(expectedComponentName).trim().toLowerCase()
  ) {
    errors.push({
      code: "AOC02",
      message: `H1 heading must match component name: ${expectedComponentName}`,
    });
  }

  const h2Headings = extractH2Headings(content);
  const normalizedHeadings = h2Headings.map(normalizeHeadingKey);
  
  for (const required of REQUIRED_CANONICAL_H2) {
    const key = normalizeHeadingKey(required);
    if (!normalizedHeadings.includes(key)) {
      errors.push({
        code: "AOC03",
        message: `Missing required section: ${required}`,
      });
    }
  }

  const variableMatches = content.match(VARIABLE_ID_RE);
  if (variableMatches && variableMatches.length > 0) {
    const uniqueVariables = new Set(variableMatches);
    if (uniqueVariables.size > 5) {
      errors.push({
        code: "AOC04",
        message: `Too many VariableID references (${uniqueVariables.size}). Use design tokens instead.`,
      });
    }
  }

  const hasCodeFence = IMPLEMENTATION_CODE_FENCE_RE.test(content);
  if (!hasCodeFence && expectedComponentName) {
    errors.push({
      code: "AOC05",
      message: "Missing implementation code examples.",
    });
  }

  if (typeof unresolvedGapCount === "number" && unresolvedGapCount > 0) {
    const gapsSection = content.match(/##\s+Gaps\s*\n([\s\S]*?)(?=^##\s+)/m);
    if (!gapsSection) {
      errors.push({
        code: "AOC06",
        message: "Document has unresolved gaps but no Gaps section.",
      });
    }
  }

  return { errors };
}

/**
 * Write an agent output error report to a file.
 */
export function writeAgentOutputErrorReport(options: {
  outputPath: string;
  componentSlug?: string;
  errors: AgentOutputError[];
  rawOutput?: string;
}): void {
  const { outputPath, componentSlug, errors, rawOutput } = options;
  
  const safeSlug = sanitizeComponentSlug(componentSlug);
  const report = {
    componentSlug: safeSlug,
    scriptName: "agent-output-contract",
    markdownPath: `${safeSlug}.md`,
    errors,
    rawOutput: rawOutput || "",
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
}
