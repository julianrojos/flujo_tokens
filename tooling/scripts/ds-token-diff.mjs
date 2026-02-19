#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import { DOCS_ROOT } from "./lib/paths.mjs";

const DEFAULT_REGISTRY_PATH = path.join(DOCS_ROOT, "_generated", "token-registry.json");
const DEFAULT_BEFORE_REF = "HEAD";
const IDENTITY_FIELDS = ["path", "slashPath", "cssVar"];
const COMPARE_FIELDS = ["path", "slashPath", "cssVar", "type", "collection", "resolvedValue"];
const BREAKING_MODIFIED_FIELDS = new Set(["type", "cssVar"]);

const USAGE = {
  command: "npm run ds:token-diff -- [--before <file> | --before-ref <git-ref>]",
  description:
    "Compare token registry versions and report Added/Modified/Removed changes with breaking classification.",
  options: [
    {
      name: "--current <path>",
      description: "Current token registry JSON path.",
      defaultValue: "docs/_generated/token-registry.json",
    },
    {
      name: "--before <path>",
      description: "Previous token registry JSON file path.",
    },
    {
      name: "--before-ref <git-ref>",
      description:
        "Git reference for the previous registry (defaults to HEAD). The script reads docs/_generated/token-registry.json from that ref.",
      defaultValue: "HEAD",
    },
    {
      name: "--registry-at-ref <path>",
      description:
        "Registry path inside the git ref used with --before-ref.",
      defaultValue: "docs/_generated/token-registry.json",
    },
    {
      name: "--format <json|text>",
      description: "Stdout output format.",
      defaultValue: "json",
    },
    {
      name: "--out-json <path>",
      description: "Optional JSON report output path.",
    },
    {
      name: "--out-md <path>",
      description: "Optional markdown summary output path.",
    },
    {
      name: "--strict <true|false>",
      description: "Exit non-zero when breaking changes are detected.",
      defaultValue: "false",
    },
    {
      name: "--help",
      description: "Show this help message.",
    },
  ],
};

function readFileText(filePath, label) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`${label} not found: ${absolutePath}`);
  }
  try {
    return fs.readFileSync(absolutePath, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed reading ${label} (${absolutePath}): ${reason}`);
  }
}

function readRegistryFromGitRef(gitRef, registryPathInRef) {
  const ref = String(gitRef || "").trim();
  const internalPath = String(registryPathInRef || "").trim();
  if (!ref) {
    throw new Error("Missing --before-ref value.");
  }
  if (!internalPath) {
    throw new Error("Missing --registry-at-ref value.");
  }

  const objectRef = `${ref}:${internalPath}`;
  const result = spawnSync("git", ["show", objectRef], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw new Error(`Failed running git show for ${objectRef}: ${result.error.message}`);
  }

  if ((result.status ?? 1) !== 0) {
    const stderr = String(result.stderr || "").trim();
    throw new Error(
      `Unable to read registry from git ref (${objectRef}).` +
        (stderr ? `\n${stderr}` : ""),
    );
  }

  return String(result.stdout || "");
}

function parseRegistryJson(rawJson, label) {
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${label}: ${reason}`);
  }

  let entries = [];
  if (Array.isArray(parsed)) {
    entries = parsed;
  } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.entries)) {
    entries = parsed.entries;
  } else if (
    parsed &&
    typeof parsed === "object" &&
    parsed.byPath &&
    typeof parsed.byPath === "object"
  ) {
    entries = Object.values(parsed.byPath);
  } else if (parsed && typeof parsed === "object") {
    entries = Object.values(parsed);
  }

  const normalized = [];
  for (const rawEntry of entries) {
    if (!rawEntry || typeof rawEntry !== "object") continue;
    normalized.push({
      path: String(rawEntry.path || "").trim(),
      slashPath: String(rawEntry.slashPath || "").trim(),
      cssVar: String(rawEntry.cssVar || "").trim(),
      type: String(rawEntry.type || "").trim().toLowerCase(),
      collection: String(rawEntry.collection || "").trim(),
      resolvedValue: String(rawEntry.resolvedValue || "").trim(),
    });
  }

  normalized.sort((a, b) => {
    const keyA = `${a.path}|${a.slashPath}|${a.cssVar}`;
    const keyB = `${b.path}|${b.slashPath}|${b.cssVar}`;
    return keyA.localeCompare(keyB, "en", { sensitivity: "base" });
  });

  return normalized;
}

function getIdentityKey(entry) {
  for (const field of IDENTITY_FIELDS) {
    const value = String(entry[field] || "").trim();
    if (value) return `${field}:${value}`;
  }
  return "";
}

function buildEntryMap(entries, label) {
  const map = new Map();
  const ignored = [];

  for (const entry of entries) {
    const key = getIdentityKey(entry);
    if (!key) {
      ignored.push({ reason: "missing_identity", entry });
      continue;
    }

    if (map.has(key)) {
      const existing = map.get(key);
      if (stableStringify(existing) === stableStringify(entry)) {
        continue;
      }
      throw new Error(`Duplicate token identity detected in ${label}: ${key}. Diff would be ambiguous.`);
    }

    map.set(key, entry);
  }

  return { map, ignored };
}

function changedFields(beforeEntry, currentEntry) {
  const fields = [];
  for (const field of COMPARE_FIELDS) {
    const beforeValue = String(beforeEntry[field] || "");
    const currentValue = String(currentEntry[field] || "");
    if (beforeValue !== currentValue) fields.push(field);
  }
  return fields;
}

function classifyModifiedChange(fields) {
  return fields.some((field) => BREAKING_MODIFIED_FIELDS.has(field))
    ? "breaking"
    : "non-breaking";
}

function toDiffEntry(identityKey, beforeEntry, currentEntry) {
  const fields = changedFields(beforeEntry, currentEntry);
  const before = {};
  const current = {};
  for (const field of fields) {
    before[field] = String(beforeEntry[field] || "");
    current[field] = String(currentEntry[field] || "");
  }

  return {
    identity: identityKey,
    key: currentEntry.path || beforeEntry.path || currentEntry.slashPath || beforeEntry.slashPath,
    change_class: classifyModifiedChange(fields),
    fields_changed: fields,
    before,
    current,
    value_diff: fields.includes("resolvedValue")
      ? {
          before: String(beforeEntry.resolvedValue || ""),
          current: String(currentEntry.resolvedValue || ""),
        }
      : null,
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function createFingerprint(payload) {
  const data = stableStringify(payload);
  return crypto.createHash("sha256").update(data).digest("hex");
}

function compareTokenRegistries(beforeEntries, currentEntries) {
  const beforeIndex = buildEntryMap(beforeEntries, "before registry");
  const currentIndex = buildEntryMap(currentEntries, "current registry");

  const beforeMap = beforeIndex.map;
  const currentMap = currentIndex.map;

  const keys = Array.from(new Set([...beforeMap.keys(), ...currentMap.keys()])).sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" }),
  );

  const added = [];
  const removed = [];
  const modified = [];

  for (const key of keys) {
    const beforeEntry = beforeMap.get(key);
    const currentEntry = currentMap.get(key);

    if (!beforeEntry && currentEntry) {
      added.push({
        identity: key,
        key: currentEntry.path || currentEntry.slashPath || currentEntry.cssVar,
        change_class: "non-breaking",
        token: currentEntry,
      });
      continue;
    }

    if (beforeEntry && !currentEntry) {
      removed.push({
        identity: key,
        key: beforeEntry.path || beforeEntry.slashPath || beforeEntry.cssVar,
        change_class: "breaking",
        token: beforeEntry,
      });
      continue;
    }

    if (!beforeEntry || !currentEntry) continue;

    const fields = changedFields(beforeEntry, currentEntry);
    if (fields.length === 0) continue;
    modified.push(toDiffEntry(key, beforeEntry, currentEntry));
  }

  added.sort((a, b) => a.key.localeCompare(b.key, "en", { sensitivity: "base" }));
  removed.sort((a, b) => a.key.localeCompare(b.key, "en", { sensitivity: "base" }));
  modified.sort((a, b) => a.key.localeCompare(b.key, "en", { sensitivity: "base" }));

  const breakingModified = modified.filter((item) => item.change_class === "breaking").length;
  const nonBreakingModified = modified.length - breakingModified;

  const summary = {
    before_tokens: beforeMap.size,
    current_tokens: currentMap.size,
    added: added.length,
    removed: removed.length,
    modified: modified.length,
    breaking_changes: removed.length + breakingModified,
    non_breaking_changes: added.length + nonBreakingModified,
    ignored_entries: {
      before: beforeIndex.ignored.length,
      current: currentIndex.ignored.length,
    },
  };

  return {
    summary,
    changes: {
      added,
      removed,
      modified,
    },
  };
}

function buildMarkdownSummary(report) {
  const lines = [
    "# Token Change Explorer",
    "",
    `- Current source: ${report.sources.current.label}`,
    `- Previous source: ${report.sources.before.label}`,
    "",
    "## Summary",
    "",
    `- Tokens (before): ${report.summary.before_tokens}`,
    `- Tokens (current): ${report.summary.current_tokens}`,
    `- Added: ${report.summary.added}`,
    `- Removed: ${report.summary.removed}`,
    `- Modified: ${report.summary.modified}`,
    `- Breaking changes: ${report.summary.breaking_changes}`,
    `- Non-breaking changes: ${report.summary.non_breaking_changes}`,
    "",
  ];

  const sections = [
    {
      title: "Added",
      items: report.changes.added.map((item) => `- \`${item.key}\` (${item.identity})`),
    },
    {
      title: "Removed",
      items: report.changes.removed.map((item) => `- \`${item.key}\` (${item.identity})`),
    },
    {
      title: "Modified",
      items: report.changes.modified.map((item) => {
        const fields = item.fields_changed.map((field) => `\`${field}\``).join(", ");
        const marker = item.change_class === "breaking" ? "breaking" : "non-breaking";
        const valueDiff = item.value_diff
          ? ` | value: \`${item.value_diff.before}\` -> \`${item.value_diff.current}\``
          : "";
        return `- \`${item.key}\` (${marker}) | fields: ${fields}${valueDiff}`;
      }),
    },
  ];

  for (const section of sections) {
    lines.push(`## ${section.title}`, "");
    if (section.items.length === 0) {
      lines.push("- None", "");
      continue;
    }
    lines.push(...section.items, "");
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

function writeTextFile(filePath, content) {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, "utf8");
  return absolutePath;
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

  const strict = String(args.strict || "false") === "true";
  const currentPath = path.resolve(args.current || DEFAULT_REGISTRY_PATH);
  const beforePath = String(args.before || "").trim();
  const beforeRef = String(args["before-ref"] || DEFAULT_BEFORE_REF).trim();
  const registryAtRef = String(args["registry-at-ref"] || "docs/_generated/token-registry.json").trim();

  if (beforePath && args["before-ref"]) {
    process.stderr.write("Use either --before or --before-ref, not both.\n");
    process.exit(1);
  }

  try {
    const currentRaw = readFileText(currentPath, "current registry");
    const beforeRaw = beforePath
      ? readFileText(beforePath, "previous registry")
      : readRegistryFromGitRef(beforeRef, registryAtRef);

    const currentEntries = parseRegistryJson(currentRaw, `current registry (${currentPath})`);
    const beforeEntries = parseRegistryJson(
      beforeRaw,
      beforePath
        ? `previous registry (${path.resolve(beforePath)})`
        : `previous registry (${beforeRef}:${registryAtRef})`,
    );

    const diff = compareTokenRegistries(beforeEntries, currentEntries);

    const reportCore = {
      sources: {
        current: {
          type: "file",
          label: currentPath,
        },
        before: beforePath
          ? {
              type: "file",
              label: path.resolve(beforePath),
            }
          : {
              type: "git-ref",
              label: `${beforeRef}:${registryAtRef}`,
            },
      },
      summary: diff.summary,
      changes: diff.changes,
    };

    const report = {
      ok: true,
      ...reportCore,
      fingerprint: createFingerprint(reportCore),
      hint:
        diff.summary.breaking_changes > 0
          ? "Breaking token changes detected. Review affected components before publishing."
          : "No breaking token changes detected.",
    };

    const markdownSummary = buildMarkdownSummary(report);

    if (args["out-json"]) {
      writeTextFile(args["out-json"], `${JSON.stringify(report, null, 2)}\n`);
    }

    if (args["out-md"]) {
      writeTextFile(args["out-md"], markdownSummary);
    }

    if (format === "text") {
      process.stdout.write(markdownSummary);
    } else {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    }

    if (strict && diff.summary.breaking_changes > 0) {
      process.exit(1);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
