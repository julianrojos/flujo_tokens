#!/usr/bin/env node

/**
 * Compute and update content_sha256 traceability field in component documentation.
 *
 * Usage:
 *   npm run ds:compute-traceability -- --file <path> [--update]
 *
 * Purpose:
 *   - Calculate SHA-256 hash of the markdown content (body, excluding frontmatter)
 *   - Add/update content_sha256 in pipeline.ds_component_doc
 *   - Useful for detecting manual changes post-generation
 *   - Can run as a validate gate: error if content_sha256 mismatch (drift detection)
 *
 * Options:
 *   --file <path>      Component markdown file path (required)
 *   --update           Write changes back to file (default: dry-run, print diff)
 *   --json             Output JSON result (suitable for piping)
 *   --registry <path>  Token registry path (for future feature: semantic hashing)
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

import { parseArgs } from "./lib/parse-args.mjs";
import { parseMarkdownFrontmatter } from "./lib/parse-frontmatter.mjs";
import { isPlainObject } from "./lib/is-plain-object.mjs";

/**
 * Compute SHA-256 hash of a string.
 */
function sha256String(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Extract content body from markdown (everything after the frontmatter block).
 * Returns the body string, trimmed but preserving internal structure.
 */
function extractMarkdownBody(rawMarkdown) {
  const parsed = parseMarkdownFrontmatter(rawMarkdown);
  if (!parsed.content) {
    return String(rawMarkdown || "").trim();
  }
  return String(parsed.content || "").trim();
}

/**
 * Compute content_sha256 for a markdown file.
 * Returns { body, hash }.
 */
function computeContentSha256(rawMarkdown) {
  const body = extractMarkdownBody(rawMarkdown);
  const hash = sha256String(body);
  return { body, hash };
}

/**
 * Update pipeline.ds_component_doc.content_sha256 in frontmatter.
 * Preserves other pipeline fields.
 */
function updateContentSha256Frontmatter(rawMarkdown, contentHash) {
  const parsed = parseMarkdownFrontmatter(rawMarkdown);
  if (!parsed.frontmatter || typeof parsed.frontmatter !== 'object') {
    console.error("ERROR: Could not parse frontmatter");
    process.exit(1);
  }

  const fm = isPlainObject(parsed.frontmatter) ? parsed.frontmatter : {};

  if (!fm.pipeline) fm.pipeline = {};
  if (!fm.pipeline.ds_component_doc) fm.pipeline.ds_component_doc = {};

  const oldHash = fm.pipeline.ds_component_doc.content_sha256;
  fm.pipeline.ds_component_doc.content_sha256 = contentHash;

  const frontmatterYaml = yaml.dump(fm, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });

  const body = extractMarkdownBody(rawMarkdown);
  const nextMarkdown = `---\n${frontmatterYaml.trimEnd()}\n---\n\n${body}`;

  return { oldHash, newHash: contentHash, nextMarkdown };
}

/**
 * Main entry point.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2), {
    string: ["file", "registry"],
    boolean: ["update", "json"],
    alias: { f: "file", u: "update" },
  });

  if (!args.file) {
    console.error("ERROR: --file is required");
    console.error("Usage: npm run ds:compute-traceability -- --file <path> [--update]");
    process.exit(1);
  }

  const filePath = path.resolve(args.file);
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: File not found: ${filePath}`);
    process.exit(1);
  }

  let rawMarkdown;
  try {
    rawMarkdown = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    console.error(`ERROR: Could not read file: ${err.message}`);
    process.exit(1);
  }

  const { body, hash } = computeContentSha256(rawMarkdown);
  const { oldHash, nextMarkdown } = updateContentSha256Frontmatter(
    rawMarkdown,
    hash
  );

  const result = {
    file: path.relative(process.cwd(), filePath),
    contentLength: body.length,
    contentSha256: hash,
    previousSha256: oldHash || null,
    changed: oldHash !== hash,
    action: args.update ? "updated" : "would-update",
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`✓ Computed content_sha256: ${hash}`);
    if (oldHash) {
      console.log(`  Previous: ${oldHash}`);
      if (oldHash !== hash) {
        console.log(`  ⚠ Content has changed (drift detected)`);
      } else {
        console.log(`  ✓ Content unchanged`);
      }
    } else {
      console.log(`  (first time computing hash)`);
    }
    console.log(`  File: ${path.relative(process.cwd(), filePath)}`);
  }

  if (args.update) {
    try {
      fs.writeFileSync(filePath, nextMarkdown, "utf8");
      if (!args.json) {
        console.log(`✓ Updated: ${path.relative(process.cwd(), filePath)}`);
      }
    } catch (err) {
      console.error(`ERROR: Could not write file: ${err.message}`);
      process.exit(1);
    }
  } else {
    if (!args.json) {
      console.log(`\nRun with --update to apply changes.`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
