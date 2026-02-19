import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { parseMarkdownFrontmatter } from "./parse-frontmatter.mjs";
import { isPlainObject } from "./is-plain-object.mjs";

function extractH2Headings(content) {
  const headings = [];
  const h2Regex = /^##\s+(.+?)\s*$/gm;
  let match;
  while ((match = h2Regex.exec(String(content || ""))) !== null) {
    headings.push(String(match[1] || "").trim());
  }
  return headings;
}

function countTables(content) {
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

function countTokenReferences(markdown) {
  const matches = String(markdown || "").match(
    /`[A-Za-z][A-Za-z0-9-]*(?:[./][A-Za-z0-9-]+)+`/g,
  );
  return matches ? matches.length : 0;
}

function countTbdMarkers(markdown) {
  const matches = String(markdown || "").match(/\bTBD\b/gi);
  return matches ? matches.length : 0;
}

function sanitizeComponentSlug(raw) {
  return (
    String(raw || "component")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "component"
  );
}

export function computeOutputContractHash(markdown) {
  const source = String(markdown || "");
  const { frontmatter, content } = parseMarkdownFrontmatter(source);
  const contract = {
    frontmatter_keys: isPlainObject(frontmatter)
      ? Object.keys(frontmatter).sort((a, b) => a.localeCompare(b, "en"))
      : [],
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

export function updateAgentDriftBaseline({
  markdownPath,
  componentSlug,
  scriptName,
  outputDir,
}) {
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

  fs.writeFileSync(
    baselinePath,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );

  return {
    hash,
    previousHash,
    driftDetected,
    baselinePath,
  };
}
