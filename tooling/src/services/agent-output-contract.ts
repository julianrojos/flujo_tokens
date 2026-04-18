/**
 * Agent Output Contract
 * 
 * Validates AI agent output against documentation contract.
 * Ensures headings and content meet project standards.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import {
  CANONICAL_H2_ORDER,
  REQUIRED_CANONICAL_H2,
} from "../utils/docs-config.js";

const VARIABLE_ID_RE = /VariableID:[A-Za-z0-9:-]+/g;
const IMPLEMENTATION_CODE_FENCE_RE =
  /```(?:js|javascript|ts|tsx|jsx|html|css|scss|sass|vue|react|swift|kotlin|dart|java|go|rust|c|cpp|c#|php|rb)\b/i;

/**
 * Validation error structure.
 */
export interface ContractError {
  code: string;
  message: string;
  expected?: string;
  actual?: string;
}

/**
 * Validation result structure.
 */
export interface ContractValidationResult {
  ok: boolean;
  errors: ContractError[];
}

/**
 * Options for validateAgentOutputContract.
 */
export interface ValidateAgentOutputContractOptions {
  markdown?: string;
  expectedComponentName?: string;
  unresolvedGapCount?: number;
}

/**
 * Normalize heading key for comparison.
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
  let match;
  while ((match = h2Regex.exec(String(markdownContent || ""))) !== null) {
    headings.push(String(match[1] || "").trim());
  }
  return headings;
}

/**
 * Sanitize component slug for file naming.
 */
function sanitizeComponentSlug(raw: string): string {
  return (
    String(raw || "component")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "component"
  );
}

/**
 * Validate agent output against documentation contract.
 */
export function validateAgentOutputContract(
  options: ValidateAgentOutputContractOptions = {},
): ContractValidationResult {
  const { markdown, expectedComponentName, unresolvedGapCount } = options;
  const errors: ContractError[] = [];
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
      message: `H1 must match component name: \`${expectedComponentName}\`.`,
      expected: expectedComponentName,
      actual: String(h1Match[1] || "").trim(),
    });
  }

  const canonicalIndex = new Map(
    CANONICAL_H2_ORDER.map((heading, index) => [
      normalizeHeadingKey(heading),
      index,
    ]),
  );
  let previousIndex = -1;
  const h2Headings = extractH2Headings(content);
  const normalizedH2 = new Set(h2Headings.map((heading) => normalizeHeadingKey(heading)));

  for (const requiredHeading of REQUIRED_CANONICAL_H2) {
    const normalizedRequired = normalizeHeadingKey(requiredHeading);
    if (normalizedH2.has(normalizedRequired)) continue;
    errors.push({
      code: "AOC03",
      message: `Missing required H2 heading: \`## ${requiredHeading}\`.`,
    });
  }

  for (const heading of h2Headings) {
    const normalized = normalizeHeadingKey(heading);
    const index = canonicalIndex.get(normalized);
    if (index == null) {
      errors.push({
        code: "AOC03",
        message: `Unauthorized H2 heading: \`## ${heading}\`.`,
      });
      continue;
    }
    if (index < previousIndex) {
      errors.push({
        code: "AOC03",
        message: `H2 heading out of canonical order: \`## ${heading}\`.`,
      });
    }
    previousIndex = Math.max(previousIndex, index);
  }

  if (typeof unresolvedGapCount === "number") {
    const hasGapsSection = h2Headings.some(
      (heading) =>
        normalizeHeadingKey(heading) === normalizeHeadingKey("Gaps / TBD"),
    );
    if (unresolvedGapCount > 0 && !hasGapsSection) {
      errors.push({
        code: "AOC04",
        message:
          "Unresolved gaps exist but `## Gaps / TBD` section is missing.",
      });
    }
    if (unresolvedGapCount === 0 && hasGapsSection) {
      errors.push({
        code: "AOC04",
        message:
          "`## Gaps / TBD` section is present but there are no unresolved gaps.",
      });
    }
  }

  VARIABLE_ID_RE.lastIndex = 0;
  if (VARIABLE_ID_RE.test(source)) {
    errors.push({
      code: "AOC05",
      message: "Forbidden VariableID reference found in markdown.",
    });
  }

  if (IMPLEMENTATION_CODE_FENCE_RE.test(source)) {
    errors.push({
      code: "AOC06",
      message:
        "Implementation-oriented code fence detected in documentation output.",
    });
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

/**
 * Write agent output error report to file.
 */
export function writeAgentOutputErrorReport(params: {
  componentSlug?: string;
  scriptName?: string;
  markdownPath?: string;
  errors: ContractError[];
  rawOutput?: string;
  outputDir?: string;
}): string {
  const {
    componentSlug,
    scriptName,
    markdownPath,
    errors,
    rawOutput,
    outputDir,
  } = params;
  
  const baseDir = path.resolve(
    outputDir || "docs/_generated/agent_output_errors",
  );
  fs.mkdirSync(baseDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = sanitizeComponentSlug(
    componentSlug || path.basename(markdownPath || "", ".md"),
  );
  const reportPath = path.join(baseDir, `${timestamp}_${slug}.json`);
  const payload = {
    ok: false,
    script: String(scriptName || ""),
    markdownPath: markdownPath ? path.resolve(markdownPath) : "",
    errors: Array.isArray(errors) ? errors : [],
    rawOutput: String(rawOutput || ""),
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return reportPath;
}
