import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { validateDocs } from "./docs-validator.mjs";
import { resolveSystemContextSafe } from "./system-context.mjs";

function pickAnyMarkdownFile(docsRoot) {
  const queue = [docsRoot];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || !fs.existsSync(current)) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        return fullPath;
      }
    }
  }
  return null;
}

test("docs-validator: returns a stable report shape for a single markdown file", () => {
  const ctx = resolveSystemContextSafe();
  const markdownFile = pickAnyMarkdownFile(ctx.paths.docs);
  assert.ok(markdownFile, "Expected at least one markdown file in docs root");

  const report = validateDocs({
    docsRoot: ctx.paths.docs,
    filePath: markdownFile,
    checkPairing: false,
    checkSpecs: false,
    checkOverview: false,
  });

  assert.equal(typeof report, "object");
  assert.equal(typeof report.ok, "boolean");
  assert.equal(typeof report.generatedAt, "string");
  assert.equal(typeof report.governance, "object");
  assert.equal(typeof report.governance.manifestPath, "string");
  assert.equal(typeof report.governance.manifestLoaded, "boolean");

  assert.equal(typeof report.summary, "object");
  assert.equal(report.summary.filesChecked, 1);
  assert.equal(typeof report.summary.errors, "number");
  assert.equal(typeof report.summary.warnings, "number");
  assert.ok(Array.isArray(report.errors));
  assert.ok(Array.isArray(report.warnings));
});

test("docs-validator: returns REG01 when token registry path is invalid", () => {
  const ctx = resolveSystemContextSafe();
  const report = validateDocs({
    docsRoot: ctx.paths.docs,
    registryPath: path.join(process.cwd(), "__nonexistent__", "token-registry.json"),
  });

  assert.equal(report.ok, false);
  assert.ok(report.errors.some((item) => item?.code === "REG01"));
});
