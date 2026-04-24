#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const cwd = process.cwd();

function isRepoRoot(dir: string): boolean {
  const manifestPath = path.join(dir, "package.json");
  if (!fs.existsSync(manifestPath)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      workspaces?: unknown;
    };
    return Array.isArray(pkg.workspaces);
  } catch {
    return false;
  }
}

if (!isRepoRoot(cwd) || path.resolve(cwd) !== repoRoot) {
  console.error(
    [
      "This repository only supports monorepo execution from the repository root.",
      `Run commands from: ${repoRoot}`,
      `Current working directory: ${cwd}`,
    ].join("\n"),
  );
  process.exit(1);
}
