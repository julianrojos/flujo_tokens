#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import yaml from "js-yaml";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import { resolveSystemContextSafe } from "./lib/system-context.mjs";
import { isTbdMarker } from "./lib/tbd.mjs";

const CSS_VAR_REF_RE = /var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]+)?\)/gi;
const CSS_CUSTOM_PROP_DECL_RE = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
const A11Y_MODE_DOT_RE = /^A11y\.A11y\.mode[A-Za-z0-9_-]+\./;
const A11Y_MODE_SLASH_RE = /^A11y\/A11y\/mode[A-Za-z0-9_-]+\//;

const USAGE = {
  command: "npm run ds:token-usage-index",
  description:
    "Generate a deterministic usage index for token-registry entries from component specs and CSS alias chains.",
  options: [
    {
      name: "--registry <path>",
      description: "Token registry JSON path.",
      defaultValue: "docs/_generated/token-registry.json",
    },
    {
      name: "--spec-root <path>",
      description: "Directory containing component spec YAML files.",
      defaultValue: "docs/_spec/components",
    },
    {
      name: "--css-files <csv>",
      description:
        "Comma-separated CSS files to scan for var(--token) references.",
      defaultValue: "output/primitives.css,output/tokens.css",
    },
    {
      name: "--out <path>",
      description: "Output JSON file path.",
      defaultValue: "docs/_generated/token-usage-index.json",
    },
    {
      name: "--format <json|text>",
      description: "Stdout output format.",
      defaultValue: "json",
    },
    {
      name: "--strict-unresolved <true|false>",
      description: "Exit non-zero when unresolved token references are found.",
      defaultValue: "false",
    },
    {
      name: "--dry-run <true|false>",
      description: "Compute and print report without writing files.",
      defaultValue: "false",
    },
    {
      name: "--system <id>",
      description: "Target design system context.",
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

function resolveBoundPath(rawPath, label) {
  const resolved = path.resolve(String(rawPath || "").trim());
  const rootWithSep = PROJECT_ROOT.endsWith(path.sep)
    ? PROJECT_ROOT
    : `${PROJECT_ROOT}${path.sep}`;
  const isInsideProject =
    resolved === PROJECT_ROOT || resolved.startsWith(rootWithSep);

  if (!isInsideProject) {
    throw new Error(
      `${label} must be inside project root (${PROJECT_ROOT}). Received: ${resolved}`,
    );
  }

  return resolved;
}

function toProjectRelative(filePath) {
  const relative = path.relative(PROJECT_ROOT, path.resolve(filePath));
  if (!relative || relative.startsWith("..")) {
    return path.resolve(filePath);
  }
  return relative.split(path.sep).join("/");
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(payload) {
  return crypto.createHash("sha256").update(stableSerialize(payload)).digest("hex");
}

function readTextFile(filePath, label) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`${label} not found: ${absolutePath}`);
  }
  try {
    return fs.readFileSync(absolutePath, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read ${label} (${absolutePath}): ${reason}`);
  }
}

function writeTextFileIfChanged(filePath, content, { dryRun = false } = {}) {
  const resolved = path.resolve(filePath);
  const current = fs.existsSync(resolved) ? fs.readFileSync(resolved, "utf8") : null;
  const changed = current !== content;
  let written = false;

  if (changed && !dryRun) {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const tempPath = `${resolved}.${process.pid}.${Date.now()}.tmp`;
    let tempCreated = false;
    try {
      fs.writeFileSync(tempPath, content, "utf8");
      tempCreated = true;
      fs.renameSync(tempPath, resolved);
      written = true;
    } finally {
      if (tempCreated && fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  }

  return {
    path: resolved,
    changed,
    written,
  };
}

function parseRegistryEntries(rawJson, sourceLabel) {
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${sourceLabel}: ${reason}`);
  }

  let entries = [];
  if (Array.isArray(parsed)) {
    entries = parsed;
  } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.entries)) {
    entries = parsed.entries;
  } else if (parsed && typeof parsed === "object" && parsed.byPath && typeof parsed.byPath === "object") {
    entries = Object.values(parsed.byPath);
  } else if (parsed && typeof parsed === "object") {
    entries = Object.values(parsed);
  }

  const deduped = [];
  const seen = new Set();

  for (const rawEntry of entries) {
    if (!rawEntry || typeof rawEntry !== "object") continue;

    const entry = {
      path: String(rawEntry.path || "").trim(),
      slashPath: String(rawEntry.slashPath || "").trim(),
      cssVar: String(rawEntry.cssVar || "").trim(),
      type: String(rawEntry.type || "").trim().toLowerCase(),
      collection: String(rawEntry.collection || "").trim(),
      resolvedValue: String(rawEntry.resolvedValue || "").trim(),
    };
    if (!entry.path && !entry.slashPath && !entry.cssVar) continue;

    const marker = `${entry.path}|${entry.slashPath}|${entry.cssVar}`;
    if (seen.has(marker)) continue;
    seen.add(marker);
    deduped.push(entry);
  }

  deduped.sort((a, b) => {
    const keyA = `${a.path}|${a.slashPath}|${a.cssVar}`;
    const keyB = `${b.path}|${b.slashPath}|${b.cssVar}`;
    return keyA.localeCompare(keyB, "en", { sensitivity: "base" });
  });

  return deduped;
}

function buildRegistryIndexes(entries) {
  const byPath = new Map();
  const bySlashPath = new Map();
  const byCssVar = new Map();
  const byPathLower = new Map();
  const bySlashPathLower = new Map();
  const byCssVarLower = new Map();
  const collectionPrefixesLower = new Set();

  for (const entry of entries) {
    if (entry.path && !byPath.has(entry.path)) {
      byPath.set(entry.path, entry);
      byPathLower.set(entry.path.toLowerCase(), entry.path);
    }
    if (entry.slashPath && !bySlashPath.has(entry.slashPath)) {
      bySlashPath.set(entry.slashPath, entry);
      bySlashPathLower.set(entry.slashPath.toLowerCase(), entry.slashPath);
    }
    if (entry.cssVar && !byCssVar.has(entry.cssVar)) {
      byCssVar.set(entry.cssVar, entry);
      byCssVarLower.set(entry.cssVar.toLowerCase(), entry.cssVar);
    }
    if (entry.path.includes(".")) {
      collectionPrefixesLower.add(String(entry.path.split(".")[0] || "").toLowerCase());
    }
    if (entry.slashPath.includes("/")) {
      collectionPrefixesLower.add(String(entry.slashPath.split("/")[0] || "").toLowerCase());
    }
    if (entry.collection) {
      collectionPrefixesLower.add(entry.collection.toLowerCase());
    }
  }

  return {
    byPath,
    bySlashPath,
    byCssVar,
    byPathLower,
    bySlashPathLower,
    byCssVarLower,
    collectionPrefixesLower,
  };
}

function normalizeA11yModePath(tokenPath) {
  if (A11Y_MODE_DOT_RE.test(tokenPath)) {
    return tokenPath.replace(A11Y_MODE_DOT_RE, "A11y.A11y.");
  }
  if (A11Y_MODE_SLASH_RE.test(tokenPath)) {
    return tokenPath.replace(A11Y_MODE_SLASH_RE, "A11y/A11y/");
  }
  return tokenPath;
}

function normalizeSlashPathCandidate(tokenPath, collectionPrefixesLower) {
  const parts = String(tokenPath || "").split("/");
  const first = String(parts[0] || "").toLowerCase();
  if (parts.length > 1 && collectionPrefixesLower.has(first)) {
    return parts.slice(1).join("/");
  }
  return tokenPath;
}

function resolveTokenReference(rawTokenPath, indexes) {
  const candidate = String(rawTokenPath || "").trim();
  if (!candidate) {
    return {
      ok: false,
      reason: "empty token reference",
    };
  }

  const variants = new Set();
  variants.add(candidate);
  variants.add(normalizeA11yModePath(candidate));
  variants.add(
    normalizeSlashPathCandidate(candidate, indexes.collectionPrefixesLower),
  );
  variants.add(
    normalizeSlashPathCandidate(
      normalizeA11yModePath(candidate),
      indexes.collectionPrefixesLower,
    ),
  );

  for (const variant of variants) {
    if (!variant) continue;
    const byPath = indexes.byPath.get(variant);
    if (byPath) return { ok: true, entry: byPath, resolvedAs: variant };
    const bySlashPath = indexes.bySlashPath.get(variant);
    if (bySlashPath) return { ok: true, entry: bySlashPath, resolvedAs: variant };
  }

  for (const variant of variants) {
    if (!variant) continue;
    const pathHit = indexes.byPathLower.get(variant.toLowerCase());
    if (pathHit) {
      return {
        ok: false,
        reason: "case mismatch",
        suggested: pathHit,
      };
    }
    const slashHit = indexes.bySlashPathLower.get(variant.toLowerCase());
    if (slashHit) {
      return {
        ok: false,
        reason: "case mismatch",
        suggested: slashHit,
      };
    }
  }

  return {
    ok: false,
    reason: "not found in token registry",
  };
}

function collectSpecFiles(specRoot) {
  if (!fs.existsSync(specRoot)) return [];
  return fs
    .readdirSync(specRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".yml") &&
        entry.name !== "_template.yml",
    )
    .map((entry) => path.join(specRoot, entry.name))
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function collectTokenMappingRefs(value, pathSegments, acc) {
  if (typeof value === "string") {
    const tokenValue = value.trim();
    if (tokenValue) {
      acc.push({
        tokenPath: tokenValue,
        keyPath: pathSegments.join("."),
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      collectTokenMappingRefs(value[index], [...pathSegments, String(index)], acc);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    collectTokenMappingRefs(value[key], [...pathSegments, key], acc);
  }
}

function buildLineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function lineFromOffset(lineStarts, offset) {
  let left = 0;
  let right = lineStarts.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const start = lineStarts[mid];
    const nextStart =
      mid + 1 < lineStarts.length ? lineStarts[mid + 1] : Number.MAX_SAFE_INTEGER;
    if (offset >= start && offset < nextStart) return mid + 1;
    if (offset < start) right = mid - 1;
    else left = mid + 1;
  }
  return 1;
}

function parseCssDeclarations(rawCss) {
  const declarations = [];
  const text = String(rawCss || "");
  const lineStarts = buildLineStarts(text);

  CSS_CUSTOM_PROP_DECL_RE.lastIndex = 0;
  let match;
  while ((match = CSS_CUSTOM_PROP_DECL_RE.exec(text)) !== null) {
    const ownerCssVar = String(match[1] || "").trim();
    const rawValue = String(match[2] || "").trim();
    if (!ownerCssVar || !rawValue) continue;

    const references = [];
    CSS_VAR_REF_RE.lastIndex = 0;
    let refMatch;
    while ((refMatch = CSS_VAR_REF_RE.exec(rawValue)) !== null) {
      const cssVar = String(refMatch[1] || "").trim();
      if (!cssVar) continue;
      references.push(cssVar);
    }

    declarations.push({
      ownerCssVar,
      references,
      line: lineFromOffset(lineStarts, match.index),
    });
  }

  return declarations;
}

function createUsageAccumulator(entries) {
  const map = new Map();

  for (const entry of entries) {
    const identity = `${entry.path}|${entry.slashPath}|${entry.cssVar}`;
    map.set(identity, new Map());
  }

  return {
    map,
    add(entry, usage) {
      const identity = `${entry.path}|${entry.slashPath}|${entry.cssVar}`;
      if (!map.has(identity)) map.set(identity, new Map());
      const usageMap = map.get(identity);
      const key = stableSerialize({
        kind: usage.kind,
        source: usage.source,
        owner: usage.owner,
        detail: usage.detail,
      });
      if (!usageMap.has(key)) usageMap.set(key, usage);
    },
  };
}

function parseSpecYaml(filePath) {
  const raw = readTextFile(filePath, "component spec");
  let parsed;
  try {
    parsed = yaml.load(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid YAML in ${filePath}: ${reason}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return parsed;
}

function sortUsageItems(items) {
  return items.sort((a, b) => {
    const left = `${a.kind}|${a.source}|${a.owner}|${a.detail}`;
    const right = `${b.kind}|${b.source}|${b.owner}|${b.detail}`;
    return left.localeCompare(right, "en", { sensitivity: "base" });
  });
}

function summarizeByKind(items) {
  const counts = {};
  for (const item of items) {
    counts[item.kind] = (counts[item.kind] || 0) + 1;
  }
  return counts;
}

function buildTextReport(report) {
  const lines = [
    "# Token Usage Index",
    "",
    `- Tokens: ${report.summary.tokens_total}`,
    `- Tokens with usage: ${report.summary.tokens_with_usage}`,
    `- Tokens without usage: ${report.summary.tokens_without_usage}`,
    `- Usage links: ${report.summary.usage_links_total}`,
    `- Spec refs: ${report.summary.usage_links_by_kind["component-spec"] || 0}`,
    `- CSS alias refs: ${report.summary.usage_links_by_kind["css-alias"] || 0}`,
    `- Unresolved refs: ${report.summary.unresolved_total}`,
    "",
  ];

  if (report.unresolved.length > 0) {
    lines.push("## Unresolved references", "");
    for (const unresolved of report.unresolved.slice(0, 50)) {
      const suggestion = unresolved.suggested
        ? ` (suggested: ${unresolved.suggested})`
        : "";
      lines.push(
        `- ${unresolved.source} :: ${unresolved.keyPath} -> ${unresolved.tokenPath} [${unresolved.reason}]${suggestion}`,
      );
    }
    if (report.unresolved.length > 50) {
      lines.push(`- ... ${report.unresolved.length - 50} more`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
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

  const strictUnresolved = parseBooleanOption(
    args["strict-unresolved"],
    "--strict-unresolved",
    false,
  );
  const dryRun = parseBooleanOption(args["dry-run"], "--dry-run", false);
  const ctx = resolveSystemContextSafe({ system: args.system });

  const registryPath = resolveBoundPath(
    args.registry || ctx.paths.tokenRegistry,
    "--registry",
  );
  const specRoot = resolveBoundPath(args["spec-root"] || ctx.paths.specs, "--spec-root");
  const outPath = resolveBoundPath(args.out || path.join(ctx.paths.generated, "token-usage-index.json"), "--out");
  const defaultCssFiles = [
    resolveBoundPath(path.join(ctx.paths.output, "primitives.css"), "default css"),
    resolveBoundPath(path.join(ctx.paths.output, "tokens.css"), "default css"),
  ];

  const cssFiles = String(args["css-files"] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => resolveBoundPath(value, "--css-files"));
  const cssFilesToScan = cssFiles.length > 0 ? cssFiles : defaultCssFiles;

  try {
    const registryRaw = readTextFile(registryPath, "token registry");
    const registryEntries = parseRegistryEntries(registryRaw, registryPath);
    const registryIndexes = buildRegistryIndexes(registryEntries);
    const usageAccumulator = createUsageAccumulator(registryEntries);
    const unresolved = [];
    const warnings = [];

    const specFiles = collectSpecFiles(specRoot);
    for (const specFile of specFiles) {
      const spec = parseSpecYaml(specFile);
      const specRelativePath = toProjectRelative(specFile);
      const componentSlug = path.basename(specFile, path.extname(specFile));
      const tokenMapping = spec?.token_mapping;
      if (!tokenMapping || typeof tokenMapping !== "object") continue;

      const refs = [];
      collectTokenMappingRefs(tokenMapping, ["token_mapping"], refs);

      for (const ref of refs) {
        if (isTbdMarker(ref.tokenPath)) continue;
        const resolution = resolveTokenReference(ref.tokenPath, registryIndexes);
        if (!resolution.ok || !resolution.entry) {
          unresolved.push({
            kind: "component-spec",
            source: specRelativePath,
            owner: componentSlug,
            keyPath: ref.keyPath,
            tokenPath: ref.tokenPath,
            reason: resolution.reason,
            suggested: resolution.suggested || null,
          });
          continue;
        }

        usageAccumulator.add(resolution.entry, {
          kind: "component-spec",
          source: specRelativePath,
          owner: componentSlug,
          detail: ref.keyPath,
        });
      }
    }

    for (const cssFile of cssFilesToScan) {
      if (!fs.existsSync(cssFile)) {
        warnings.push({
          kind: "missing-css-file",
          source: toProjectRelative(cssFile),
          message: "CSS source file not found. Skipped.",
        });
        continue;
      }

      const cssRaw = readTextFile(cssFile, "css usage source");
      const cssRelativePath = toProjectRelative(cssFile);
      const declarations = parseCssDeclarations(cssRaw);

      for (const declaration of declarations) {
        for (const referencedCssVar of declaration.references) {
          const tokenEntry =
            registryIndexes.byCssVar.get(referencedCssVar) ||
            registryIndexes.byCssVar.get(
              registryIndexes.byCssVarLower.get(referencedCssVar.toLowerCase()),
            );

          if (!tokenEntry) {
            unresolved.push({
              kind: "css-alias",
              source: cssRelativePath,
              owner: declaration.ownerCssVar,
              keyPath: `line:${declaration.line}`,
              tokenPath: referencedCssVar,
              reason: "css variable not found in token registry",
              suggested: null,
            });
            continue;
          }

          usageAccumulator.add(tokenEntry, {
            kind: "css-alias",
            source: cssRelativePath,
            owner: declaration.ownerCssVar,
            detail: `line:${declaration.line}`,
          });
        }
      }
    }

    const outputEntries = registryEntries.map((entry) => {
      const identity = `${entry.path}|${entry.slashPath}|${entry.cssVar}`;
      const usageItems = sortUsageItems(Array.from(usageAccumulator.map.get(identity).values()));
      return {
        path: entry.path,
        slashPath: entry.slashPath,
        cssVar: entry.cssVar,
        type: entry.type,
        collection: entry.collection,
        usageCount: usageItems.length,
        usageByKind: summarizeByKind(usageItems),
        usedIn: usageItems,
      };
    });

    outputEntries.sort((a, b) => {
      const keyA = `${a.path}|${a.slashPath}|${a.cssVar}`;
      const keyB = `${b.path}|${b.slashPath}|${b.cssVar}`;
      return keyA.localeCompare(keyB, "en", { sensitivity: "base" });
    });

    unresolved.sort((a, b) => {
      const left = `${a.kind}|${a.source}|${a.owner}|${a.keyPath}|${a.tokenPath}`;
      const right = `${b.kind}|${b.source}|${b.owner}|${b.keyPath}|${b.tokenPath}`;
      return left.localeCompare(right, "en", { sensitivity: "base" });
    });

    const usageLinksByKind = {};
    let usageLinksTotal = 0;
    let tokensWithUsage = 0;
    for (const entry of outputEntries) {
      if (entry.usageCount > 0) tokensWithUsage += 1;
      usageLinksTotal += entry.usageCount;
      for (const kind of Object.keys(entry.usageByKind)) {
        usageLinksByKind[kind] =
          (usageLinksByKind[kind] || 0) + entry.usageByKind[kind];
      }
    }

    const reportCore = {
      schema_version: "1",
      sources: {
        registry: toProjectRelative(registryPath),
        spec_root: toProjectRelative(specRoot),
        css_files: cssFilesToScan.map((filePath) => toProjectRelative(filePath)),
      },
      summary: {
        tokens_total: outputEntries.length,
        tokens_with_usage: tokensWithUsage,
        tokens_without_usage: outputEntries.length - tokensWithUsage,
        usage_links_total: usageLinksTotal,
        usage_links_by_kind: usageLinksByKind,
        unresolved_total: unresolved.length,
      },
      warnings,
      unresolved,
      entries: outputEntries,
    };

    const byPath = {};
    const bySlashPath = {};
    const byCssVar = {};
    for (const entry of outputEntries) {
      if (entry.path) byPath[entry.path] = entry;
      if (entry.slashPath) bySlashPath[entry.slashPath] = entry;
      if (entry.cssVar) byCssVar[entry.cssVar] = entry;
    }

    const report = {
      ok: true,
      ...reportCore,
      byPath,
      bySlashPath,
      byCssVar,
      fingerprint: fingerprint(reportCore),
    };

    const textSummary = buildTextReport(report);
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    const writeResult = writeTextFileIfChanged(outPath, serialized, { dryRun });

    if (format === "text") {
      process.stdout.write(textSummary);
    } else {
      process.stdout.write(
        `${JSON.stringify(
          {
            ok: true,
            out: toProjectRelative(writeResult.path),
            changed: writeResult.changed,
            written: writeResult.written,
            summary: report.summary,
            warnings: report.warnings,
            unresolved: report.unresolved.length,
            fingerprint: report.fingerprint,
          },
          null,
          2,
        )}\n`,
      );
    }

    if (strictUnresolved && unresolved.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
