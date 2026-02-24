import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildSnippet,
  createSnippetBuilder,
  findLineForQuery,
  guessContentType,
  readJsonBody,
  readTextFileLimited,
  resolveRepoFilePath,
  toBooleanString,
  toNumberString,
} from "./request-file-helpers.mjs";

test("request-file-helpers: boolean and number coercion", () => {
  assert.equal(toBooleanString(true, false), "true");
  assert.equal(toBooleanString("FALSE", true), "false");
  assert.equal(toBooleanString("invalid", true), "true");

  assert.equal(toNumberString("12", 3, 20), "12");
  assert.equal(toNumberString("100", 3, 20), "20");
  assert.equal(toNumberString("NaN", 3, 20), "3");
});

test("request-file-helpers: content type mapping", () => {
  assert.equal(guessContentType("/tmp/image.png"), "image/png");
  assert.equal(guessContentType("/tmp/doc.pdf"), "application/pdf");
  assert.equal(guessContentType("/tmp/file.unknown"), "application/octet-stream");
});

test("request-file-helpers: resolveRepoFilePath guards path traversal", () => {
  const root = path.resolve("/repo");
  assert.equal(resolveRepoFilePath(root, "docs/readme.md"), path.resolve("/repo/docs/readme.md"));
  assert.equal(resolveRepoFilePath(root, "../etc/passwd"), null);
});

test("request-file-helpers: readTextFileLimited truncates output", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rfh-"));
  const filePath = path.join(dir, "sample.txt");
  await fs.writeFile(filePath, "abcdefghijklmnopqrstuvwxyz", "utf8");
  const result = await readTextFileLimited(filePath, 5);
  assert.equal(result.truncated, true);
  assert.equal(result.content, "abcde");
});

test("request-file-helpers: query and snippet helpers", () => {
  const content = ["line 1", "line 2 hello", "line 3", "line 4"].join("\n");
  assert.equal(findLineForQuery(content, "HELLO"), 2);
  assert.equal(findLineForQuery(content, "missing"), null);

  const snippet = buildSnippet(content, 2, 1, 1, 5);
  assert.equal(snippet.startLine, 1);
  assert.equal(snippet.endLine, 3);

  const builder = createSnippetBuilder(3);
  const built = builder(content, 2, 1, 2);
  assert.equal(built.endLine, 3);
});

test("request-file-helpers: readJsonBody handles invalid payloads", async () => {
  const valid = await readJsonBody({
    req: {
      async json() {
        return { ok: true };
      },
    },
  });
  assert.deepEqual(valid, { ok: true });

  const arrayPayload = await readJsonBody({
    req: {
      async json() {
        return [1, 2, 3];
      },
    },
  });
  assert.deepEqual(arrayPayload, {});

  const invalid = await readJsonBody({
    req: {
      async json() {
        throw new Error("invalid");
      },
    },
  });
  assert.deepEqual(invalid, {});
});
