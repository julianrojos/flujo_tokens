#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type PackageJson = {
  dependencies?: Record<string, string>;
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");

function readJson(filePath: string): PackageJson {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as PackageJson;
}

const rootPkgPath = path.join(repoRoot, "package.json");
const pluginPkgPath = path.join(repoRoot, "apps/figma-plugin/package.json");

const rootPkg = readJson(rootPkgPath);
const pluginPkg = readJson(pluginPkgPath);

const rootRef = rootPkg?.dependencies?.["@flujo/shared"];
const pluginRef = pluginPkg?.dependencies?.["@flujo/shared"];

const expectedRootRef = "workspace:*";
const expectedPluginRef = "file:../../packages/shared";

const failures: string[] = [];

if (rootRef !== expectedRootRef) {
  failures.push(
    `Root dependency mismatch: expected "@flujo/shared": "${expectedRootRef}", got "${String(rootRef)}".`,
  );
}

if (pluginRef !== expectedPluginRef) {
  failures.push(
    `Plugin dependency mismatch: expected "@flujo/shared": "${expectedPluginRef}", got "${String(pluginRef)}".`,
  );
}

if (failures.length > 0) {
  console.error(
    [
      "Shared manifest convention check failed.",
      ...failures,
      "Convention rationale: root uses workspace:*; plugin uses file: path for npm lockfile compatibility in this environment.",
    ].join("\n"),
  );
  process.exit(1);
}
