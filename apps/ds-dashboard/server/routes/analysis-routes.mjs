import fs from "node:fs/promises";
import path from "node:path";

import { computeImpactReport } from "../../src/lib/impact.ts";
import {
  computeNamingDebtReport,
  normalizeImpactWcagPairs,
  runNodeJsonCommandOnce,
  validateGitRef,
} from "../lib/analysis-artifacts-service.mjs";
import {
  artifactReadFailureToApiError,
  readJsonArtifact,
} from "../lib/registry-artifacts-service.mjs";

export function registerAnalysisRoutes(app, deps) {
  const { failJson, getSystemContext } = deps;

  async function loadArtifactOrFail(c, args) {
    const loaded = await readJsonArtifact(args);
    if (loaded.ok) return loaded;
    const failure = artifactReadFailureToApiError(loaded.error);
    return {
      ok: false,
      response: failJson(c, failure.statusCode, failure.args),
    };
  }

  app.get("/api/token-diff", async (c) => {
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const beforeRefRaw = c.req.query("beforeRef") ?? "HEAD~1";
    const beforeRef = validateGitRef(beforeRefRaw);
    if (!beforeRef) {
      return failJson(c, 400, {
        code: "validation.invalid_git_ref",
        userMessage: "Invalid beforeRef. Allowed characters: A-Z a-z 0-9 . _ / ~ ^ -",
        recoverable: true,
        context: { beforeRef: beforeRefRaw },
      });
    }

    const result = await runNodeJsonCommandOnce({
      cwd: sysCtx.repoRoot,
      command: "node",
      commandArgs: [
        sysCtx.tokenDiffScriptPath,
        "--before-ref",
        beforeRef,
        "--format",
        "json",
        "--system",
        sysCtx.systemId,
      ],
      commandLabel: `node tooling/scripts/ds-token-diff.mjs --before-ref ${beforeRef} --format json`,
    });
    return c.json(result.payload, result.statusCode);
  });

  app.get("/api/naming-debt", async (c) => {
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const refresh = String(c.req.query("refresh") ?? "false").trim() === "true";
    if (!refresh) {
      const loaded = await loadArtifactOrFail(c, {
        filePath: sysCtx.namingDebtCachePath,
        artifactName: "naming debt cache",
        allowMissing: true,
        missingValue: null,
      });
      if (!loaded.ok) return loaded.response;
      if (loaded.value && typeof loaded.value === "object") {
        return c.json(loaded.value);
      }
    }

    const report = await computeNamingDebtReport({
      tokenRegistryPath: sysCtx.tokenRegistryPath,
      tokenUsageIndexPath: sysCtx.tokenUsageIndexPath,
      tokenGraphVizPath: sysCtx.tokenGraphVizPath,
      namingDebtConfigPath: sysCtx.namingDebtConfigPath,
    });
    await fs.mkdir(path.dirname(sysCtx.namingDebtCachePath), { recursive: true });
    await fs.writeFile(sysCtx.namingDebtCachePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return c.json(report);
  });

  app.get("/api/impact", async (c) => {
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const tokenPath = String(c.req.query("tokenPath") ?? "").trim();
    if (!tokenPath) {
      return failJson(c, 400, {
        code: "validation.token_path_required",
        userMessage: "tokenPath query param is required.",
        recoverable: true,
        context: { field: "tokenPath" },
      });
    }

    const newValueRaw = c.req.query("newValue");
    const newValue = newValueRaw ? String(newValueRaw).trim() : null;
    const depthRaw = c.req.query("depth");
    const depthParsed = depthRaw ? Number.parseInt(String(depthRaw), 10) : Number.NaN;
    const depth = Number.isFinite(depthParsed) ? depthParsed : undefined;

    const [
      tokenRegistryRaw,
      tokenGraphRaw,
      tokenUsageRaw,
      tokenHealthRaw,
      componentRegistryRaw,
      wcagPairsRaw,
    ] = await Promise.all([
      fs.readFile(sysCtx.tokenRegistryPath, "utf8"),
      fs.readFile(sysCtx.tokenGraphVizPath, "utf8"),
      fs.readFile(sysCtx.tokenUsageIndexPath, "utf8"),
      fs.readFile(sysCtx.tokenHealthPath, "utf8").catch(() => "null"),
      fs.readFile(sysCtx.componentRegistryPath, "utf8").catch(() => "null"),
      fs.readFile(sysCtx.wcagPairsPath, "utf8").catch(() => '{"pairs": []}'),
    ]);

    try {
      const report = computeImpactReport({
        tokenPath,
        newValue,
        depth,
        tokenRegistry: JSON.parse(tokenRegistryRaw),
        tokenGraph: JSON.parse(tokenGraphRaw),
        tokenUsageIndex: JSON.parse(tokenUsageRaw),
        tokenHealth: JSON.parse(tokenHealthRaw),
        componentRegistry: JSON.parse(componentRegistryRaw),
        wcagPairs: normalizeImpactWcagPairs(JSON.parse(wcagPairsRaw)),
      });
      return c.json(report);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const notFound = message.includes("not found");
      return failJson(c, notFound ? 404 : 400, {
        code: notFound ? "impact.token_not_found" : "impact.invalid_request",
        userMessage: message,
        recoverable: true,
        context: { tokenPath },
      });
    }
  });
}
