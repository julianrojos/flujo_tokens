#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import { DOCS_ROOT, PROJECT_ROOT } from "./lib/paths.mjs";

const DEFAULT_REGISTRY_PATH = path.join(DOCS_ROOT, "_generated", "token-registry.json");
const DEFAULT_OUT_JSON_PATH = path.join(DOCS_ROOT, "_generated", "token-graph.json");
const DEFAULT_OUT_MD_PATH = path.join(DOCS_ROOT, "_generated", "token-graph.md");
const DEFAULT_OUT_MERMAID_PATH = path.join(DOCS_ROOT, "_generated", "token-graph.mmd");
const DEFAULT_MERMAID_MAX_EDGES = 2000;
const CSS_VAR_REF_RE = /var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]+)?\)/gi;

const USAGE = {
  command: "npm run ds:token-graph",
  description:
    "Build a deterministic token dependency graph from token-registry.json and report cycles, indirection chains, and unused primitive terminals.",
  options: [
    {
      name: "--registry <path>",
      description: "Token registry input path.",
      defaultValue: "docs/_generated/token-registry.json",
    },
    {
      name: "--out-json <path>",
      description: "JSON report output path.",
      defaultValue: "docs/_generated/token-graph.json",
    },
    {
      name: "--out-md <path>",
      description: "Markdown report output path.",
      defaultValue: "docs/_generated/token-graph.md",
    },
    {
      name: "--out-mermaid <path>",
      description: "Mermaid graph output path.",
      defaultValue: "docs/_generated/token-graph.mmd",
    },
    {
      name: "--format <json|text>",
      description: "Stdout format.",
      defaultValue: "json",
    },
    {
      name: "--indirection-threshold <number>",
      description: "Report tokens with dependency chains longer than this number.",
      defaultValue: "3",
    },
    {
      name: "--max-items <number>",
      description: "Max report rows for detailed sections.",
      defaultValue: "100",
    },
    {
      name: "--strict-cycles <true|false>",
      description: "Exit non-zero when cycles are detected.",
      defaultValue: "false",
    },
    {
      name: "--strict-high-indirection <true|false>",
      description: "Exit non-zero when high-indirection tokens are detected.",
      defaultValue: "false",
    },
    {
      name: "--strict-unresolved <true|false>",
      description: "Exit non-zero when unresolved css var references are detected.",
      defaultValue: "false",
    },
    {
      name: "--strict-collisions <true|false>",
      description: "Exit non-zero when token identity/cssVar collisions are detected.",
      defaultValue: "false",
    },
    {
      name: "--mermaid-max-edges <number>",
      description: "Max edges to include in mermaid output before truncation.",
      defaultValue: "2000",
    },
    {
      name: "--allow-outside-project <true|false>",
      description: "Allow input/output paths outside repository root (unsafe; defaults to false).",
      defaultValue: "false",
    },
    {
      name: "--no-mermaid <true|false>",
      description: "Skip mermaid output file generation.",
      defaultValue: "false",
    },
    {
      name: "--dry-run <true|false>",
      description: "Compute and print report without writing files.",
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

function limitItems(rows, maxItems) {
  return rows.slice(0, maxItems);
}

function resolveSafePath(rawPath, label, { allowOutsideProject = false } = {}) {
  const resolved = path.resolve(String(rawPath || "").trim());
  const rootWithSep = PROJECT_ROOT.endsWith(path.sep)
    ? PROJECT_ROOT
    : `${PROJECT_ROOT}${path.sep}`;
  const isInsideProject =
    resolved === PROJECT_ROOT || resolved.startsWith(rootWithSep);

  if (!allowOutsideProject && !isInsideProject) {
    throw new Error(
      `${label} must be inside project root (${PROJECT_ROOT}). Received: ${resolved}`,
    );
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

function writeTextFileIfChanged(filePath, content, { dryRun = false } = {}) {
  const resolved = path.resolve(filePath);
  const current = fs.existsSync(resolved) ? fs.readFileSync(resolved, "utf8") : null;
  const changed = current !== content;
  let written = false;

  if (changed && !dryRun) {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const tempPath = `${resolved}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, content, "utf8");
    fs.renameSync(tempPath, resolved);
    written = true;
  }

  return {
    path: resolved,
    changed,
    written,
  };
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

  const normalized = [];
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    normalized.push({
      path: String(raw.path || "").trim(),
      slashPath: String(raw.slashPath || "").trim(),
      cssVar: String(raw.cssVar || "").trim(),
      type: String(raw.type || "").trim().toLowerCase(),
      collection: String(raw.collection || "").trim(),
      resolvedValue: String(raw.resolvedValue || "").trim(),
    });
  }

  normalized.sort((a, b) => {
    const keyA = `${a.path}|${a.slashPath}|${a.cssVar}`;
    const keyB = `${b.path}|${b.slashPath}|${b.cssVar}`;
    return keyA.localeCompare(keyB, "en", { sensitivity: "base" });
  });

  return normalized;
}

function nodeIdFromEntry(entry) {
  if (entry.path) return `path:${entry.path}`;
  if (entry.slashPath) return `slash:${entry.slashPath}`;
  if (entry.cssVar) return `css:${entry.cssVar}`;
  return "";
}

function displayKeyFromNode(node) {
  return node.path || node.slashPath || node.cssVar || node.id;
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
  return Array.from(refs).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function buildGraph(entries) {
  const nodes = [];
  const nodeById = new Map();
  const cssVarToNodeId = new Map();
  const ambiguousCssVars = new Set();
  const collisions = [];

  for (const entry of entries) {
    const id = nodeIdFromEntry(entry);
    if (!id) continue;

    if (nodeById.has(id)) {
      const existing = nodeById.get(id);
      const incomingNode = {
        id,
        path: entry.path,
        slashPath: entry.slashPath,
        cssVar: entry.cssVar,
        type: entry.type,
        collection: entry.collection,
        resolvedValue: entry.resolvedValue,
        displayKey: entry.path || entry.slashPath || entry.cssVar,
      };

      if (stableSerialize(existing) === stableSerialize(incomingNode)) {
        continue;
      }
      collisions.push({
        id,
        reason: "duplicate_node_identity",
        first: existing.id,
        second: incomingNode.id,
      });
      continue;
    }

    const node = {
      id,
      path: entry.path,
      slashPath: entry.slashPath,
      cssVar: entry.cssVar,
      type: entry.type,
      collection: entry.collection,
      resolvedValue: entry.resolvedValue,
      displayKey: entry.path || entry.slashPath || entry.cssVar,
    };

    nodeById.set(id, node);
    nodes.push(node);

    if (node.cssVar) {
      if (ambiguousCssVars.has(node.cssVar)) {
        collisions.push({
          id: node.cssVar,
          reason: "duplicate_css_var_identity",
          first: null,
          second: node.id,
        });
      } else if (cssVarToNodeId.has(node.cssVar)) {
        const firstNodeId = cssVarToNodeId.get(node.cssVar);
        collisions.push({
          id: node.cssVar,
          reason: "duplicate_css_var_identity",
          first: firstNodeId,
          second: node.id,
        });
        cssVarToNodeId.delete(node.cssVar);
        ambiguousCssVars.add(node.cssVar);
      } else {
        cssVarToNodeId.set(node.cssVar, node.id);
      }
    }
  }

  nodes.sort((a, b) => displayKeyFromNode(a).localeCompare(displayKeyFromNode(b), "en", { sensitivity: "base" }));

  const adjacency = new Map();
  const inDegree = new Map();
  const unresolvedRefs = [];
  let edgeCount = 0;

  for (const node of nodes) {
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const node of nodes) {
    const refs = extractCssVarReferences(node.resolvedValue);
    const targetIds = [];

    for (const ref of refs) {
      if (ambiguousCssVars.has(ref)) {
        unresolvedRefs.push({
          from: node.id,
          fromKey: node.displayKey,
          cssVar: ref,
          reason: "ambiguous_css_var_reference",
        });
        continue;
      }
      const targetId = cssVarToNodeId.get(ref);
      if (!targetId) {
        unresolvedRefs.push({
          from: node.id,
          fromKey: node.displayKey,
          cssVar: ref,
          reason: "missing_css_var_reference",
        });
        continue;
      }
      targetIds.push(targetId);
    }

    const uniqueTargetIds = Array.from(new Set(targetIds)).sort((a, b) =>
      displayKeyFromNode(nodeById.get(a)).localeCompare(displayKeyFromNode(nodeById.get(b)), "en", {
        sensitivity: "base",
      }),
    );

    adjacency.set(node.id, uniqueTargetIds);
    edgeCount += uniqueTargetIds.length;

    for (const targetId of uniqueTargetIds) {
      inDegree.set(targetId, (inDegree.get(targetId) || 0) + 1);
    }
  }

  return {
    nodes,
    nodeById,
    adjacency,
    inDegree,
    unresolvedRefs,
    collisions,
    ambiguousCssVars: Array.from(ambiguousCssVars).sort((a, b) =>
      a.localeCompare(b, "en", { sensitivity: "base" }),
    ),
    edgeCount,
  };
}

function findStronglyConnectedComponents(graph) {
  const indexByNode = new Map();
  const lowLinkByNode = new Map();
  const onStack = new Set();
  const stack = [];
  let nextIndex = 0;
  const sccList = [];

  function strongConnect(nodeId) {
    indexByNode.set(nodeId, nextIndex);
    lowLinkByNode.set(nodeId, nextIndex);
    nextIndex += 1;
    stack.push(nodeId);
    onStack.add(nodeId);

    const neighbors = graph.adjacency.get(nodeId) || [];
    for (const neighborId of neighbors) {
      if (!indexByNode.has(neighborId)) {
        strongConnect(neighborId);
        lowLinkByNode.set(
          nodeId,
          Math.min(lowLinkByNode.get(nodeId), lowLinkByNode.get(neighborId)),
        );
      } else if (onStack.has(neighborId)) {
        lowLinkByNode.set(
          nodeId,
          Math.min(lowLinkByNode.get(nodeId), indexByNode.get(neighborId)),
        );
      }
    }

    if (lowLinkByNode.get(nodeId) === indexByNode.get(nodeId)) {
      const component = [];
      while (stack.length > 0) {
        const memberId = stack.pop();
        onStack.delete(memberId);
        component.push(memberId);
        if (memberId === nodeId) break;
      }
      component.sort((a, b) =>
        displayKeyFromNode(graph.nodeById.get(a)).localeCompare(
          displayKeyFromNode(graph.nodeById.get(b)),
          "en",
          { sensitivity: "base" },
        ),
      );
      sccList.push(component);
    }
  }

  for (const node of graph.nodes) {
    if (!indexByNode.has(node.id)) strongConnect(node.id);
  }

  return sccList;
}

function detectCycles(graph) {
  const sccList = findStronglyConnectedComponents(graph);
  const cycles = [];
  const cycleNodeIds = new Set();

  for (const component of sccList) {
    if (component.length > 1) {
      const nodes = component.map((nodeId) => graph.nodeById.get(nodeId));
      for (const nodeId of component) cycleNodeIds.add(nodeId);
      cycles.push({
        kind: "strongly_connected_component",
        size: component.length,
        nodes: nodes.map((node) => node.displayKey),
        node_ids: component,
      });
      continue;
    }

    const onlyNodeId = component[0];
    const neighbors = graph.adjacency.get(onlyNodeId) || [];
    if (neighbors.includes(onlyNodeId)) {
      const node = graph.nodeById.get(onlyNodeId);
      cycleNodeIds.add(onlyNodeId);
      cycles.push({
        kind: "self_loop",
        size: 1,
        nodes: [node.displayKey],
        node_ids: [onlyNodeId],
      });
    }
  }

  cycles.sort((a, b) => {
    if (a.size !== b.size) return b.size - a.size;
    return String(a.nodes[0] || "").localeCompare(String(b.nodes[0] || ""), "en", {
      sensitivity: "base",
    });
  });

  return {
    cycles,
    cycleNodeIds,
  };
}

function computeLongestChainData(graph, cycleNodeIds) {
  const memo = new Map();
  const visiting = new Set();

  function dfs(nodeId) {
    if (memo.has(nodeId)) return memo.get(nodeId);
    if (visiting.has(nodeId)) {
      const loopData = { depth: 0, hasCyclePath: true, path: [nodeId] };
      memo.set(nodeId, loopData);
      return loopData;
    }

    visiting.add(nodeId);

    if (cycleNodeIds.has(nodeId)) {
      const cycleData = { depth: 0, hasCyclePath: true, path: [nodeId] };
      memo.set(nodeId, cycleData);
      visiting.delete(nodeId);
      return cycleData;
    }

    const neighbors = graph.adjacency.get(nodeId) || [];
    if (neighbors.length === 0) {
      const terminalData = { depth: 0, hasCyclePath: false, path: [nodeId] };
      memo.set(nodeId, terminalData);
      visiting.delete(nodeId);
      return terminalData;
    }

    let bestDepth = 0;
    let bestPath = [nodeId];
    let hasCyclePath = false;

    for (const neighborId of neighbors) {
      const child = dfs(neighborId);
      hasCyclePath = hasCyclePath || child.hasCyclePath;
      const candidateDepth = 1 + child.depth;
      if (candidateDepth > bestDepth) {
        bestDepth = candidateDepth;
        bestPath = [nodeId, ...child.path];
      }
    }

    const result = { depth: bestDepth, hasCyclePath, path: bestPath };
    memo.set(nodeId, result);
    visiting.delete(nodeId);
    return result;
  }

  for (const node of graph.nodes) {
    if (!memo.has(node.id)) dfs(node.id);
  }

  return memo;
}

function isPrimitiveNode(node) {
  const collection = String(node.collection || "").trim().toLowerCase();
  if (collection === "primitives") return true;
  return String(node.path || "").toLowerCase().startsWith("primitives.");
}

function buildHighIndirectionReport(graph, chainDataByNodeId, threshold, maxItems) {
  const rows = [];
  for (const node of graph.nodes) {
    const chainData = chainDataByNodeId.get(node.id);
    if (!chainData) continue;
    if (chainData.hasCyclePath) continue;
    if (chainData.depth <= threshold) continue;

    rows.push({
      token: node.displayKey,
      node_id: node.id,
      chain_length: chainData.depth,
      path: chainData.path.map((nodeId) => graph.nodeById.get(nodeId).displayKey),
    });
  }

  rows.sort((a, b) => {
    if (a.chain_length !== b.chain_length) return b.chain_length - a.chain_length;
    return a.token.localeCompare(b.token, "en", { sensitivity: "base" });
  });

  return {
    total: rows.length,
    rows: limitItems(rows, maxItems),
  };
}

function buildTerminalReports(graph, maxItems) {
  const terminals = [];
  const unusedPrimitiveTerminals = [];

  for (const node of graph.nodes) {
    const outDegree = (graph.adjacency.get(node.id) || []).length;
    if (outDegree !== 0) continue;

    const inDegree = graph.inDegree.get(node.id) || 0;
    const terminalRow = {
      token: node.displayKey,
      node_id: node.id,
      in_degree: inDegree,
      collection: node.collection,
      type: node.type,
    };
    terminals.push(terminalRow);

    if (inDegree === 0 && isPrimitiveNode(node)) {
      unusedPrimitiveTerminals.push(terminalRow);
    }
  }

  terminals.sort((a, b) => a.token.localeCompare(b.token, "en", { sensitivity: "base" }));
  unusedPrimitiveTerminals.sort((a, b) =>
    a.token.localeCompare(b.token, "en", { sensitivity: "base" }),
  );

  return {
    terminals: limitItems(terminals, maxItems),
    terminals_total: terminals.length,
    unused_primitive_terminals: limitItems(unusedPrimitiveTerminals, maxItems),
    unused_primitive_terminals_total: unusedPrimitiveTerminals.length,
  };
}

function buildReasonCounts(rows, fieldName) {
  const counts = {};
  for (const row of rows) {
    const reason = String(row?.[fieldName] || "unknown");
    counts[reason] = (counts[reason] || 0) + 1;
  }

  return Object.fromEntries(
    Object.keys(counts)
      .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
      .map((key) => [key, counts[key]]),
  );
}

function buildMermaid(graph, maxEdges = DEFAULT_MERMAID_MAX_EDGES) {
  const nodeIds = graph.nodes.map((node) => node.id);
  const shortIdMap = new Map();
  for (let i = 0; i < nodeIds.length; i += 1) {
    shortIdMap.set(nodeIds[i], `N${i + 1}`);
  }

  const lines = ["graph TD"];

  for (const node of graph.nodes) {
    const shortId = shortIdMap.get(node.id);
    const labelRaw = node.displayKey || node.id;
    const label = labelRaw.replace(/"/g, "'");
    lines.push(`  ${shortId}[\"${label}\"]`);
  }

  let emittedEdges = 0;
  for (const node of graph.nodes) {
    const sourceId = shortIdMap.get(node.id);
    const targets = graph.adjacency.get(node.id) || [];
    for (const targetNodeId of targets) {
      if (emittedEdges >= maxEdges) break;
      const targetId = shortIdMap.get(targetNodeId);
      lines.push(`  ${sourceId} --> ${targetId}`);
      emittedEdges += 1;
    }
    if (emittedEdges >= maxEdges) break;
  }

  if (emittedEdges < graph.edgeCount) {
    lines.push(`  %% truncated edges: ${graph.edgeCount - emittedEdges}`);
  }

  return `${lines.join("\n")}\n`;
}

function buildMarkdownReport(report, maxItems) {
  const addTruncatedNote = (displayed, total) => {
    if (total > displayed) {
      return `- Showing ${displayed} of ${total} entries (increase \`--max-items\` to inspect more).`;
    }
    return null;
  };

  const lines = [
    "# Token Dependency Graph",
    "",
    `- Registry source: ${report.source.registry_path}`,
    `- Nodes: ${report.summary.nodes}`,
    `- Edges: ${report.summary.edges}`,
    `- Cycles: ${report.summary.cycles}`,
    `- High indirection (>${report.summary.indirection_threshold}): ${report.summary.high_indirection_total}`,
    `- Terminal tokens: ${report.summary.terminals_total}`,
    `- Unused primitive terminals: ${report.summary.unused_primitive_terminals_total}`,
    `- Unresolved CSS var refs: ${report.summary.unresolved_css_var_refs_total}`,
    `- Ambiguous CSS vars: ${report.summary.ambiguous_css_vars_total}`,
    "",
    "## Cycles",
    "",
  ];

  if (report.cycles.length === 0) {
    lines.push("- None", "");
  } else {
    for (const cycle of report.cycles.slice(0, maxItems)) {
      lines.push(`- [${cycle.kind}] size=${cycle.size}: ${cycle.nodes.map((node) => `\`${node}\``).join(" -> ")}`);
    }
    const cycleNote = addTruncatedNote(report.cycles.length, report.summary.cycles);
    if (cycleNote) lines.push(cycleNote);
    lines.push("");
  }

  lines.push("## High Indirection", "");
  if (report.high_indirection.length === 0) {
    lines.push("- None", "");
  } else {
    for (const row of report.high_indirection) {
      lines.push(`- \`${row.token}\` (length=${row.chain_length}): ${row.path.map((p) => `\`${p}\``).join(" -> ")}`);
    }
    const highIndirectionNote = addTruncatedNote(
      report.high_indirection.length,
      report.summary.high_indirection_total,
    );
    if (highIndirectionNote) lines.push(highIndirectionNote);
    lines.push("");
  }

  lines.push("## Terminal Tokens", "");
  if (report.terminals.length === 0) {
    lines.push("- None", "");
  } else {
    for (const row of report.terminals) {
      lines.push(`- \`${row.token}\` (in_degree=${row.in_degree}, type=${row.type || "unknown"})`);
    }
    const terminalsNote = addTruncatedNote(
      report.terminals.length,
      report.summary.terminals_total,
    );
    if (terminalsNote) lines.push(terminalsNote);
    lines.push("");
  }

  lines.push("## Unused Primitive Terminals", "");
  if (report.unused_primitive_terminals.length === 0) {
    lines.push("- None", "");
  } else {
    for (const row of report.unused_primitive_terminals) {
      lines.push(`- \`${row.token}\` (type=${row.type || "unknown"}, collection=${row.collection || "unknown"})`);
    }
    const unusedNote = addTruncatedNote(
      report.unused_primitive_terminals.length,
      report.summary.unused_primitive_terminals_total,
    );
    if (unusedNote) lines.push(unusedNote);
    lines.push("");
  }

  lines.push("## Unresolved CSS var References", "");
  if (report.unresolved_css_var_refs.length === 0) {
    lines.push("- None", "");
  } else {
    for (const ref of report.unresolved_css_var_refs) {
      lines.push(`- from \`${ref.fromKey}\` -> \`${ref.cssVar}\` (${ref.reason})`);
    }
    const unresolvedNote = addTruncatedNote(
      report.unresolved_css_var_refs.length,
      report.summary.unresolved_css_var_refs_total,
    );
    if (unresolvedNote) lines.push(unresolvedNote);
    lines.push("");
  }

  lines.push("## Ambiguous CSS vars", "");
  if (!Array.isArray(report.ambiguous_css_vars) || report.ambiguous_css_vars.length === 0) {
    lines.push("- None", "");
  } else {
    for (const cssVar of report.ambiguous_css_vars) {
      lines.push(`- \`${cssVar}\``);
    }
    const ambiguousNote = addTruncatedNote(
      report.ambiguous_css_vars.length,
      report.summary.ambiguous_css_vars_total,
    );
    if (ambiguousNote) lines.push(ambiguousNote);
    lines.push("");
  }

  lines.push("## Identity Collisions", "");
  if (!Array.isArray(report.collisions) || report.collisions.length === 0) {
    lines.push("- None", "");
  } else {
    for (const collision of report.collisions) {
      const first = collision.first ? `, first=${collision.first}` : "";
      const second = collision.second ? `, second=${collision.second}` : "";
      lines.push(`- \`${collision.id}\` (${collision.reason}${first}${second})`);
    }
    const collisionsNote = addTruncatedNote(report.collisions.length, report.summary.graph_collisions);
    if (collisionsNote) lines.push(collisionsNote);
    lines.push("");
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
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
    const allowOutsideProject = parseBooleanOption(
      args["allow-outside-project"],
      "--allow-outside-project",
      false,
    );
    const registryPath = resolveSafePath(args.registry || DEFAULT_REGISTRY_PATH, "--registry", {
      allowOutsideProject,
    });
    const outJsonPath = resolveSafePath(args["out-json"] || DEFAULT_OUT_JSON_PATH, "--out-json", {
      allowOutsideProject,
    });
    const outMdPath = resolveSafePath(args["out-md"] || DEFAULT_OUT_MD_PATH, "--out-md", {
      allowOutsideProject,
    });
    const outMermaidPath = resolveSafePath(
      args["out-mermaid"] || DEFAULT_OUT_MERMAID_PATH,
      "--out-mermaid",
      { allowOutsideProject },
    );
    const noMermaid = parseBooleanOption(args["no-mermaid"], "--no-mermaid", false);
    const dryRun = parseBooleanOption(args["dry-run"], "--dry-run", false);
    const strictCycles = parseBooleanOption(args["strict-cycles"], "--strict-cycles", false);
    const strictHighIndirection = parseBooleanOption(
      args["strict-high-indirection"],
      "--strict-high-indirection",
      false,
    );
    const strictUnresolved = parseBooleanOption(
      args["strict-unresolved"],
      "--strict-unresolved",
      false,
    );
    const strictCollisions = parseBooleanOption(
      args["strict-collisions"],
      "--strict-collisions",
      false,
    );
    const threshold = parseIntegerOption(args["indirection-threshold"], "--indirection-threshold", 3, 0);
    const maxItems = parseIntegerOption(args["max-items"], "--max-items", 100, 1);
    const mermaidMaxEdges = parseIntegerOption(
      args["mermaid-max-edges"],
      "--mermaid-max-edges",
      DEFAULT_MERMAID_MAX_EDGES,
      1,
    );

    const registryRaw = readTextFile(registryPath, "token registry");
    const entries = parseRegistryEntries(registryRaw, `token registry (${registryPath})`);
    const graph = buildGraph(entries);
    const cyclesData = detectCycles(graph);
    const chainDataByNodeId = computeLongestChainData(graph, cyclesData.cycleNodeIds);

    const highIndirection = buildHighIndirectionReport(
      graph,
      chainDataByNodeId,
      threshold,
      maxItems,
    );
    const terminalReports = buildTerminalReports(graph, maxItems);

    const unresolved = graph.unresolvedRefs
      .slice()
      .sort((a, b) => {
        const byFrom = a.fromKey.localeCompare(b.fromKey, "en", { sensitivity: "base" });
        if (byFrom !== 0) return byFrom;
        return a.cssVar.localeCompare(b.cssVar, "en", { sensitivity: "base" });
      });
    const unresolvedReasonCounts = buildReasonCounts(unresolved, "reason");
    const collisionsReasonCounts = buildReasonCounts(graph.collisions, "reason");

    const reportCore = {
      source: {
        registry_path: registryPath,
      },
      summary: {
        nodes: graph.nodes.length,
        edges: graph.edgeCount,
        cycles: cyclesData.cycles.length,
        cycle_nodes: cyclesData.cycleNodeIds.size,
        indirection_threshold: threshold,
        high_indirection_total: highIndirection.total,
        terminals_total: terminalReports.terminals_total,
        unused_primitive_terminals_total: terminalReports.unused_primitive_terminals_total,
        unresolved_css_var_refs_total: unresolved.length,
        unresolved_css_var_refs_by_reason: unresolvedReasonCounts,
        ambiguous_css_vars_total: graph.ambiguousCssVars.length,
        graph_collisions: graph.collisions.length,
        graph_collisions_by_reason: collisionsReasonCounts,
      },
      cycles: cyclesData.cycles.slice(0, maxItems),
      high_indirection: highIndirection.rows,
      terminals: terminalReports.terminals,
      unused_primitive_terminals: terminalReports.unused_primitive_terminals,
      unresolved_css_var_refs: limitItems(unresolved, maxItems),
      ambiguous_css_vars: limitItems(graph.ambiguousCssVars, maxItems),
      collisions: graph.collisions.slice(0, maxItems),
    };

    const report = {
      ok: true,
      ...reportCore,
      fingerprint: fingerprint(reportCore),
      hint:
        cyclesData.cycles.length > 0
          ? "Cycles detected. Resolve dependency loops before publishing tokens."
          : "No cycles detected.",
    };

    const markdown = buildMarkdownReport(report, maxItems);
    const mermaid = noMermaid ? "" : buildMermaid(graph, mermaidMaxEdges);

    const writeResults = {
      json: writeTextFileIfChanged(outJsonPath, `${JSON.stringify(report, null, 2)}\n`, { dryRun }),
      markdown: writeTextFileIfChanged(outMdPath, markdown, { dryRun }),
      mermaid: noMermaid
        ? null
        : writeTextFileIfChanged(outMermaidPath, mermaid, { dryRun }),
    };
    const changedFiles = [
      writeResults.json,
      writeResults.markdown,
      writeResults.mermaid,
    ]
      .filter(Boolean)
      .filter((item) => item.changed)
      .map((item) => item.path);
    const writtenFiles = [
      writeResults.json,
      writeResults.markdown,
      writeResults.mermaid,
    ]
      .filter(Boolean)
      .filter((item) => item.written)
      .map((item) => item.path);

    const stdoutPayload = {
      ...report,
      dry_run: dryRun,
      outputs: {
        json: outJsonPath,
        markdown: outMdPath,
        mermaid: noMermaid ? null : outMermaidPath,
      },
      write_results: writeResults,
      changed_files: changedFiles,
      written_files: writtenFiles,
    };

    if (format === "text") {
      process.stdout.write(markdown);
    } else {
      process.stdout.write(`${JSON.stringify(stdoutPayload, null, 2)}\n`);
    }

    if (strictCycles && cyclesData.cycles.length > 0) {
      process.exit(1);
    }

    if (strictHighIndirection && highIndirection.total > 0) {
      process.exit(1);
    }

    if (strictUnresolved && unresolved.length > 0) {
      process.exit(1);
    }

    if (strictCollisions && graph.collisions.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
