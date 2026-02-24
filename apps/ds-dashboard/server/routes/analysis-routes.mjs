import fs from "node:fs/promises";
import path from "node:path";

import { computeImpactReport } from "../../src/lib/impact.ts";
import {
  buildImpactFailure,
  loadImpactArtifacts,
  parseImpactRequest,
  parseRefreshQuery,
  parseTokenDiffBeforeRef,
} from "../lib/analysis-route-service.mjs";
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
    const parsedBeforeRef = parseTokenDiffBeforeRef(c.req.query("beforeRef"), validateGitRef);
    if (!parsedBeforeRef.ok) {
      return failJson(c, parsedBeforeRef.statusCode, parsedBeforeRef.errorArgs);
    }
    const { beforeRef } = parsedBeforeRef;

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
    const refresh = parseRefreshQuery(c.req.query("refresh"));
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
    const parsedRequest = parseImpactRequest({
      tokenPathRaw: c.req.query("tokenPath"),
      newValueRaw: c.req.query("newValue"),
      depthRaw: c.req.query("depth"),
    });
    if (!parsedRequest.ok) {
      return failJson(c, parsedRequest.statusCode, parsedRequest.errorArgs);
    }
    const { tokenPath, newValue, depth } = parsedRequest.payload;

    try {
      const impactArtifacts = await loadImpactArtifacts(sysCtx, {
        readFileFn: fs.readFile,
        normalizeImpactWcagPairsFn: normalizeImpactWcagPairs,
      });
      const report = computeImpactReport({
        tokenPath,
        newValue,
        depth,
        ...impactArtifacts,
      });
      return c.json(report);
    } catch (error) {
      const failure = buildImpactFailure(tokenPath, error);
      return failJson(c, failure.statusCode, failure.errorArgs);
    }
  });
}
