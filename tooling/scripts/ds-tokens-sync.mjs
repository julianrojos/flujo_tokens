#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs } from "./lib/parse-args.mjs";
import { PROJECT_ROOT } from "./lib/paths.mjs";
import { DEFAULT_TOKEN_REGISTRY_PATH } from "./lib/token-registry.mjs";
import {
  computeFingerprint,
  shouldSkipTask,
  updateTaskState,
} from "./lib/cache-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GENERATOR_ENTRY = path.resolve(__dirname, "../src/cli/index.ts");

function collectInputJsonFiles(inputDir) {
  if (!fs.existsSync(inputDir)) return [];
  return fs
    .readdirSync(inputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(inputDir, entry.name))
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function runOrFail(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    throw new Error(result.error.message);
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with code ${result.status}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const force = String(args.force || "false") === "true";
  const syncStatePath = args["sync-state"] || undefined;

  const inputDir = path.resolve(args.input || path.join(PROJECT_ROOT, "input"));
  const split = String(args.single || "false") !== "true";
  const outputFile = path.resolve(args.output || path.join(PROJECT_ROOT, "output/custom-properties.css"));
  const outputPrimitives = path.resolve(
    args["output-primitives"] || path.join(PROJECT_ROOT, "output/primitives.css")
  );
  const outputTokens = path.resolve(
    args["output-tokens"] || path.join(PROJECT_ROOT, "output/tokens.css")
  );
  const registryOutput = path.resolve(args["registry-output"] || DEFAULT_TOKEN_REGISTRY_PATH);
  const mode = String(args.mode || "").trim();
  const modeStrict = String(args["mode-strict"] || "false") === "true";
  const modeLoose = String(args["mode-loose"] || "false") === "true";
  const allowJsonRepair = String(process.env.ALLOW_JSON_REPAIR || "").toLowerCase();
  const allowAliasScan = String(process.env.ALLOW_ALIAS_SCAN || "").toLowerCase();

  const inputFiles = collectInputJsonFiles(inputDir);
  if (inputFiles.length === 0) {
    console.error(`No JSON input files found in ${inputDir}`);
    process.exit(1);
  }

  const outputs = split
    ? [outputPrimitives, outputTokens, registryOutput]
    : [outputFile, registryOutput];
  const fingerprint = computeFingerprint({
    files: [GENERATOR_ENTRY, ...inputFiles],
    values: {
      inputDir,
      split,
      outputFile,
      outputPrimitives,
      outputTokens,
      registryOutput,
      mode,
      modeStrict,
      modeLoose,
      allowJsonRepair,
      allowAliasScan,
    },
  });

  const taskId = `ds-tokens-sync:${inputDir}`;
  const sync = shouldSkipTask({
    taskId,
    fingerprint,
    outputs,
    force,
    statePath: syncStatePath,
  });

  if (sync.skip) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: sync.reason,
          outputs,
          inputDir,
          hint: "Use --force true to regenerate tokens.",
        },
        null,
        2
      )}\n`
    );
    return;
  }

  const generatorArgs = ["tsx", "tooling/src/cli/index.ts", "--registry", "--input", inputDir];
  if (split) {
    generatorArgs.push("--split", "--output-primitives", outputPrimitives, "--output-tokens", outputTokens);
  } else {
    generatorArgs.push("--single", "--output", outputFile);
  }
  generatorArgs.push("--registry-output", registryOutput);

  if (mode) {
    generatorArgs.push("--mode", mode);
  }
  if (modeStrict) {
    generatorArgs.push("--mode-strict");
  }
  if (modeLoose) {
    generatorArgs.push("--mode-loose");
  }

  try {
    runOrFail("npx", generatorArgs);
    updateTaskState({
      taskId,
      fingerprint,
      outputs,
      metadata: {
        command: "ds-tokens-sync",
        split,
        inputFiles: inputFiles.length,
      },
      statePath: syncStatePath,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
