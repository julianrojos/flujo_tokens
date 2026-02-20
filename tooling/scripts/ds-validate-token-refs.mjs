#!/usr/bin/env node

/**
 * ds:validate-token-refs
 *
 * Standalone token-reference validator. Runs the full docs validation pipeline
 * but projects the output into a focused report with four classified buckets:
 *
 *   unresolved_tokens   — token paths that do not exist in the registry (TOK01, SPEC01)
 *   wrong_format_tokens — VariableID:* or other forbidden formats (TOK03)
 *   case_mismatch_tokens — token paths that exist but with different casing (TOK01 + suggested)
 *   deprecated_tokens   — token paths that exist but are flagged deprecated (TOK02)
 *
 * Exit codes:
 *   0 — no blocking issues
 *   1 — unresolved_tokens.length > 0  (blocking — CI must fail)
 *   2 — wrong_format_tokens.length > 0 (blocking)
 *   3 — both of the above
 *
 * Usage:
 *   npm run ds:validate-token-refs
 *   npm run ds:validate-token-refs -- --component-name Alert
 *   npm run ds:validate-token-refs -- --spec-file docs/_spec/components/alert.yml
 *   npm run ds:validate-token-refs -- --file docs/components/alert.md
 *   npm run ds:validate-token-refs -- --json          (machine-readable JSON output)
 *   npm run ds:validate-token-refs -- --no-specs      (skip spec YAML files)
 *   npm run ds:validate-token-refs -- --no-markdown   (skip markdown files)
 */

import path from "node:path";

import { parseArgs } from "./lib/parse-args.mjs";
import {
  COMPONENT_DOCS_DIR,
  DOCS_SPEC_DIR,
  resolveProjectPath,
} from "./lib/paths.mjs";
import { DEFAULT_TOKEN_REGISTRY_PATH } from "./lib/token-registry.mjs";
import { validateDocs } from "./lib/docs-validator.mjs";

// ─── Codes that indicate token-reference problems ────────────────────────────

// TOK01: token path not found in registry (prose markdown)
// TOK02: deprecated token usage (markdown)
// TOK03: VariableID:* forbidden format (markdown)
// SPEC01: token path not found in registry (spec YAML token_mapping)
const TOKEN_ERROR_CODES = new Set(["TOK01", "TOK02", "TOK03", "SPEC01"]);
const UNRESOLVED_CODES  = new Set(["TOK01", "SPEC01"]);
const DEPRECATED_CODES  = new Set(["TOK02"]);
const WRONG_FORMAT_CODES = new Set(["TOK03"]);

// ─── Classification helpers ──────────────────────────────────────────────────

function classifyFinding(finding) {
  const code = String(finding?.code || "").trim();
  const message = String(finding?.message || "").toLowerCase();
  const hasSuggested = typeof finding?.suggested === "string" && finding.suggested.length > 0;

  if (WRONG_FORMAT_CODES.has(code)) return "wrong_format";
  if (DEPRECATED_CODES.has(code))  return "deprecated";

  if (UNRESOLVED_CODES.has(code)) {
    // A suggested fix indicates a case mismatch (the token exists, just differently cased)
    if (hasSuggested || message.includes("case mismatch")) return "case_mismatch";
    return "unresolved";
  }

  return null;
}

function buildTokenEntry(finding) {
  return {
    token: finding.token || extractTokenFromMessage(finding.message),
    file:  path.relative(process.cwd(), finding.file || ""),
    line:  finding.line ?? null,
    message: finding.message,
    suggested: finding.suggested ?? null,
    source_code: finding.code,
    rule_ids: finding.rule_ids ?? [],
  };
}

function extractTokenFromMessage(message) {
  // Extract backtick-wrapped token from messages like:
  //   "Token reference not found in registry: `Semantic.Color.Foo`."
  //   "Token mapping `token_mapping.container.background`: Token reference not found..."
  const match = String(message || "").match(/`([^`]+)`[^`]*$/);
  return match?.[1] ?? "";
}

// ─── Report projection ───────────────────────────────────────────────────────

function projectTokenRefsReport(baseReport, options = {}) {
  const allFindings = [...baseReport.errors, ...baseReport.warnings];
  const tokenFindings = allFindings.filter((f) =>
    TOKEN_ERROR_CODES.has(String(f?.code || "").trim()),
  );

  const buckets = {
    unresolved:   [],
    wrong_format: [],
    case_mismatch: [],
    deprecated:   [],
  };

  for (const finding of tokenFindings) {
    const category = classifyFinding(finding);
    if (category) buckets[category].push(buildTokenEntry(finding));
  }

  // Deduplicate by token path within each bucket
  for (const [key, entries] of Object.entries(buckets)) {
    const seen = new Set();
    buckets[key] = entries.filter((entry) => {
      const dedupeKey = `${entry.token}|${entry.file}|${entry.line}`;
      if (seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    });
  }

  const hasBlockingErrors =
    buckets.unresolved.length > 0 || buckets.wrong_format.length > 0;

  return {
    ok: !hasBlockingErrors,
    generatedAt: baseReport.generatedAt,
    summary: {
      files_checked:        baseReport.summary.filesChecked,
      spec_files_checked:   baseReport.summary.specFilesChecked,
      token_refs_checked:   baseReport.summary.tokenRefsChecked,
      unresolved_tokens:    buckets.unresolved.length,
      wrong_format_tokens:  buckets.wrong_format.length,
      case_mismatch_tokens: buckets.case_mismatch.length,
      deprecated_tokens:    buckets.deprecated.length,
    },
    // Blocking (CI must fail):
    unresolved_tokens:    buckets.unresolved,
    wrong_format_tokens:  buckets.wrong_format,
    // Non-blocking (warnings):
    case_mismatch_tokens: buckets.case_mismatch,
    deprecated_tokens:    buckets.deprecated,
  };
}

// ─── Human-readable console output ──────────────────────────────────────────

function printHumanReport(report, args) {
  const { summary } = report;

  const statusIcon = report.ok ? "✅" : "❌";
  console.log(
    `\n${statusIcon}  Token reference validation — ${new Date(report.generatedAt).toLocaleTimeString()}`,
  );
  console.log(
    `   Checked: ${summary.files_checked} markdown file(s), ${summary.spec_files_checked} spec YAML file(s), ${summary.token_refs_checked} token ref(s)\n`,
  );

  if (report.unresolved_tokens.length > 0) {
    console.error(`🔴  UNRESOLVED tokens (${report.unresolved_tokens.length}) — BLOCKING`);
    for (const entry of report.unresolved_tokens) {
      const loc = entry.line ? `:${entry.line}` : "";
      console.error(`     ${entry.file}${loc}  →  ${entry.token || entry.message}`);
      if (entry.suggested) {
        console.error(`        Did you mean: ${entry.suggested}`);
      }
    }
    console.error("");
  }

  if (report.wrong_format_tokens.length > 0) {
    console.error(`🔴  WRONG FORMAT tokens (${report.wrong_format_tokens.length}) — BLOCKING`);
    for (const entry of report.wrong_format_tokens) {
      const loc = entry.line ? `:${entry.line}` : "";
      console.error(`     ${entry.file}${loc}  →  ${entry.message}`);
    }
    console.error("");
  }

  if (report.case_mismatch_tokens.length > 0) {
    console.warn(`🟡  CASE MISMATCH tokens (${report.case_mismatch_tokens.length}) — non-blocking`);
    for (const entry of report.case_mismatch_tokens) {
      const loc = entry.line ? `:${entry.line}` : "";
      console.warn(`     ${entry.file}${loc}  →  ${entry.token}`);
      if (entry.suggested) console.warn(`        Fix: rename to ${entry.suggested}`);
    }
    console.warn("");
  }

  if (report.deprecated_tokens.length > 0) {
    console.warn(`🟡  DEPRECATED tokens (${report.deprecated_tokens.length}) — non-blocking`);
    for (const entry of report.deprecated_tokens) {
      const loc = entry.line ? `:${entry.line}` : "";
      console.warn(`     ${entry.file}${loc}  →  ${entry.token || entry.message}`);
    }
    console.warn("");
  }

  if (report.ok) {
    console.log("   All token references are valid.\n");
  } else {
    const fix = buildFixSuggestion(report, args);
    if (fix) console.error(`💡  Next: ${fix}\n`);
  }
}

function buildFixSuggestion(report, args) {
  if (report.unresolved_tokens.length > 0) {
    const sample = report.unresolved_tokens[0];
    if (sample?.file?.endsWith(".yml")) {
      const slug = path.basename(sample.file, ".yml");
      return `npm run ds:audit-consistency -- --component-name ${slug}`;
    }
    return "npm run ds:audit-consistency  (identify stale token paths)";
  }
  if (report.wrong_format_tokens.length > 0) {
    return "Replace VariableID:* references with canonical token paths from token-registry.json";
  }
  return null;
}

// ─── Exit code logic ─────────────────────────────────────────────────────────

function computeExitCode(report) {
  const hasUnresolved   = report.unresolved_tokens.length > 0;
  const hasWrongFormat  = report.wrong_format_tokens.length > 0;
  if (hasUnresolved && hasWrongFormat) return 3;
  if (hasUnresolved)   return 1;
  if (hasWrongFormat)  return 2;
  return 0;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));

  const componentName = args["component-name"] || args.component || null;
  const registryPath  = args.registry || DEFAULT_TOKEN_REGISTRY_PATH;
  const jsonOutput    = String(args.json || "false") === "true";
  const noSpecs       = String(args["no-specs"] || "false") === "true";
  const noMarkdown    = String(args["no-markdown"] || "false") === "true";

  // Resolve target files from component name or explicit paths
  let filePath     = args.file     ? path.resolve(args.file)      : null;
  let specFilePath = args["spec-file"] ? path.resolve(args["spec-file"]) : null;

  if (componentName && !filePath && !specFilePath) {
    const snake = componentName
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .replace(/[\s-]+/g, "_")
      .toLowerCase();
    filePath     = noMarkdown ? null : resolveProjectPath("docs", "components", `${snake}.md`);
    specFilePath = noSpecs    ? null : resolveProjectPath("docs", "_spec", "components", `${snake}.yml`);
  }

  const docsRoot = noMarkdown ? null : (args["docs-root"] || COMPONENT_DOCS_DIR);

  let baseReport;
  try {
    baseReport = validateDocs({
      docsRoot:     filePath   ? null  : docsRoot,
      registryPath,
      filePath:     noMarkdown ? null  : filePath,
      specFilePath: noSpecs    ? null  : specFilePath,
      checkOverview: false,   // not relevant for token-ref validation
      checkSpecs:   !noSpecs,
      allowExtraH2: true,     // structural checks not the concern here
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Fatal: ${message}`);
    process.exit(1);
  }

  const report = projectTokenRefsReport(baseReport, args);

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHumanReport(report, args);
  }

  process.exit(computeExitCode(report));
}

main();
