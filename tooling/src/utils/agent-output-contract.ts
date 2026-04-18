import * as fs from "node:fs";
import path from "node:path";

import {
  CANONICAL_H2_ORDER,
  REQUIRED_CANONICAL_H2,
} from "./docs-config.js";
import { GAPS_VALIDATION } from "../services/gaps-contract.js";
import {
  extractGapsSection,
  extractNonEmptySectionLines,
} from "../services/gaps.js";

export {
  CANONICAL_H2_ORDER,
  REQUIRED_CANONICAL_H2,
};

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
 * Checks headings, variable IDs, and code examples.
 */
export function validateAgentOutputContract(
  options: AgentOutputContractOptions = {}
): AgentOutputContractResult {
  const { markdown, expectedComponentName, unresolvedGapCount } = options;
  const errors: AgentOutputError[] = [];
  const source = String(markdown || "");
  const content = source;

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
  const canonicalSet = new Set(CANONICAL_H2_ORDER.map(normalizeHeadingKey));

  // 1. Check required headings
  for (const required of REQUIRED_CANONICAL_H2) {
    const key = normalizeHeadingKey(required);
    if (!normalizedHeadings.includes(key)) {
      errors.push({
        code: "AOC03",
        message: `Missing required section: ${required}`,
      });
    }
  }

  // 2. Check unauthorized headings
  for (let i = 0; i < h2Headings.length; i++) {
    const key = normalizedHeadings[i];
    if (!canonicalSet.has(key)) {
      errors.push({
        code: "AOC03",
        message: `Unauthorized H2 heading: ${h2Headings[i]}`,
      });
    }
  }

  // 3. Check canonical order
  let lastCanonicalIndex = -1;
  const canonicalOrderMap = new Map(CANONICAL_H2_ORDER.map((h, i) => [normalizeHeadingKey(h), i]));

  for (let i = 0; i < normalizedHeadings.length; i++) {
    const key = normalizedHeadings[i];
    const canonicalIndex = canonicalOrderMap.get(key);
    if (canonicalIndex !== undefined) {
      if (canonicalIndex < lastCanonicalIndex) {
        errors.push({
          code: "AOC03",
          message: `H2 headings out of order: ${h2Headings[i]} appears after a later canonical section`,
        });
      }
      lastCanonicalIndex = canonicalIndex;
    }
  }

  const variableMatches = content.match(VARIABLE_ID_RE);
  if (variableMatches && variableMatches.length > 0) {
    const uniqueVariables = new Set(variableMatches);
    errors.push({
      code: "AOC04",
      message: `VariableID references are not allowed (${uniqueVariables.size} found). Use design tokens instead.`,
    });
  }

  const hasCodeFence = IMPLEMENTATION_CODE_FENCE_RE.test(content);
  if (hasCodeFence) {
    errors.push({
      code: "AOC05",
      message: "Implementation code fences are not allowed.",
    });
  }

  if (typeof unresolvedGapCount === "number" && unresolvedGapCount > 0) {
    const gapsSection = extractGapsSection(content);
    if (!gapsSection) {
      errors.push({
        code: "AOC06",
        message: "Document has unresolved gaps but no Gaps / TBD section.",
      });
    } else {
      const checklistLines = extractNonEmptySectionLines(gapsSection.body);
      if (!checklistLines.length) {
        errors.push({
          code: "AOC06",
          message: "Document has unresolved gaps but Gaps / TBD section is empty.",
        });
      } else if (
        checklistLines.some(
          (line) => !GAPS_VALIDATION.checkboxFormatRegex.test(line),
        )
      ) {
        errors.push({
          code: "AOC06",
          message:
            "Document has unresolved gaps but Gaps / TBD section must use canonical checkbox format.",
        });
      }
    }
  }

  return { errors };
}

/**
 * Write an agent output error report to a file.
 */
export function writeAgentOutputErrorReport(options: {
  outputPath?: string;  // Optional: defaults to docs/_generated/agent_output_errors/
  componentSlug?: string;
  markdownPath?: string;  // Optional: actual markdown file path
  scriptName?: string;  // Optional: defaults to "agent-output-contract"
  errors: AgentOutputError[];
  rawOutput?: string;
}): void {
  const {
    outputPath,
    componentSlug,
    markdownPath,
    scriptName = "agent-output-contract",
    errors,
    rawOutput
  } = options;

  const safeSlug = sanitizeComponentSlug(componentSlug);

  // Use provided outputPath or default to docs/_generated/agent_output_errors/
  const reportPath = outputPath || `docs/_generated/agent_output_errors/${safeSlug}.error.json`;

  const report = {
    componentSlug: safeSlug,
    scriptName,
    markdownPath: markdownPath || `${safeSlug}.md`,
    errors,
    rawOutput: rawOutput || "",
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
}
