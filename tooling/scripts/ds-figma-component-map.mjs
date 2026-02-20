#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import { DOCS_ROOT, PROJECT_ROOT } from "./lib/paths.mjs";
import { fetchFigmaFile } from "./lib/figma-api.mjs";
import {
  parseFigmaFileUrl,
  buildFigmaComponentMap,
  buildFigmaComponentMapSummary,
  renderFigmaComponentMapText,
} from "./lib/figma-component-map.mjs";

const DEFAULT_OUTPUT_DIR = path.join(
  DOCS_ROOT,
  "_generated",
  "figma-component-map",
);
const DEFAULT_TIMEOUT_MS = 30_000;

const USAGE = {
  command:
    'npm run ds:figma-component-map -- --url "https://www.figma.com/design/<fileKey>/<slug>"',
  description:
    "Extract all COMPONENT / COMPONENT_SET nodes across all pages from a Figma file and record nesting/dependency relations.",
  options: [
    {
      name: "--url <figma-file-url>",
      description: "Figma file/design URL.",
      required: true,
    },
    {
      name: "--token <figma-token>",
      description:
        "Figma personal access token. If omitted, reads FIGMA_TOKEN from environment.",
    },
    {
      name: "--out <path>",
      description:
        "Output JSON path. Default: docs/_generated/figma-component-map/<fileKey>.json",
    },
    {
      name: "--depth <number>",
      description:
        "Optional Figma API depth parameter. Omit for full file traversal.",
    },
    {
      name: "--timeout-ms <number>",
      description: "HTTP timeout in milliseconds.",
      defaultValue: String(DEFAULT_TIMEOUT_MS),
    },
    {
      name: "--include-instances <true|false>",
      description:
        "Track component dependencies from INSTANCE nodes inside components.",
      defaultValue: "true",
    },
    {
      name: "--strict-unresolved-instances <true|false>",
      description:
        "Exit non-zero if unresolved instance references exist in the map.",
      defaultValue: "false",
    },
    {
      name: "--allow-outside-project <true|false>",
      description: "Allow output paths outside repository root (unsafe).",
      defaultValue: "false",
    },
    {
      name: "--format <json|text>",
      description: "Stdout format.",
      defaultValue: "json",
    },
    {
      name: "--dry-run <true|false>",
      description: "Do not write output file; only print summary.",
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

function parsePositiveInteger(rawValue, optionName, fallback) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${optionName} value: ${rawValue}. Expected a number.`);
  }
  if (parsed <= 0) {
    throw new Error(
      `Invalid ${optionName} value: ${rawValue}. Expected a positive integer.`,
    );
  }
  return Math.floor(parsed);
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

function writeTextFileAtomicIfChanged(filePath, content, { dryRun = false } = {}) {
  const resolved = path.resolve(filePath);
  const previous = fs.existsSync(resolved) ? fs.readFileSync(resolved, "utf8") : null;
  const changed = previous !== content;
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

function parseFormat(rawValue) {
  const normalized = String(rawValue || "json").trim().toLowerCase();
  if (normalized === "json" || normalized === "text") return normalized;
  throw new Error(`Invalid --format value: ${rawValue}. Allowed: json, text.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (String(args.help || "false") === "true") {
    printUsage(USAGE, { exitCode: 0 });
  }

  const figmaUrl = String(args.url || "").trim();
  if (!figmaUrl) {
    printUsage(USAGE, { stream: "stderr", exitCode: 1 });
  }

  const parsedUrl = parseFigmaFileUrl(figmaUrl);
  const token = String(args.token || process.env.FIGMA_TOKEN || "").trim();
  if (!token) {
    throw new Error(
      "Missing Figma token. Provide --token <token> or set FIGMA_TOKEN.",
    );
  }

  const allowOutsideProject = parseBooleanOption(
    args["allow-outside-project"],
    "--allow-outside-project",
    false,
  );
  const includeInstances = parseBooleanOption(
    args["include-instances"],
    "--include-instances",
    true,
  );
  const strictUnresolvedInstances = parseBooleanOption(
    args["strict-unresolved-instances"],
    "--strict-unresolved-instances",
    false,
  );
  const dryRun = parseBooleanOption(args["dry-run"], "--dry-run", false);
  const format = parseFormat(args.format);

  const timeoutMs = parsePositiveInteger(
    args["timeout-ms"],
    "--timeout-ms",
    DEFAULT_TIMEOUT_MS,
  );
  const depth = parsePositiveInteger(args.depth, "--depth", undefined);

  const defaultOutputPath = path.join(
    DEFAULT_OUTPUT_DIR,
    `${parsedUrl.fileKey}.json`,
  );
  const outputPath = resolveSafePath(args.out || defaultOutputPath, "--out", {
    allowOutsideProject,
  });

  const filePayload = await fetchFigmaFile({
    fileKey: parsedUrl.fileKey,
    token,
    depth,
    timeoutMs,
  });

  const componentMap = buildFigmaComponentMap({
    filePayload,
    fileDescriptor: parsedUrl,
    includeInstances,
  });
  const summary = buildFigmaComponentMapSummary(componentMap);

  if (
    strictUnresolvedInstances &&
    Number(summary.stats.unresolved_instance_records || 0) > 0
  ) {
    throw new Error(
      `Blocking unresolved instance references: ${summary.stats.unresolved_instance_records}. Re-run with --strict-unresolved-instances false to allow.`,
    );
  }

  const writeResult = writeTextFileAtomicIfChanged(
    outputPath,
    `${JSON.stringify(componentMap, null, 2)}\n`,
    { dryRun },
  );

  if (format === "text") {
    process.stdout.write(renderFigmaComponentMapText(componentMap));
    process.stdout.write(`Output: ${writeResult.path}\n`);
    process.stdout.write(
      `Changed: ${writeResult.changed ? "yes" : "no"}${dryRun ? " (dry-run)" : ""}\n`,
    );
    return;
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        source: summary.source,
        stats: summary.stats,
        output: {
          path: writeResult.path,
          changed: writeResult.changed,
          written: writeResult.written,
          dry_run: dryRun,
        },
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
