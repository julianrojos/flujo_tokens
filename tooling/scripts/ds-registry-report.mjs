#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import {
  DEFAULT_COMPONENT_REGISTRY_PATH,
  readComponentRegistry,
} from "./lib/component-registry/index.mjs";
import { normalizeSortKey, stableHash } from "./lib/component-registry/utils.mjs";
import { PROJECT_ROOT, resolveProjectPath } from "./lib/paths.mjs";

const REPORT_SCHEMA_VERSION = 1;
const DEFAULT_OUT_MD_PATH = resolveProjectPath("docs", "COMPONENTS_INDEX.md");
const DEFAULT_OUT_JSON_PATH = resolveProjectPath("docs", "_generated", "components-health.json");

const USAGE = {
  command: "npm run ds:registry:report [-- --dry-run true]",
  description:
    "Build read-only component status projections from docs/_generated/component-registry.json.",
  options: [
    {
      name: "--registry <path>",
      description: "Component registry input path.",
      defaultValue: "docs/_generated/component-registry.json",
    },
    {
      name: "--out-md <path>",
      description: "Markdown index output path.",
      defaultValue: "docs/COMPONENTS_INDEX.md",
    },
    {
      name: "--out-json <path>",
      description: "JSON health projection output path.",
      defaultValue: "docs/_generated/components-health.json",
    },
    {
      name: "--format <json|text>",
      description: "Stdout format.",
      defaultValue: "json",
    },
    {
      name: "--max-filter-items <number>",
      description: "Max items listed per quick filter block.",
      defaultValue: "20",
    },
    {
      name: "--no-md <true|false>",
      description: "Skip markdown output file generation.",
      defaultValue: "false",
    },
    {
      name: "--no-json <true|false>",
      description: "Skip JSON output file generation.",
      defaultValue: "false",
    },
    {
      name: "--dry-run <true|false>",
      description: "Compute and report without writing output files.",
      defaultValue: "false",
    },
    {
      name: "--help",
      description: "Show this help message.",
    },
  ],
};

function parseBooleanOption(rawValue, optionName, fallback = false) {
  const normalized = String(rawValue ?? fallback).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`Invalid ${optionName} value: ${rawValue}. Allowed: true, false.`);
}

function parseIntegerOption(rawValue, optionName, fallback, minValue) {
  const parsed = Number(rawValue ?? fallback);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${optionName} value: ${rawValue}. Expected a number.`);
  }
  return Math.max(minValue, Math.floor(parsed));
}

function assertPathInsideProject(rawPath, label) {
  const resolved = path.resolve(rawPath);
  const rootWithSep = PROJECT_ROOT.endsWith(path.sep)
    ? PROJECT_ROOT
    : `${PROJECT_ROOT}${path.sep}`;
  if (resolved !== PROJECT_ROOT && !resolved.startsWith(rootWithSep)) {
    throw new Error(`${label} must be inside the project root: ${resolved}`);
  }
  return resolved;
}

function writeTextIfChanged(filePath, content, dryRun) {
  const resolved = path.resolve(filePath);
  const current = fs.existsSync(resolved) ? fs.readFileSync(resolved, "utf8") : null;
  const changed = current !== content;

  if (changed && !dryRun) {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, "utf8");
  }

  return {
    changed,
    written: changed && !dryRun,
  };
}

function toYesNo(value) {
  return value ? "yes" : "no";
}

function hasVisualProof(component) {
  return Boolean(component.visual_proof?.exists && component.visual_proof?.screenshot_url);
}

function computeCoverage(component) {
  const score =
    (component.spec?.exists ? 25 : 0) +
    (component.doc?.exists ? 25 : 0) +
    (component.render?.exists ? 25 : 0) +
    (hasVisualProof(component) ? 25 : 0);
  return score;
}

function deriveStatus(component) {
  if (component.ready_for_publish) return "ready";
  if (String(component.doc?.status || "") === "needs-review") return "needs-review";
  if (!component.spec?.exists && !component.doc?.exists) return "missing";
  return "draft";
}

function projectComponent(component) {
  const visualProof = hasVisualProof(component);
  const coverage = computeCoverage(component);
  const status = deriveStatus(component);

  return {
    slug: String(component.slug || ""),
    display_name: String(component.display_name || ""),
    pipeline_stage: String(component.pipeline_stage || "missing-spec"),
    status,
    coverage,
    ready_for_publish: Boolean(component.ready_for_publish),
    spec_exists: Boolean(component.spec?.exists),
    doc_exists: Boolean(component.doc?.exists),
    render_exists: Boolean(component.render?.exists),
    visual_proof_exists: visualProof,
    doc_status: String(component.doc?.status || "missing"),
    spec_status: String(component.spec?.status || "missing"),
    paths: {
      spec: String(component.paths?.spec || ""),
      doc: String(component.paths?.doc || ""),
      render_payload: String(component.paths?.render_payload || ""),
      visual_proof: String(component.paths?.visual_proof || ""),
    },
  };
}

function sortProjectedComponents(components) {
  return components.slice().sort((a, b) => {
    const nameA = normalizeSortKey(a.display_name);
    const nameB = normalizeSortKey(b.display_name);
    const byName = nameA.localeCompare(nameB, "en", { sensitivity: "base" });
    if (byName !== 0) return byName;
    return a.slug.localeCompare(b.slug, "en", { sensitivity: "base" });
  });
}

function buildSummary(rows) {
  const totalCoverage = rows.reduce((acc, row) => acc + row.coverage, 0);
  const averageCoveragePercent = rows.length === 0
    ? 0
    : Number((totalCoverage / rows.length).toFixed(1));

  return {
    total_components: rows.length,
    ready: rows.filter((row) => row.status === "ready").length,
    needs_review: rows.filter((row) => row.status === "needs-review").length,
    draft: rows.filter((row) => row.status === "draft").length,
    missing: rows.filter((row) => row.status === "missing").length,
    with_visual_proof: rows.filter((row) => row.visual_proof_exists).length,
    average_coverage_percent: averageCoveragePercent,
    by_pipeline_stage: rows.reduce((acc, row) => {
      acc[row.pipeline_stage] = (acc[row.pipeline_stage] || 0) + 1;
      return acc;
    }, {}),
  };
}

function formatFilterList(values, maxItems) {
  const list = values.slice(0, maxItems);
  return {
    items: list,
    total: values.length,
    truncated: values.length > list.length,
  };
}

function buildFilters(rows, maxFilterItems) {
  const byName = (a, b) =>
    normalizeSortKey(a).localeCompare(normalizeSortKey(b), "en", { sensitivity: "base" });

  const needsReview = rows
    .filter((row) => row.status === "needs-review")
    .map((row) => row.display_name)
    .sort(byName);

  const missingVisualProof = rows
    .filter((row) => !row.visual_proof_exists)
    .map((row) => row.display_name)
    .sort(byName);

  const blockedInPipeline = rows
    .filter((row) => !row.ready_for_publish && row.pipeline_stage !== "visual-proof")
    .map((row) => ({
      component: row.display_name,
      stage: row.pipeline_stage,
    }))
    .sort((a, b) => {
      const byComponent = byName(a.component, b.component);
      if (byComponent !== 0) return byComponent;
      return a.stage.localeCompare(b.stage, "en", { sensitivity: "base" });
    });

  return {
    needs_review: formatFilterList(needsReview, maxFilterItems),
    missing_visual_proof: formatFilterList(missingVisualProof, maxFilterItems),
    blocked_in_pipeline: {
      items: blockedInPipeline.slice(0, maxFilterItems),
      total: blockedInPipeline.length,
      truncated: blockedInPipeline.length > maxFilterItems,
    },
  };
}

function toProjectRelative(filePath) {
  return path.relative(PROJECT_ROOT, path.resolve(filePath)).split(path.sep).join("/");
}

function toRelativeLink(fromFilePath, targetProjectPath) {
  const absoluteTarget = path.resolve(PROJECT_ROOT, targetProjectPath);
  let relative = path.relative(path.dirname(fromFilePath), absoluteTarget).split(path.sep).join("/");
  if (!relative.startsWith(".") && !relative.startsWith("/")) {
    relative = `./${relative}`;
  }
  return relative;
}

function filterSectionMarkdown(title, filterBlock) {
  const lines = [`- **${title}**:`];
  if (filterBlock.total === 0) {
    lines.push("  none");
    return lines;
  }

  if (Array.isArray(filterBlock.items) && filterBlock.items.length > 0) {
    if (typeof filterBlock.items[0] === "string") {
      lines.push(`  ${filterBlock.items.join(", ")}`);
    } else {
      lines.push(
        `  ${filterBlock.items.map((entry) => `${entry.component} (${entry.stage})`).join(", ")}`,
      );
    }
  }
  if (filterBlock.truncated) {
    lines.push(`  showing ${filterBlock.items.length} of ${filterBlock.total}`);
  }
  return lines;
}

function buildMarkdownIndex({ report, markdownPath, registryPath }) {
  const lines = [
    "---",
    "doc_type: workflow",
    "doc_status: ready",
    "---",
    "",
    "# Design System Components Index",
    "",
    `Source registry: \`${toProjectRelative(registryPath)}\``,
    `Registry fingerprint: \`${report.source.registry_fingerprint_sha256}\``,
    "",
    "This file is generated from the component registry projection and should not be edited manually.",
    "",
    "## Summary",
    "",
    `- Total components: ${report.summary.total_components}`,
    `- Ready: ${report.summary.ready}`,
    `- Needs review: ${report.summary.needs_review}`,
    `- Draft: ${report.summary.draft}`,
    `- Missing: ${report.summary.missing}`,
    `- With visual proof: ${report.summary.with_visual_proof}`,
    `- Average coverage: ${report.summary.average_coverage_percent}%`,
    "",
    "## Components",
    "",
    "| Component | Stage | Status | Spec | Docs | Render | Visual Proof | Coverage |",
    "|---|---|---|---|---|---|---|---|",
  ];

  for (const row of report.components) {
    const componentLabel = row.doc_exists
      ? `[${row.display_name}](${toRelativeLink(markdownPath, row.paths.doc)})`
      : row.display_name;
    lines.push(
      `| ${componentLabel} | ${row.pipeline_stage} | ${row.status} | ${toYesNo(row.spec_exists)} | ${toYesNo(row.doc_exists)} | ${toYesNo(row.render_exists)} | ${toYesNo(row.visual_proof_exists)} | ${row.coverage}% |`,
    );
  }

  lines.push(
    "",
    "## Quick filters",
    "",
    ...filterSectionMarkdown("Needs review", report.filters.needs_review),
    ...filterSectionMarkdown("Missing visual proof", report.filters.missing_visual_proof),
    ...filterSectionMarkdown("Blocked in pipeline", report.filters.blocked_in_pipeline),
    "",
  );

  return `${lines.join("\n")}\n`;
}

function buildJsonProjection({ projected, summary, filters, registryPath, registry }) {
  const core = {
    schema_version: REPORT_SCHEMA_VERSION,
    source: {
      registry_path: toProjectRelative(registryPath),
      registry_fingerprint_sha256: String(registry.fingerprint_sha256 || ""),
    },
    summary,
    filters,
    components: projected,
  };

  return {
    ...core,
    fingerprint_sha256: stableHash(core),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (String(args.help || "false") === "true") {
    printUsage(USAGE, { exitCode: 0 });
  }

  const format = String(args.format || "json").trim().toLowerCase();
  if (!["json", "text"].includes(format)) {
    process.stderr.write(`Invalid --format value: ${format}. Allowed: json, text\n`);
    process.exit(1);
  }

  try {
    const dryRun = parseBooleanOption(args["dry-run"], "--dry-run", false);
    const noMd = parseBooleanOption(args["no-md"], "--no-md", false);
    const noJson = parseBooleanOption(args["no-json"], "--no-json", false);
    const maxFilterItems = parseIntegerOption(args["max-filter-items"], "--max-filter-items", 20, 1);

    if (noMd && noJson) {
      throw new Error("At least one output must be enabled. Use --no-md false or --no-json false.");
    }

    const registryPath = assertPathInsideProject(
      args.registry || DEFAULT_COMPONENT_REGISTRY_PATH,
      "--registry",
    );
    const markdownPath = assertPathInsideProject(args["out-md"] || DEFAULT_OUT_MD_PATH, "--out-md");
    const jsonPath = assertPathInsideProject(args["out-json"] || DEFAULT_OUT_JSON_PATH, "--out-json");

    const { registry } = readComponentRegistry(registryPath);
    const projected = sortProjectedComponents(
      (registry.components || []).map((component) => projectComponent(component)),
    );
    const summary = buildSummary(projected);
    const filters = buildFilters(projected, maxFilterItems);
    const projection = buildJsonProjection({
      projected,
      summary,
      filters,
      registryPath,
      registry,
    });
    const markdown = buildMarkdownIndex({
      report: projection,
      markdownPath,
      registryPath,
    });

    const writes = {
      markdown: { changed: false, written: false, skipped: noMd },
      json: { changed: false, written: false, skipped: noJson },
    };

    if (!noMd) {
      writes.markdown = writeTextIfChanged(markdownPath, markdown, dryRun);
    }
    if (!noJson) {
      writes.json = writeTextIfChanged(jsonPath, `${JSON.stringify(projection, null, 2)}\n`, dryRun);
    }

    const report = {
      ok: true,
      dry_run: dryRun,
      source_registry: toProjectRelative(registryPath),
      outputs: {
        markdown: noMd ? null : toProjectRelative(markdownPath),
        json: noJson ? null : toProjectRelative(jsonPath),
      },
      writes,
      summary: projection.summary,
      filters: projection.filters,
      fingerprint_sha256: projection.fingerprint_sha256,
      hint: "Projection is read-only and derived exclusively from component-registry.json.",
    };

    if (format === "text") {
      process.stdout.write(markdown);
    } else {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
