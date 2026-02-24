import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNotFoundFileError,
  parseSnippetLine,
  resolveRequestedRepoPath,
  resolveSnippetTargetLine,
} from "./file-route-service.mjs";

test("file-route-service: resolveRequestedRepoPath maps invalid path to API error", () => {
  const valid = resolveRequestedRepoPath({
    repoRoot: "/repo",
    requested: "docs/file.md",
    resolveRepoFilePathFn: () => "/repo/docs/file.md",
    code: "file.invalid_path",
    userMessage: "Invalid file path.",
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.absPath, "/repo/docs/file.md");

  const invalid = resolveRequestedRepoPath({
    repoRoot: "/repo",
    requested: "../../etc/passwd",
    resolveRepoFilePathFn: () => null,
    code: "file.invalid_path",
    userMessage: "Invalid file path.",
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.errorArgs.code, "file.invalid_path");
});

test("file-route-service: parseSnippetLine validates numeric line", () => {
  const valid = parseSnippetLine("10");
  assert.equal(valid.ok, true);
  assert.equal(valid.line, 10);

  const invalid = parseSnippetLine("abc");
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errorArgs.code, "validation.invalid_line_parameter");
});

test("file-route-service: resolveSnippetTargetLine supports line and query modes", () => {
  const direct = resolveSnippetTargetLine({
    rawLine: "3",
    content: "a\nb\nc",
    query: "",
    findLineForQueryFn: () => null,
    requested: "docs/file.md",
  });
  assert.equal(direct.ok, true);
  assert.equal(direct.matchedBy, "line");

  const query = resolveSnippetTargetLine({
    rawLine: "",
    content: "a\nneedle\nc",
    query: "needle",
    findLineForQueryFn: () => 2,
    requested: "docs/file.md",
  });
  assert.equal(query.ok, true);
  assert.equal(query.line, 2);
  assert.equal(query.matchedBy, "query");

  const missing = resolveSnippetTargetLine({
    rawLine: "",
    content: "a\nb\nc",
    query: "needle",
    findLineForQueryFn: () => null,
    requested: "docs/file.md",
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.errorArgs.code, "file.query_not_found");
});

test("file-route-service: buildNotFoundFileError maps message and context", () => {
  const payload = buildNotFoundFileError({
    code: "file.not_found",
    requested: "docs/missing.md",
    error: new Error("ENOENT"),
  });
  assert.equal(payload.statusCode, 404);
  assert.equal(payload.errorArgs.code, "file.not_found");
  assert.equal(payload.errorArgs.context.requested, "docs/missing.md");
});
