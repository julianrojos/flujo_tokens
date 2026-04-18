/**
 * Agent Drift Detector
 * 
 * Computes output contract hashes and detects drift from baseline.
 * Used to verify documentation consistency across agent runs.
 */

import crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { writeJsonAtomic } from "../utils/file-snapshot.js";

/**
 * Output contract structure for hashing.
 */
export interface OutputContract {
  h2_headings: string[];
  table_count: number;
  token_ref_count: number;
  tbd_count: number;
  has_gaps_section: boolean;
  has_code_fences: boolean;
  has_variable_ids: boolean;
}

/**
 * Hash computation result.
 */
export interface HashResult {
  hash: string;
  contract: OutputContract;
}

/**
 * Drift detection result.
 */
export interface DriftDetectionResult {
  hash: string;
  previousHash: string;
  driftDetected: boolean;
  baselinePath: string;
}

/**
 * Options for updateAgentDriftBaseline.
 */
export interface UpdateAgentDriftBaselineOptions {
  markdownPath: string;
  componentSlug?: string;
  scriptName?: string;
  outputDir?: string;
}

/**
 * Extract H2 headings from content (ignoring code fences).
 */
function extractH2Headings(content: string): string[] {
  const headings: string[] = [];
  const h2Regex = /^##\s+(.+?)\s*$/gm;
  let match;
  
  // Track if we're inside a code fence
  let inCodeFence = false;
  const codeFenceRegex = /^```/m;
  
  while ((match = h2Regex.exec(String(content || ""))) !== null) {
    // Check if this match is inside a code fence
    const matchIndex = match.index;
    const textBeforeMatch = content.slice(0, matchIndex);
    const fenceMatches = textBeforeMatch.match(codeFenceRegex);
    
    // Count fences to determine if we're inside a code block
    const fenceCount = (textBeforeMatch.match(/^```/gm) || []).length;
    inCodeFence = fenceCount % 2 === 1;
    
    if (!inCodeFence) {
      headings.push(String(match[1] || "").trim());
    }
  }
  return headings;
}

/**
 * Count tables in content.
 */
function countTables(content: string): number {
  const lines = String(content || "").split("\n");
  let count = 0;
  let inTable = false;
  for (const line of lines) {
    const isTableLine = /^\s*\|.*\|\s*$/.test(line);
    if (isTableLine && !inTable) {
      inTable = true;
      count += 1;
      continue;
    }
    if (!isTableLine) inTable = false;
  }
  return count;
}

/**
 * Count token references in markdown.
 */
function countTokenReferences(markdown: string): number {
  const matches = String(markdown || "").match(
    /`[A-Za-z][A-Za-z0-9-]*(?:[./][A-Za-z0-9-]+)+`/g,
  );
  return matches ? matches.length : 0;
}

/**
 * Count TBD markers in markdown.
 */
function countTbdMarkers(markdown: string): number {
  const matches = String(markdown || "").match(/\bTBD\b/gi);
  return matches ? matches.length : 0;
}

function extractMarkdownContent(markdown: string): string {
  return String(markdown || "").replace(/\r\n/g, "\n");
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
 * Compute output contract hash for drift detection.
 */
export function computeOutputContractHash(markdown: string): HashResult {
  const source = String(markdown || "");
  const content = extractMarkdownContent(source);
  const contract: OutputContract = {
    h2_headings: extractH2Headings(content),
    table_count: countTables(content),
    token_ref_count: countTokenReferences(source),
    tbd_count: countTbdMarkers(source),
    has_gaps_section: /##\s+Gaps\s*\/\s*TBD/i.test(source),
    has_code_fences: /```/.test(source),
    has_variable_ids: /VariableID:/.test(source),
  };

  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(contract))
    .digest("hex")
    .slice(0, 16);

  return { hash, contract };
}

/**
 * Update agent drift baseline for component.
 */
export function updateAgentDriftBaseline(
  options: UpdateAgentDriftBaselineOptions,
): DriftDetectionResult {
  const { markdownPath, componentSlug, scriptName, outputDir } = options;
  
  const filePath = path.resolve(markdownPath);
  const markdown = fs.readFileSync(filePath, "utf8");
  const { hash, contract } = computeOutputContractHash(markdown);
  const baseDir = path.resolve(
    outputDir || "docs/_generated/agent_output_hashes",
  );
  fs.mkdirSync(baseDir, { recursive: true });

  const slug = sanitizeComponentSlug(
    componentSlug || path.basename(filePath, path.extname(filePath)),
  );
  const baselinePath = path.join(baseDir, `${slug}.json`);

  let previousHash = "";
  if (fs.existsSync(baselinePath)) {
    try {
      const previous = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
      previousHash = String(previous.hash || "");
    } catch {
      previousHash = "";
    }
  }

  const driftDetected = previousHash.length > 0 && previousHash !== hash;
  const payload = {
    component: slug,
    markdownPath: filePath,
    script: String(scriptName || ""),
    updatedAt: new Date().toISOString(),
    hash,
    previous_hash: previousHash || undefined,
    drift_detected: driftDetected,
    contract,
  };

  writeJsonAtomic(baselinePath, payload);

  return {
    hash,
    previousHash,
    driftDetected,
    baselinePath,
  };
}
