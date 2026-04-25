#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const cwd = process.cwd();
const requireFromCwd = createRequire(path.join(cwd, "package.json"));

function fail(message) {
  console.error(message);
  process.exit(1);
}

const packageJsonPath = path.join(cwd, "package.json");
if (!fs.existsSync(packageJsonPath)) {
  fail(
    [
      "Missing package.json in current working directory.",
      `Current working directory: ${cwd}`,
      "Run this command from the monorepo root.",
    ].join("\n"),
  );
}

try {
  requireFromCwd.resolve("tsx/package.json");
} catch {
  fail(
    [
      "Missing dev runtime dependency: tsx.",
      "This command requires devDependencies to be installed.",
      "Install dependencies from repository root with:",
      "  npm ci",
      "If your environment uses --omit=dev, switch to a full install for tooling commands.",
    ].join("\n"),
  );
}
