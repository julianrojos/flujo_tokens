#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import { parseMarkdownFrontmatter } from "./lib/parse-frontmatter.mjs";
import { DOCS_ROOT, DOCS_SPEC_DIR } from "./lib/paths.mjs";
import { DEFAULT_TOKEN_REGISTRY_PATH } from "./lib/token-registry.mjs";

const HASH_RE = /^[a-f0-9]{64}$/i;

const USAGE = {
  command:
    "npm run ds:mark-needs-review -- [--docs-root docs/components] [--spec-root docs/_spec/components] [--registry docs/_generated/token-registry.json]",
  description:
    "Mark component markdown docs as `needs-review` when traceability hashes drift from current spec or token registry.",
  options: [
    {
      name: "--docs-root <path>",
      description: "Component docs directory or a parent docs directory.",
      defaultValue: "docs/components",
    },
    {
      name: "--spec-root <path>",
      description: "Component spec directory.",
      defaultValue: "docs/_spec/components",
    },
    {
      name: "--registry <path>",
      description: "Token registry JSON path used for traceability checks.",
      defaultValue: "docs/_generated/token-registry.json",
    },
    {
      name: "--file <path>",
      description: "Single component markdown file to inspect.",
    },
    {
      name: "--spec-file <path>",
      description: "Explicit spec file path for --file mode.",
    },
    {
      name: "--dry-run <true|false>",
      description: "Report changes without writing files.",
      defaultValue: "false",
    },
    {
      name: "--help",
      description: "Show this help message.",
    },
  ],
};

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function isValidHash(raw) {
  return HASH_RE.test(String(raw || "").trim());
}

function collectComponentMarkdownFiles(docsRoot, explicitFilePath) {
  if (explicitFilePath) return [path.resolve(explicitFilePath)];
  const resolvedRoot = path.resolve(docsRoot);
  if (!fs.existsSync(resolvedRoot)) return [];

  const componentDir =
    path.basename(resolvedRoot) === "components"
      ? resolvedRoot
      : path.join(resolvedRoot, "components");
  if (!fs.existsSync(componentDir)) return [];

  return fs
    .readdirSync(componentDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".md") &&
        entry.name !== "overview.md",
    )
    .map((entry) => path.join(componentDir, entry.name))
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function detectDriftReasons({
  frontmatter,
  specPath,
  registryPath,
  registryHash,
}) {
  const reasons = [];
  const pipeline = frontmatter?.pipeline;
  const dsComponentDoc =
    pipeline && typeof pipeline === "object" && !Array.isArray(pipeline)
      ? pipeline.ds_component_doc
      : null;

  if (
    !dsComponentDoc ||
    typeof dsComponentDoc !== "object" ||
    Array.isArray(dsComponentDoc)
  ) {
    reasons.push("missing_traceability_block");
    return reasons;
  }

  const specHashFrontmatter = String(dsComponentDoc.spec_sha256 || "").trim();
  const tokenHashFrontmatter = String(
    dsComponentDoc.token_registry_sha256 || "",
  ).trim();

  if (!fs.existsSync(specPath)) {
    reasons.push("missing_linked_spec");
  } else {
    const currentSpecHash = sha256File(specPath);
    if (!specHashFrontmatter) {
      reasons.push("missing_spec_sha256");
    } else if (!isValidHash(specHashFrontmatter)) {
      reasons.push("invalid_spec_sha256");
    } else if (specHashFrontmatter !== currentSpecHash) {
      reasons.push("spec_sha256_drift");
    }
  }

  if (!fs.existsSync(registryPath)) {
    reasons.push("missing_token_registry");
  } else if (!tokenHashFrontmatter) {
    reasons.push("missing_token_registry_sha256");
  } else if (!isValidHash(tokenHashFrontmatter)) {
    reasons.push("invalid_token_registry_sha256");
  } else if (tokenHashFrontmatter !== registryHash) {
    reasons.push("token_registry_sha256_drift");
  }

  return reasons;
}

function orderFrontmatter(frontmatter) {
  const preferred = ["doc_type", "doc_status", "figma", "pipeline", "version"];
  const ordered = {};
  for (const key of preferred) {
    if (key in frontmatter) ordered[key] = frontmatter[key];
  }
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!(key in ordered)) ordered[key] = value;
  }
  return ordered;
}

function buildMarkdown(frontmatter, content) {
  const yamlText = yaml.dump(orderFrontmatter(frontmatter), {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
  const normalizedContent = String(content || "").replace(/^\n+/, "");
  return `---\n${yamlText.trimEnd()}\n---\n\n${normalizedContent}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (String(args.help || "false") === "true") {
    printUsage(USAGE, { exitCode: 0 });
  }

  const docsRootInput = path.resolve(args["docs-root"] || path.join(DOCS_ROOT, "components"));
  const specRoot = path.resolve(
    args["spec-root"] || path.join(DOCS_SPEC_DIR, "components"),
  );
  const registryPath = path.resolve(
    args.registry || DEFAULT_TOKEN_REGISTRY_PATH,
  );
  const explicitFilePath = args.file ? path.resolve(args.file) : "";
  const explicitSpecFilePath = args["spec-file"]
    ? path.resolve(args["spec-file"])
    : "";
  const dryRun = String(args["dry-run"] || "false") === "true";

  const files = collectComponentMarkdownFiles(docsRootInput, explicitFilePath);
  if (files.length === 0) {
    console.error(
      explicitFilePath
        ? `Component markdown file not found: ${explicitFilePath}`
        : `No component markdown files found in: ${docsRootInput}`,
    );
    process.exit(1);
  }

  const registryHash = fs.existsSync(registryPath) ? sha256File(registryPath) : "";
  const updates = [];
  const unchanged = [];
  const errors = [];

  for (const markdownPath of files) {
    let raw = "";
    let frontmatter = {};
    let content = "";

    try {
      raw = fs.readFileSync(markdownPath, "utf8");
      ({ frontmatter, content } = parseMarkdownFrontmatter(raw));
    } catch (error) {
      errors.push({
        file: markdownPath,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const fileSlug = path.basename(markdownPath, path.extname(markdownPath));
    const specPath = explicitSpecFilePath || path.join(specRoot, `${fileSlug}.yml`);
    const reasons = detectDriftReasons({
      frontmatter,
      specPath,
      registryPath,
      registryHash,
    });

    const currentStatus = String(frontmatter.doc_status || "").trim().toLowerCase();
    if (reasons.length === 0 || currentStatus === "needs-review") {
      unchanged.push({
        file: markdownPath,
        doc_status: currentStatus || "<missing>",
        reasons,
      });
      continue;
    }

    const nextFrontmatter =
      frontmatter && typeof frontmatter === "object" && !Array.isArray(frontmatter)
        ? { ...frontmatter, doc_status: "needs-review" }
        : { doc_status: "needs-review" };
    const nextMarkdown = buildMarkdown(nextFrontmatter, content);

    if (!dryRun && nextMarkdown !== raw) {
      fs.writeFileSync(markdownPath, nextMarkdown, "utf8");
    }

    updates.push({
      file: markdownPath,
      from: currentStatus || "<missing>",
      to: "needs-review",
      reasons,
    });
  }

  const report = {
    ok: errors.length === 0,
    dryRun,
    docsRoot: docsRootInput,
    specRoot,
    registryPath,
    summary: {
      filesChecked: files.length,
      updated: updates.length,
      unchanged: unchanged.length,
      errors: errors.length,
    },
    updates,
    errors,
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.ok ? 0 : 1);
}

main();
