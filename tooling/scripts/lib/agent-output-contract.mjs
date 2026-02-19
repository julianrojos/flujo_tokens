import fs from "node:fs";
import path from "node:path";

import { ALLOWED_DOC_STATUS, CANONICAL_H2_ORDER } from "./docs-config.mjs";
import { isPlainObject } from "./is-plain-object.mjs";
import { parseMarkdownFrontmatter } from "./parse-frontmatter.mjs";

const VARIABLE_ID_RE = /VariableID:[A-Za-z0-9:-]+/g;
const IMPLEMENTATION_CODE_FENCE_RE =
  /```(?:js|javascript|ts|tsx|jsx|html|css|scss|sass|vue|react|swift|kotlin|dart|java|go|rust|c|cpp|c#|php|rb)\b/i;

function normalizeHeadingKey(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[–—-]/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractH2Headings(markdownContent) {
  const headings = [];
  const h2Regex = /^##\s+(.+?)\s*$/gm;
  let match;
  while ((match = h2Regex.exec(String(markdownContent || ""))) !== null) {
    headings.push(String(match[1] || "").trim());
  }
  return headings;
}

function isValidLastVerified(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (/^tbd$/i.test(raw)) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return true;
  const asDate = new Date(raw);
  return !Number.isNaN(asDate.getTime());
}

function isValidFileUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (/^tbd$/i.test(raw)) return true;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function sanitizeComponentSlug(raw) {
  return (
    String(raw || "component")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "component"
  );
}

export function validateAgentOutputContract({
  markdown,
  expectedComponentName,
  unresolvedGapCount,
} = {}) {
  const errors = [];
  const source = String(markdown || "");
  const { frontmatter, content } = parseMarkdownFrontmatter(source);

  if (!isPlainObject(frontmatter) || Object.keys(frontmatter).length === 0) {
    errors.push({
      code: "AOC01",
      message: "Missing YAML frontmatter block.",
    });
  } else {
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

export function writeAgentOutputErrorReport({
  componentSlug,
  scriptName,
  markdownPath,
  errors,
  rawOutput,
  outputDir,
}) {
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
