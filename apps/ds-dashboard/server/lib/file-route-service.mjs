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
