#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import { resolveSystemContextSafe, PROJECT_ROOT } from "./lib/system-context.mjs";

const CSS_VAR_REF_RE = /var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]+)?\)/gi;
const SIMPLE_CSS_VAR_ALIAS_RE = /^var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]+)?\)\s*$/i;

const USAGE = {
  command: "npm run ds:token-health [-- --dry-run true]",
  description:
    "Build an operational health summary for token-registry entries (usage, coupling, broken aliases, broken refs, WCAG pairs).",
  options: [
    {
      name: "--registry <path>",
      description: "Token registry input path.",
      defaultValue: "docs/_generated/token-registry.json",
    },
    {
      name: "--usage-index <path>",
      description: "Token usage index input path.",
      defaultValue: "docs/_generated/token-usage-index.json",
    },
    {
      name: "--graph-viz <path>",
      description: "Token graph viz input path.",
      defaultValue: "docs/_generated/token-graph.viz.json",
    },
    {
      name: "--wcag-pairs <path>",
      description: "WCAG pairs config input path (JSON).",
      defaultValue: "tooling/config/wcag-pairs.json",
    },
    {
      name: "--out-json <path>",
      description: "Output JSON path.",
      defaultValue: "docs/_generated/token-health.json",
    },
    {
      name: "--format <json|text>",
      description: "Stdout format.",
      defaultValue: "json",
    },
    {
      name: "--max-items <number>",
      description: "Max items per list section.",
      defaultValue: "100",
    },
    {
      name: "--high-usage-threshold <number>",
      description: "Flag tokens with usageCount >= threshold as high coupling (usage).",
      defaultValue: "25",
    },
    {
      name: "--high-indegree-threshold <number>",
      description: "Flag tokens with inDegree >= threshold as high coupling (graph).",
      defaultValue: "15",
    },
    {
      name: "--dry-run <true|false>",
      description: "Compute and report without writing output file.",
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

function resolveSafePath(rawPath, label) {
  const resolved = path.resolve(String(rawPath || "").trim());
  const rootWithSep = PROJECT_ROOT.endsWith(path.sep)
    ? PROJECT_ROOT
    : `${PROJECT_ROOT}${path.sep}`;
  const isInsideProject = resolved === PROJECT_ROOT || resolved.startsWith(rootWithSep);
  if (!isInsideProject) {
    throw new Error(`${label} must be inside project root (${PROJECT_ROOT}). Received: ${resolved}`);
  }
  return resolved;
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
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`${label} not found: ${resolved}`);
  }
  try {
    return fs.readFileSync(resolved, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read ${label} (${resolved}): ${reason}`);
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

  return { path: resolved, changed, written };
}

function extractCssVarReferences(resolvedValue) {
  const refs = new Set();
  const source = String(resolvedValue || "");
  CSS_VAR_REF_RE.lastIndex = 0;
  let match;
  while ((match = CSS_VAR_REF_RE.exec(source)) !== null) {
    const cssVar = String(match[1] || "").trim();
    if (cssVar) refs.add(cssVar);
  }
  return Array.from(refs);
}

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${label}: ${reason}`);
  }
}

function limitSection(items, maxItems) {
  const list = items.slice(0, maxItems);
  return {
    items: list,
    total: items.length,
    truncated: items.length > list.length,
  };
}

function normalizeWcagPairsConfig(raw, label) {
  const parsed = parseJson(raw, label);
  const pairs = Array.isArray(parsed?.pairs) ? parsed.pairs : [];
  const normalizedPairs = [];
  for (const item of pairs) {
    if (!item || typeof item !== "object") continue;
    const foreground = String(item.foreground || "").trim();
    const background = String(item.background || "").trim();
    const level = String(item.level || "AA").trim().toUpperCase();
    const textSize = String(item.textSize || "normal").trim().toLowerCase();
    if (!foreground || !background) continue;
    normalizedPairs.push({
      foreground,
      background,
      level: level === "AAA" ? "AAA" : "AA",
      textSize: textSize === "large" ? "large" : "normal",
    });
  }
  normalizedPairs.sort((a, b) => {
    const byFg = a.foreground.localeCompare(b.foreground, "en", { sensitivity: "base" });
    if (byFg !== 0) return byFg;
    const byBg = a.background.localeCompare(b.background, "en", { sensitivity: "base" });
    if (byBg !== 0) return byBg;
    const byLevel = a.level.localeCompare(b.level);
    if (byLevel !== 0) return byLevel;
    return a.textSize.localeCompare(b.textSize);
  });
  return { pairs: normalizedPairs };
}

function parseHex6(raw) {
  const match = String(raw || "").trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return null;
  const body = match[1].toLowerCase();
  return {
    r: parseInt(body.slice(0, 2), 16),
    g: parseInt(body.slice(2, 4), 16),
    b: parseInt(body.slice(4, 6), 16),
  };
}

function toHex6(color) {
  const to = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${to(color.r)}${to(color.g)}${to(color.b)}`.toLowerCase();
}

function linearize(channel) {
  const normalized = channel / 255;
  if (normalized <= 0.04045) return normalized / 12.92;
  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb) {
  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
}

function contrastRatio(bgRgb, fgRgb) {
  const lumBg = relativeLuminance(bgRgb);
  const lumFg = relativeLuminance(fgRgb);
  const lighter = Math.max(lumBg, lumFg);
  const darker = Math.min(lumBg, lumFg);
  return (lighter + 0.05) / (darker + 0.05);
}

function requiredRatio({ level, textSize }) {
  if (level === "AAA") return textSize === "large" ? 4.5 : 7;
  return textSize === "large" ? 3 : 4.5;
}

function resolveTokenEntry(indexes, ref) {
  const key = String(ref || "").trim();
  if (!key) return null;
  return indexes.byPath.get(key) || indexes.bySlashPath.get(key) || indexes.byCssVar.get(key) || null;
}

function resolveToHex(indexes, entry) {
  if (!entry) return null;
  const visited = new Set();
  let current = entry;

  for (let i = 0; i < 24; i += 1) {
    const id = String(current.path || current.slashPath || current.cssVar || "");
    if (!id) break;
    if (visited.has(id)) return null;
    visited.add(id);

    const raw = String(current.resolvedValue || "").trim();
    const asHex = parseHex6(raw);
    if (asHex) return toHex6(asHex);

    const match = raw.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]+)?\)$/i);
    if (!match) return null;
    const cssVar = String(match[1] || "").trim();
    const next = indexes.byCssVar.get(cssVar) || null;
    if (!next) return null;
    current = next;
  }

  return null;
}

function buildRegistryIndexes(registry) {
  const entries = Array.isArray(registry?.entries) ? registry.entries : [];

  const byPath = new Map();
  const bySlashPath = new Map();
  const byCssVar = new Map();
  const cssVarOwners = new Map();

  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const entry = {
      path: String(raw.path || "").trim(),
      slashPath: String(raw.slashPath || "").trim(),
      cssVar: String(raw.cssVar || "").trim(),
      type: String(raw.type || "").trim(),
      collection: String(raw.collection || "").trim(),
      resolvedValue: String(raw.resolvedValue || "").trim(),
      aliasOf: raw.aliasOf ? String(raw.aliasOf || "").trim() : undefined,
    };
    if (entry.path && !byPath.has(entry.path)) byPath.set(entry.path, entry);
    if (entry.slashPath && !bySlashPath.has(entry.slashPath)) bySlashPath.set(entry.slashPath, entry);
    if (entry.cssVar) {
      if (!byCssVar.has(entry.cssVar)) byCssVar.set(entry.cssVar, entry);
      const owners = cssVarOwners.get(entry.cssVar) || [];
      owners.push(entry.path || entry.slashPath || entry.cssVar);
      cssVarOwners.set(entry.cssVar, owners);
    }
  }

  const ambiguousCssVars = new Set();
  for (const [cssVar, owners] of cssVarOwners.entries()) {
    const uniqueOwners = Array.from(new Set(owners));
    if (uniqueOwners.length > 1) ambiguousCssVars.add(cssVar);
  }

  return { byPath, bySlashPath, byCssVar, ambiguousCssVars, entries: Array.from(byPath.values()) };
}

function buildUsageByPath(usageIndex) {
  const byPath = new Map();
  const entries = Array.isArray(usageIndex?.entries) ? usageIndex.entries : [];
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const pathKey = String(raw.path || "").trim();
    if (!pathKey) continue;
    byPath.set(pathKey, {
      usageCount: Number(raw.usageCount || 0),
      usageByKind: raw.usageByKind && typeof raw.usageByKind === "object" ? raw.usageByKind : {},
      usedIn: Array.isArray(raw.usedIn) ? raw.usedIn : [],
    });
  }
  return byPath;
}

function buildBrokenCssVarRefs(indexes) {
  const rows = [];
  for (const entry of indexes.entries) {
    const refs = extractCssVarReferences(entry.resolvedValue);
    if (refs.length === 0) continue;
    for (const cssVar of refs) {
      if (indexes.ambiguousCssVars.has(cssVar)) {
        rows.push({
          from: entry.path,
          cssVar,
          reason: "ambiguous_css_var_reference",
        });
        continue;
      }
      if (!indexes.byCssVar.has(cssVar)) {
        rows.push({
          from: entry.path,
          cssVar,
          reason: "missing_css_var_reference",
        });
      }
    }
  }
  rows.sort((a, b) => {
    const byFrom = a.from.localeCompare(b.from, "en", { sensitivity: "base" });
    if (byFrom !== 0) return byFrom;
    return a.cssVar.localeCompare(b.cssVar, "en", { sensitivity: "base" });
  });
  return rows;
}

function buildBrokenAliases(indexes) {
  const rows = [];
  for (const entry of indexes.entries) {
    const raw = String(entry.resolvedValue || "").trim();
    const match = raw.match(SIMPLE_CSS_VAR_ALIAS_RE);
    if (!match) continue;
    const cssVar = String(match[1] || "").trim();
    if (!cssVar) continue;

    if (indexes.ambiguousCssVars.has(cssVar)) {
      rows.push({
        token: entry.path,
        aliasCssVar: cssVar,
        aliasTarget: null,
        reason: "ambiguous_css_var_reference",
      });
      continue;
    }

    const target = indexes.byCssVar.get(cssVar) || null;
    if (!target) {
      rows.push({
        token: entry.path,
        aliasCssVar: cssVar,
        aliasTarget: null,
        reason: "missing_css_var_reference",
      });
      continue;
    }
  }

  rows.sort((a, b) => {
    const byToken = a.token.localeCompare(b.token, "en", { sensitivity: "base" });
    if (byToken !== 0) return byToken;
    return a.aliasCssVar.localeCompare(b.aliasCssVar, "en", { sensitivity: "base" });
  });
  return rows;
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
    const ctx = resolveSystemContextSafe({ system: args.system });
    const genDir = ctx.paths.generated;
    const registryPath = resolveSafePath(args.registry || path.join(genDir, "token-registry.json"), "--registry");
    const usageIndexPath = resolveSafePath(args["usage-index"] || path.join(genDir, "token-usage-index.json"), "--usage-index");
    const graphVizPath = resolveSafePath(args["graph-viz"] || path.join(genDir, "token-graph.viz.json"), "--graph-viz");
    const wcagPairsPath = resolveSafePath(args["wcag-pairs"] || path.join(PROJECT_ROOT, "tooling", "config", "wcag-pairs.json"), "--wcag-pairs");
    const outJsonPath = resolveSafePath(args["out-json"] || path.join(genDir, "token-health.json"), "--out-json");

    const maxItems = parseIntegerOption(args["max-items"], "--max-items", 100, 1);
    const highUsageThreshold = parseIntegerOption(
      args["high-usage-threshold"],
      "--high-usage-threshold",
      25,
      1,
    );
    const highInDegreeThreshold = parseIntegerOption(
      args["high-indegree-threshold"],
      "--high-indegree-threshold",
      15,
      1,
    );
    const dryRun = parseBooleanOption(args["dry-run"], "--dry-run", false);

    const registry = parseJson(readTextFile(registryPath, "token registry"), `token registry (${registryPath})`);
    const usageIndex = parseJson(readTextFile(usageIndexPath, "token usage index"), `token usage index (${usageIndexPath})`);
    const graphViz = parseJson(readTextFile(graphVizPath, "token graph viz"), `token graph viz (${graphVizPath})`);

    const registryIndexes = buildRegistryIndexes(registry);
    const usageByPath = buildUsageByPath(usageIndex);

    const tokensTotal = registryIndexes.byPath.size;
    const unusedRows = [];
    const usedRows = [];
    for (const entry of registryIndexes.entries) {
      const usage = usageByPath.get(entry.path);
      const usageCount = usage ? Number(usage.usageCount || 0) : 0;
      const row = {
        path: entry.path,
        slashPath: entry.slashPath,
        cssVar: entry.cssVar,
        type: entry.type,
        collection: entry.collection,
        resolvedValue: entry.resolvedValue,
        usageCount,
      };
      if (usageCount === 0) unusedRows.push(row);
      else usedRows.push(row);
    }
    unusedRows.sort((a, b) => a.path.localeCompare(b.path, "en", { sensitivity: "base" }));

    const brokenAliasRows = buildBrokenAliases(registryIndexes);

    const brokenCssVarRefs = buildBrokenCssVarRefs(registryIndexes);

    const graphNodesByPath = new Map();
    const graphNodes = Array.isArray(graphViz?.nodes) ? graphViz.nodes : [];
    for (const node of graphNodes) {
      const pathKey = String(node.path || "").trim();
      if (pathKey) graphNodesByPath.set(pathKey, node);
    }

    const highCouplingRows = [];
    for (const entry of registryIndexes.entries) {
      const usage = usageByPath.get(entry.path);
      const usageCount = usage ? Number(usage.usageCount || 0) : 0;
      const node = graphNodesByPath.get(entry.path) || null;
      const inDegree = node ? Number(node.inDegree || 0) : 0;
      const outDegree = node ? Number(node.outDegree || 0) : 0;
      const isCycleMember = node ? Boolean(node.isCycleMember) : false;
      const isHighUsage = usageCount >= highUsageThreshold;
      const isHighInDegree = inDegree >= highInDegreeThreshold;
      if (!isHighUsage && !isHighInDegree && !isCycleMember) continue;

      const usedByComponents = new Set();
      for (const occ of usage?.usedIn || []) {
        if (String(occ.kind || "") !== "component-spec") continue;
        const owner = String(occ.owner || "").trim();
        if (owner) usedByComponents.add(owner);
      }

      highCouplingRows.push({
        path: entry.path,
        slashPath: entry.slashPath,
        cssVar: entry.cssVar,
        type: entry.type,
        collection: entry.collection,
        usageCount,
        inDegree,
        outDegree,
        isCycleMember,
        reasons: [
          ...(isHighUsage ? ["high_usage"] : []),
          ...(isHighInDegree ? ["high_indegree"] : []),
          ...(isCycleMember ? ["cycle_member"] : []),
        ],
        usedByComponents: Array.from(usedByComponents).sort((a, b) =>
          a.localeCompare(b, "en", { sensitivity: "base" }),
        ),
      });
    }

    highCouplingRows.sort((a, b) => {
      if (a.isCycleMember !== b.isCycleMember) return a.isCycleMember ? -1 : 1;
      if (a.usageCount !== b.usageCount) return b.usageCount - a.usageCount;
      if (a.inDegree !== b.inDegree) return b.inDegree - a.inDegree;
      return a.path.localeCompare(b.path, "en", { sensitivity: "base" });
    });

    let wcagPairs = { pairs: [] };
    let wcagPairsReadError = null;
    try {
      wcagPairs = normalizeWcagPairsConfig(readTextFile(wcagPairsPath, "wcag pairs config"), `wcag pairs config (${wcagPairsPath})`);
    } catch (error) {
      wcagPairsReadError = error instanceof Error ? error.message : String(error);
      wcagPairs = { pairs: [] };
    }

    const wcagFailures = [];
    let wcagResolvedPairs = 0;
    for (const pair of wcagPairs.pairs) {
      const fgEntry = resolveTokenEntry(registryIndexes, pair.foreground);
      const bgEntry = resolveTokenEntry(registryIndexes, pair.background);
      const fgHex = resolveToHex(registryIndexes, fgEntry);
      const bgHex = resolveToHex(registryIndexes, bgEntry);
      if (!fgHex || !bgHex) continue;
      wcagResolvedPairs += 1;

      const fgRgb = parseHex6(fgHex);
      const bgRgb = parseHex6(bgHex);
      if (!fgRgb || !bgRgb) continue;

      const ratio = contrastRatio(bgRgb, fgRgb);
      const required = requiredRatio(pair);
      if (ratio + 1e-6 >= required) continue;

      wcagFailures.push({
        foreground: pair.foreground,
        background: pair.background,
        level: pair.level,
        textSize: pair.textSize,
        contrastRatio: Number(ratio.toFixed(2)),
        requiredRatio: required,
        foregroundHex: fgHex,
        backgroundHex: bgHex,
      });
    }

    wcagFailures.sort((a, b) => {
      const byRatio = a.contrastRatio - b.contrastRatio;
      if (byRatio !== 0) return byRatio;
      const byFg = a.foreground.localeCompare(b.foreground, "en", { sensitivity: "base" });
      if (byFg !== 0) return byFg;
      return a.background.localeCompare(b.background, "en", { sensitivity: "base" });
    });

    const cycleNodesTotal = Number(graphViz?.summary?.cycle_nodes ?? graphViz?.summary?.cycle_nodes_total ?? 0) || 0;

    const reportCore = {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      source: {
        registry_path: path.relative(PROJECT_ROOT, registryPath).split(path.sep).join("/"),
        usage_index_path: path.relative(PROJECT_ROOT, usageIndexPath).split(path.sep).join("/"),
        graph_viz_path: path.relative(PROJECT_ROOT, graphVizPath).split(path.sep).join("/"),
        wcag_pairs_path: path.relative(PROJECT_ROOT, wcagPairsPath).split(path.sep).join("/"),
      },
      thresholds: {
        high_usage_threshold: highUsageThreshold,
        high_indegree_threshold: highInDegreeThreshold,
      },
      summary: {
        tokens_total: tokensTotal,
        tokens_with_usage: usedRows.length,
        unused_tokens_total: unusedRows.length,
        high_coupling_tokens_total: highCouplingRows.length,
        broken_aliases_total: brokenAliasRows.length,
        broken_css_var_refs_total: brokenCssVarRefs.length,
        cycle_nodes_total: cycleNodesTotal,
        wcag_pairs_configured_total: wcagPairs.pairs.length,
        wcag_pairs_resolved_total: wcagResolvedPairs,
        wcag_failures_total: wcagFailures.length,
      },
      warnings: wcagPairsReadError ? [{ id: "WCAG_PAIRS_CONFIG", message: wcagPairsReadError }] : [],
      unused_tokens: limitSection(unusedRows, maxItems),
      high_coupling_tokens: limitSection(highCouplingRows, maxItems),
      broken_aliases: limitSection(brokenAliasRows, maxItems),
      broken_css_var_refs: limitSection(brokenCssVarRefs, maxItems),
      wcag_failures: limitSection(wcagFailures, maxItems),
      upstream_fingerprints: {
        token_usage_index: String(usageIndex?.fingerprint ?? usageIndex?.fingerprint_sha256 ?? ""),
        token_graph_viz: String(graphViz?.fingerprint ?? ""),
      },
    };

    const report = {
      ok: true,
      ...reportCore,
      fingerprint_sha256: fingerprint(reportCore),
      hint:
        wcagPairs.pairs.length === 0
          ? "WCAG pairs not configured. Add pairs to tooling/config/wcag-pairs.json to enable contrast checks."
          : wcagFailures.length > 0
            ? "WCAG failures detected. Review failing pairs before publishing."
            : "No WCAG failures detected for configured pairs.",
    };

    const out = `${JSON.stringify(report, null, 2)}\n`;
    const writeResult = writeTextFileIfChanged(outJsonPath, out, { dryRun });

    const stdoutPayload =
      format === "json"
        ? {
            ...report,
            dry_run: dryRun,
            outputs: {
              token_health_json: outJsonPath,
            },
            write_result: writeResult,
          }
        : `Token health: ${report.summary.tokens_total} tokens, ${report.summary.unused_tokens_total} unused, ${report.summary.high_coupling_tokens_total} high coupling, ${report.summary.broken_aliases_total} broken aliases, ${report.summary.broken_css_var_refs_total} broken refs, ${report.summary.wcag_failures_total} WCAG failures\n`;

    process.stdout.write(
      format === "json" ? `${JSON.stringify(stdoutPayload, null, 2)}\n` : stdoutPayload,
    );

    if (dryRun) process.exit(0);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${reason}\n`);
    process.exit(1);
  }
}

main();
