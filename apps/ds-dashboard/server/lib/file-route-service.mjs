export function resolveRequestedRepoPath({
  repoRoot,
  requested,
  resolveRepoFilePathFn,
  code,
  userMessage,
}) {
  const absPath = resolveRepoFilePathFn(repoRoot, requested);
  if (absPath) return { ok: true, absPath };
  return {
    ok: false,
    statusCode: 400,
    errorArgs: {
      code,
      userMessage,
      recoverable: true,
      context: { requested },
    },
  };
}

function parseWindowValue(raw, fallback) {
  const parsed = Number.parseInt(String(raw || ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseSnippetWindow(rawBefore, rawAfter, fallback = 2) {
  return {
    before: parseWindowValue(rawBefore, fallback),
    after: parseWindowValue(rawAfter, fallback),
  };
}

export function parseSnippetLine(rawLine) {
  const parsedLine = rawLine ? Number.parseInt(rawLine, 10) : Number.NaN;
  if (rawLine && !Number.isFinite(parsedLine)) {
    return {
      ok: false,
      statusCode: 400,
      errorArgs: {
        code: "validation.invalid_line_parameter",
        userMessage: "Invalid line parameter.",
        recoverable: true,
        context: { line: rawLine },
      },
    };
  }
  return {
    ok: true,
    line: parsedLine,
  };
}

export async function readFileContentPayload({
  absPath,
  requested,
  notFoundCode,
  readTextFileLimitedFn,
  maxFileBytes,
}) {
  try {
    const payload = await readTextFileLimitedFn(absPath, maxFileBytes);
    return { ok: true, content: payload.content, truncated: payload.truncated };
  } catch (error) {
    const failure = buildNotFoundFileError({
      code: notFoundCode,
      requested,
      error,
    });
    return {
      ok: false,
      statusCode: failure.statusCode,
      errorArgs: failure.errorArgs,
    };
  }
}

export function resolveSnippetTargetLine({ rawLine, content, query, findLineForQueryFn, requested }) {
  if (rawLine) {
    return { ok: true, matchedBy: "line" };
  }

  const detected = findLineForQueryFn(content, query);
  if (detected) {
    return {
      ok: true,
      line: detected,
      matchedBy: "query",
    };
  }

  return {
    ok: false,
    statusCode: 404,
    errorArgs: {
      code: "file.query_not_found",
      userMessage: "Query not found in file.",
      recoverable: true,
      context: { requested, query },
    },
  };
}

export function buildFileContentResponse({ requested, truncated, content }) {
  return {
    ok: true,
    file: requested,
    truncated,
    content,
  };
}

export function buildFileSnippetResponse({ requested, snippet, matchedBy }) {
  return {
    ok: true,
    file: requested,
    line: snippet.targetLine,
    startLine: snippet.startLine,
    endLine: snippet.endLine,
    matchedBy,
    snippet: snippet.snippet,
  };
}

export function buildMissingAssetErrorArgs(requested) {
  return {
    code: "asset.not_found",
    userMessage: "Asset not found.",
    recoverable: true,
    context: { requested },
  };
}

export function buildNotFoundFileError({ code, requested, error }) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    statusCode: 404,
    errorArgs: {
      code,
      userMessage: message,
      recoverable: true,
      context: { requested },
    },
  };
}
