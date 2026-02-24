import fs from "node:fs/promises";
import {
  buildNotFoundFileError,
  parseSnippetLine,
  resolveRequestedRepoPath,
  resolveSnippetTargetLine,
} from "../lib/file-route-service.mjs";

export function registerFileRoutes(app, deps) {
  const {
    failJson,
    getSystemContext,
    resolveRepoFilePath,
    readTextFileLimited,
    findLineForQuery,
    buildSnippet,
    guessContentType,
    MAX_FILE_BYTES,
  } = deps;

  function resolvePathOrFail(c, { requested, code, userMessage }) {
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const resolved = resolveRequestedRepoPath({
      repoRoot: sysCtx.repoRoot,
      requested,
      resolveRepoFilePathFn: resolveRepoFilePath,
      code,
      userMessage,
    });
    if (!resolved.ok) {
      return {
        ok: false,
        response: failJson(c, resolved.statusCode, resolved.errorArgs),
      };
    }
    return { ok: true, absPath: resolved.absPath };
  }

  async function readContentOrFail(c, { absPath, requested }) {
    try {
      const payload = await readTextFileLimited(absPath, MAX_FILE_BYTES);
      return { ok: true, content: payload.content, truncated: payload.truncated };
    } catch (error) {
      const failure = buildNotFoundFileError({
        code: "file.not_found",
        requested,
        error,
      });
      return {
        ok: false,
        response: failJson(c, failure.statusCode, failure.errorArgs),
      };
    }
  }

  app.get("/api/file", async (c) => {
    const requested = c.req.query("path") ?? c.req.query("file") ?? "";
    const resolved = resolvePathOrFail(c, {
      requested,
      code: "file.invalid_path",
      userMessage: "Invalid file path.",
    });
    if (!resolved.ok) return resolved.response;

    const loaded = await readContentOrFail(c, {
      absPath: resolved.absPath,
      requested,
    });
    if (!loaded.ok) return loaded.response;

    return c.json({
      ok: true,
      file: requested,
      truncated: loaded.truncated,
      content: loaded.content,
    });
  });

  app.get("/api/file-snippet", async (c) => {
    const requested = c.req.query("file") ?? "";
    const resolved = resolvePathOrFail(c, {
      requested,
      code: "file.invalid_path",
      userMessage: "Invalid file path.",
    });
    if (!resolved.ok) return resolved.response;

    const rawLine = c.req.query("line");
    const rawBefore = c.req.query("before");
    const rawAfter = c.req.query("after");
    const before = rawBefore ? Number.parseInt(rawBefore, 10) : 2;
    const after = rawAfter ? Number.parseInt(rawAfter, 10) : 2;
    const query = c.req.query("q") ?? "";

    const parsedLine = parseSnippetLine(rawLine);
    if (!parsedLine.ok) {
      return failJson(c, parsedLine.statusCode, parsedLine.errorArgs);
    }
    let line = parsedLine.line;

    const loaded = await readContentOrFail(c, {
      absPath: resolved.absPath,
      requested,
    });
    if (!loaded.ok) return loaded.response;
    const { content } = loaded;

    const resolvedLine = resolveSnippetTargetLine({
      rawLine,
      content,
      query,
      findLineForQueryFn: findLineForQuery,
      requested,
    });
    if (!resolvedLine.ok) {
      return failJson(c, resolvedLine.statusCode, resolvedLine.errorArgs);
    }
    if (Number.isFinite(resolvedLine.line)) line = resolvedLine.line;
    const matchedBy = resolvedLine.matchedBy;

    const snippet = buildSnippet(content, line, before, after);
    return c.json({
      ok: true,
      file: requested,
      line: snippet.targetLine,
      startLine: snippet.startLine,
      endLine: snippet.endLine,
      matchedBy,
      snippet: snippet.snippet,
    });
  });

  app.get("/api/asset", async (c) => {
    const requested = c.req.query("path") ?? "";
    const resolved = resolvePathOrFail(c, {
      requested,
      code: "asset.invalid_path",
      userMessage: "Invalid asset path.",
    });
    if (!resolved.ok) return resolved.response;
    const { absPath } = resolved;

    try {
      const stat = await fs.stat(absPath);
      if (!stat.isFile()) {
        return failJson(c, 404, {
          code: "asset.not_found",
          userMessage: "Asset not found.",
          recoverable: true,
          context: { requested },
        });
      }
      const buffer = await fs.readFile(absPath);
      return c.body(buffer, 200, {
        "Content-Type": guessContentType(absPath),
        "Cache-Control": "no-store",
      });
    } catch (error) {
      const failure = buildNotFoundFileError({
        code: "asset.not_found",
        requested,
        error,
      });
      return failJson(c, failure.statusCode, failure.errorArgs);
    }
  });
}
