import fs from "node:fs/promises";
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

  function resolvePath(c, { requested, code, userMessage }) {
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    return resolveRequestedRepoPath({
      repoRoot: sysCtx.repoRoot,
      requested,
      resolveRepoFilePathFn: resolveRepoFilePath,
      code,
      userMessage,
    });
  }

  app.get("/api/file", async (c) => {
    const requested = c.req.query("path") ?? c.req.query("file") ?? "";
    const resolved = resolvePath(c, {
      requested,
      code: "file.invalid_path",
      userMessage: "Invalid file path.",
    });
    if (!resolved.ok) return failJson(c, resolved.statusCode, resolved.errorArgs);

    const loaded = await readFileContentPayload({
      absPath: resolved.absPath,
      requested,
      notFoundCode: "file.not_found",
      readTextFileLimitedFn: readTextFileLimited,
      maxFileBytes: MAX_FILE_BYTES,
    });
    if (!loaded.ok) return failJson(c, loaded.statusCode, loaded.errorArgs);

    return c.json(
      buildFileContentResponse({
        requested,
        truncated: loaded.truncated,
        content: loaded.content,
      }),
    );
  });

  app.get("/api/file-snippet", async (c) => {
    const requested = c.req.query("file") ?? "";
    const resolved = resolvePath(c, {
      requested,
      code: "file.invalid_path",
      userMessage: "Invalid file path.",
    });
    if (!resolved.ok) return failJson(c, resolved.statusCode, resolved.errorArgs);

    const rawLine = c.req.query("line");
    const rawBefore = c.req.query("before");
    const rawAfter = c.req.query("after");
    const { before, after } = parseSnippetWindow(rawBefore, rawAfter, 2);
    const query = c.req.query("q") ?? "";

    const parsedLine = parseSnippetLine(rawLine);
    if (!parsedLine.ok) {
      return failJson(c, parsedLine.statusCode, parsedLine.errorArgs);
    }
    let line = parsedLine.line;

    const loaded = await readFileContentPayload({
      absPath: resolved.absPath,
      requested,
      notFoundCode: "file.not_found",
      readTextFileLimitedFn: readTextFileLimited,
      maxFileBytes: MAX_FILE_BYTES,
    });
    if (!loaded.ok) return failJson(c, loaded.statusCode, loaded.errorArgs);
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
    return c.json(buildFileSnippetResponse({ requested, snippet, matchedBy }));
  });

  app.get("/api/asset", async (c) => {
    const requested = c.req.query("path") ?? "";
    const resolved = resolvePath(c, {
      requested,
      code: "asset.invalid_path",
      userMessage: "Invalid asset path.",
    });
    if (!resolved.ok) return failJson(c, resolved.statusCode, resolved.errorArgs);
    const { absPath } = resolved;

    try {
      const stat = await fs.stat(absPath);
      if (!stat.isFile()) {
        return failJson(c, 404, buildMissingAssetErrorArgs(requested));
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
