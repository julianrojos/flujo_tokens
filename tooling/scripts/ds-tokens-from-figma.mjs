#!/usr/bin/env node
/**
 * ds-tokens-from-figma.mjs
 *
 * Standalone CLI to import Figma local variables into design-token JSON files
 * and optionally compile them to CSS custom properties.
 *
 * Unlike the bootstrap inside ds-capture-from-figma-url.mjs (which only runs once
 * and only during a component capture), this command can be run at any time and
 * supports force-rewrite, merge, dry-run, and backup.
 *
 * Usage:
 *   npm run ds:tokens-from-figma -- \
 *     --system iter \
 *     --url "https://www.figma.com/design/FILEID/..." \
 *     --figma-token $FIGMA_TOKEN \
 *     [--force true]    # overwrite existing input JSON
 *     [--merge true]    # deep-merge (preserves manual tokens); requires --force
 *     [--compile true]  # run ds-tokens-sync after writing
 *     [--dry-run true]  # preview only, no writes
 */

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import { resolveSystemContext, PROJECT_ROOT } from "./lib/system-context.mjs";
import {
  syncFigmaTokensToInput,
  runTokensCompile,
} from "./lib/figma-token-sync.mjs";

const USAGE = {
  command: "ds:tokens-from-figma",
  description:
    "Imports Figma local variables into design-token JSON files and optionally compiles them to CSS custom properties.",
  options: [
    {
      name: "--system <id>",
      description: "Design system identifier (from design-systems.json).",
      required: true,
    },
    {
      name: "--url <figmaUrl>",
      description: "Full Figma file URL (https://www.figma.com/design/<fileKey>/...).",
    },
    {
      name: "--file-key <key>",
      description: "Figma file key (alternative to --url).",
    },
    {
      name: "--figma-token <token>",
      description: "Figma personal access token (fallback: FIGMA_TOKEN env var).",
    },
    {
      name: "--force <true|false>",
      description:
        "Overwrite existing input JSON files. Default: false (skip if input/ already has JSON).",
      defaultValue: "false",
    },
    {
      name: "--merge <true|false>",
      description:
        "Deep-merge incoming variables into existing tokens instead of overwriting (requires --force true). Preserves manual token edits.",
      defaultValue: "false",
    },
    {
      name: "--compile <true|false>",
      description:
        "Run ds-tokens-sync to compile input JSON to CSS custom properties after writing.",
      defaultValue: "true",
    },
    {
      name: "--dry-run <true|false>",
      description: "Preview what would be written without making any changes.",
      defaultValue: "false",
    },
    {
      name: "--help",
      description: "Show this help message.",
    },
  ],
};

function parseBooleanArg(raw, fallback) {
  const normalized = String(raw ?? fallback).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`Expected true or false, got: ${raw}`);
}

function extractFileKeyFromUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const segments = parsed.pathname.split("/").filter(Boolean);
    for (let i = 0; i < segments.length - 1; i += 1) {
      if (segments[i] === "file" || segments[i] === "design") {
        return segments[i + 1] || null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function resolveSystemFigmaToken(rawTokenRef) {
  const raw = String(rawTokenRef || "").trim();
  if (!raw) return "";

  const bracedRef = raw.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
  if (bracedRef) {
    return String(process.env[bracedRef[1]] || "").trim();
  }

  const dollarRef = raw.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
  if (dollarRef) {
    return String(process.env[dollarRef[1]] || "").trim();
  }

  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) {
    const envValue = String(process.env[raw] || "").trim();
    if (envValue) return envValue;
  }

  return raw;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage(USAGE);
    process.exit(0);
  }

  // ── Resolve system ───────────────────────────────────────────────────────
  const systemId = String(args.system || "").trim();
  if (!systemId) {
    process.stderr.write("[ds:tokens-from-figma] --system is required.\n");
    printUsage(USAGE);
    process.exit(1);
  }

  let system;
  try {
    const ctx = resolveSystemContext({ system: systemId });
    system = ctx;
  } catch (err) {
    process.stderr.write(
      `[ds:tokens-from-figma] Cannot resolve system "${systemId}": ${err.message}\n`,
    );
    process.exit(1);
  }

  // ── Resolve file key ─────────────────────────────────────────────────────
  const rawUrl = String(args.url || "").trim();
  const rawFileKey = String(args["file-key"] || "").trim();
  let fileKey = rawFileKey || extractFileKeyFromUrl(rawUrl) || String(system.figmaFileId || "").trim();

  if (!fileKey) {
    process.stderr.write(
      "[ds:tokens-from-figma] A Figma file key is required. " +
        "Provide --url, --file-key, or set figmaFileId in design-systems.json.\n",
    );
    process.exit(1);
  }

  // ── Resolve token ────────────────────────────────────────────────────────
  const figmaTokenFromSystem = resolveSystemFigmaToken(system.figmaApiToken);
  const figmaToken =
    String(args["figma-token"] || "").trim() ||
    figmaTokenFromSystem ||
    String(process.env.FIGMA_TOKEN || "").trim();

  if (!figmaToken) {
    process.stderr.write(
      "[ds:tokens-from-figma] A Figma personal access token is required. " +
        "Provide --figma-token or set FIGMA_TOKEN env var.\n",
    );
    process.exit(1);
  }

  // ── Parse flags ──────────────────────────────────────────────────────────
  const force = parseBooleanArg(args.force, false);
  const merge = parseBooleanArg(args.merge, false);
  const compile = parseBooleanArg(args.compile, true);
  const dryRun = parseBooleanArg(args["dry-run"], false);

  if (merge && !force) {
    process.stderr.write(
      "[ds:tokens-from-figma] --merge requires --force true.\n",
    );
    process.exit(1);
  }

  // ── Run sync ─────────────────────────────────────────────────────────────
  process.stderr.write(
    `[ds:tokens-from-figma] Syncing Figma variables → ${system.inputDir}` +
      (dryRun ? " (dry-run)" : "") +
      "\n",
  );

  const syncResult = await syncFigmaTokensToInput({
    repoRoot: PROJECT_ROOT,
    system,
    fileKey,
    figmaToken,
    force,
    merge,
    dryRun,
  });

  // ── Optionally compile ───────────────────────────────────────────────────
  let compileResult = null;
  const syncWroteFiles = Number(syncResult.files_written || 0) > 0;
  const syncSkippedExistingInput = syncResult.reason === "input-json-exists";
  if (!dryRun && compile && (syncWroteFiles || syncSkippedExistingInput)) {
    process.stderr.write(
      `[ds:tokens-from-figma] Compiling tokens → CSS (${system.outputDir})\n`,
    );
    compileResult = runTokensCompile({ repoRoot: PROJECT_ROOT, system });
  } else if (!dryRun && compile) {
    compileResult = { attempted: false, reason: "skipped-no-input-changes" };
  } else if (dryRun && compile) {
    compileResult = { attempted: false, reason: "skipped-in-dry-run" };
  } else if (!compile) {
    compileResult = { attempted: false, reason: "disabled-by-flag" };
  }

  // ── Output ───────────────────────────────────────────────────────────────
  const syncOk =
    syncSkippedExistingInput ||
    (syncResult.attempted !== false &&
      (syncWroteFiles || (dryRun && Number(syncResult.files_planned || 0) > 0)));
  const compileOk = !compile || compileResult?.compiled !== false;
  const summary = {
    ok: syncOk && compileOk,
    system: systemId,
    dry_run: dryRun,
    skipped_existing_input: syncSkippedExistingInput,
    sync: syncResult,
    compile: compileResult,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  process.exit(summary.ok ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(
    `[ds:tokens-from-figma] Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
