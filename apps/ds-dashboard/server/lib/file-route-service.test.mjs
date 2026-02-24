import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFileContentResponse,
  buildFileSnippetResponse,
  buildMissingAssetErrorArgs,
  buildNotFoundFileError,
  parseSnippetWindow,
  parseSnippetLine,
  readFileContentPayload,
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

test("file-route-service: parseSnippetWindow keeps defaults for invalid values", () => {
  assert.deepEqual(parseSnippetWindow("3", "5"), { before: 3, after: 5 });
  assert.deepEqual(parseSnippetWindow("", ""), { before: 2, after: 2 });
  assert.deepEqual(parseSnippetWindow("x", "y", 4), { before: 4, after: 4 });
});

test("file-route-service: readFileContentPayload maps read errors to API payloads", async () => {
  const ok = await readFileContentPayload({
    absPath: "/repo/docs/file.md",
    requested: "docs/file.md",
    notFoundCode: "file.not_found",
    readTextFileLimitedFn: async () => ({ content: "hello", truncated: false }),
    maxFileBytes: 1000,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.content, "hello");

  const fail = await readFileContentPayload({
    absPath: "/repo/docs/missing.md",
    requested: "docs/missing.md",
    notFoundCode: "file.not_found",
    readTextFileLimitedFn: async () => {
      throw new Error("ENOENT");
    },
    maxFileBytes: 1000,
  });
  assert.equal(fail.ok, false);
  assert.equal(fail.statusCode, 404);
  assert.equal(fail.errorArgs.code, "file.not_found");
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

test("file-route-service: response builders keep API contract", () => {
  const filePayload = buildFileContentResponse({
    requested: "docs/file.md",
    truncated: false,
    content: "hello",
  });
  assert.equal(filePayload.file, "docs/file.md");
  assert.equal(filePayload.content, "hello");

  const snippetPayload = buildFileSnippetResponse({
    requested: "docs/file.md",
    matchedBy: "query",
    snippet: { targetLine: 2, startLine: 1, endLine: 3, snippet: "a\nb\nc" },
  });
  assert.equal(snippetPayload.line, 2);
  assert.equal(snippetPayload.matchedBy, "query");

  const missingAsset = buildMissingAssetErrorArgs("docs/missing.png");
  assert.equal(missingAsset.code, "asset.not_found");
  assert.equal(missingAsset.context.requested, "docs/missing.png");
});
