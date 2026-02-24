import fs from "node:fs/promises";

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

  app.get("/api/file", async (c) => {
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const requested = c.req.query("path") ?? c.req.query("file") ?? "";
    const absPath = resolveRepoFilePath(sysCtx.repoRoot, requested);
    if (!absPath) {
      return failJson(c, 400, {
        code: "file.invalid_path",
        userMessage: "Invalid file path.",
        recoverable: true,
        context: { requested },
      });
    }

    try {
      const payload = await readTextFileLimited(absPath, MAX_FILE_BYTES);
      return c.json({
        ok: true,
        file: requested,
        truncated: payload.truncated,
        content: payload.content,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return failJson(c, 404, {
        code: "file.not_found",
        userMessage: message,
        recoverable: true,
        context: { requested },
      });
    }
  });

  app.get("/api/file-snippet", async (c) => {
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const requested = c.req.query("file") ?? "";
    const absPath = resolveRepoFilePath(sysCtx.repoRoot, requested);
    if (!absPath) {
      return failJson(c, 400, {
        code: "file.invalid_path",
        userMessage: "Invalid file path.",
        recoverable: true,
        context: { requested },
      });
    }

    const rawLine = c.req.query("line");
    const rawBefore = c.req.query("before");
    const rawAfter = c.req.query("after");
    const before = rawBefore ? Number.parseInt(rawBefore, 10) : 2;
    const after = rawAfter ? Number.parseInt(rawAfter, 10) : 2;
    const query = c.req.query("q") ?? "";

    let line = rawLine ? Number.parseInt(rawLine, 10) : Number.NaN;
    if (rawLine && !Number.isFinite(line)) {
      return failJson(c, 400, {
        code: "validation.invalid_line_parameter",
        userMessage: "Invalid line parameter.",
        recoverable: true,
        context: { line: rawLine },
      });
    }

    let content = "";
    try {
      const payload = await readTextFileLimited(absPath, MAX_FILE_BYTES);
      content = payload.content;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return failJson(c, 404, {
        code: "file.not_found",
        userMessage: message,
        recoverable: true,
        context: { requested },
      });
    }

    let matchedBy = "line";
    if (!rawLine) {
      const detected = findLineForQuery(content, query);
      if (!detected) {
        return failJson(c, 404, {
          code: "file.query_not_found",
          userMessage: "Query not found in file.",
          recoverable: true,
          context: { requested, query },
        });
      }
      line = detected;
      matchedBy = "query";
    }

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
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const requested = c.req.query("path") ?? "";
    const absPath = resolveRepoFilePath(sysCtx.repoRoot, requested);
    if (!absPath) {
      return failJson(c, 400, {
        code: "asset.invalid_path",
        userMessage: "Invalid asset path.",
        recoverable: true,
        context: { requested },
      });
    }

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
      const message = error instanceof Error ? error.message : String(error);
      return failJson(c, 404, {
        code: "asset.not_found",
        userMessage: message,
        recoverable: true,
        context: { requested },
      });
    }
  });
}
