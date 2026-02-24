import fs from "node:fs/promises";

export function parseRefreshQuery(raw) {
  return String(raw ?? "false").trim() === "true";
}

export function parseTokenDiffBeforeRef(rawBeforeRef, validateGitRefFn) {
  const beforeRefRaw = rawBeforeRef ?? "HEAD~1";
  const beforeRef = validateGitRefFn(beforeRefRaw);
  if (beforeRef) return { ok: true, beforeRef };
  return {
    ok: false,
    statusCode: 400,
    errorArgs: {
      code: "validation.invalid_git_ref",
      userMessage: "Invalid beforeRef. Allowed characters: A-Z a-z 0-9 . _ / ~ ^ -",
      recoverable: true,
      context: { beforeRef: beforeRefRaw },
    },
  };
}

export function parseImpactRequest({ tokenPathRaw, newValueRaw, depthRaw }) {
  const tokenPath = String(tokenPathRaw ?? "").trim();
  if (!tokenPath) {
    return {
      ok: false,
      statusCode: 400,
      errorArgs: {
        code: "validation.token_path_required",
        userMessage: "tokenPath query param is required.",
        recoverable: true,
        context: { field: "tokenPath" },
      },
    };
  }

  const newValue = newValueRaw ? String(newValueRaw).trim() : null;
  const depthParsed = depthRaw ? Number.parseInt(String(depthRaw), 10) : Number.NaN;
  const depth = Number.isFinite(depthParsed) ? depthParsed : undefined;
  return {
    ok: true,
    payload: { tokenPath, newValue, depth },
  };
}

export async function loadImpactArtifacts(sysCtx, deps = {}) {
  const readFileFn = deps.readFileFn || fs.readFile;
  const normalizeImpactWcagPairsFn = deps.normalizeImpactWcagPairsFn;
  if (typeof normalizeImpactWcagPairsFn !== "function") {
    throw new Error("normalizeImpactWcagPairsFn is required");
  }

  const [
    tokenRegistryRaw,
    tokenGraphRaw,
    tokenUsageRaw,
    tokenHealthRaw,
    componentRegistryRaw,
    wcagPairsRaw,
  ] = await Promise.all([
    readFileFn(sysCtx.tokenRegistryPath, "utf8"),
    readFileFn(sysCtx.tokenGraphVizPath, "utf8"),
    readFileFn(sysCtx.tokenUsageIndexPath, "utf8"),
    readFileFn(sysCtx.tokenHealthPath, "utf8").catch(() => "null"),
    readFileFn(sysCtx.componentRegistryPath, "utf8").catch(() => "null"),
    readFileFn(sysCtx.wcagPairsPath, "utf8").catch(() => '{"pairs": []}'),
  ]);

  return {
    tokenRegistry: JSON.parse(tokenRegistryRaw),
    tokenGraph: JSON.parse(tokenGraphRaw),
    tokenUsageIndex: JSON.parse(tokenUsageRaw),
    tokenHealth: JSON.parse(tokenHealthRaw),
    componentRegistry: JSON.parse(componentRegistryRaw),
    wcagPairs: normalizeImpactWcagPairsFn(JSON.parse(wcagPairsRaw)),
  };
}

export function buildImpactFailure(tokenPath, error) {
  const message = error instanceof Error ? error.message : String(error);
  const notFound = message.includes("not found");
  return {
    statusCode: notFound ? 404 : 400,
    errorArgs: {
      code: notFound ? "impact.token_not_found" : "impact.invalid_request",
      userMessage: message,
      recoverable: true,
      context: { tokenPath },
    },
  };
}
