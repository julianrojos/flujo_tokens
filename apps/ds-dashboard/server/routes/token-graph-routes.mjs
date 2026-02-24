import {
  artifactReadFailureToApiError,
  readJsonArtifact,
} from "../lib/registry-artifacts-service.mjs";
import {
  buildTokenGraphQueryPayload,
  normalizeTokenGraphDepth,
  normalizeTokenGraphDirection,
} from "../lib/token-graph-service.mjs";

export function registerTokenGraphRoutes(app, deps) {
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

  app.get("/api/token-usage-index", async (c) => {
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const loaded = await loadArtifactOrFail(c, {
      filePath: sysCtx.tokenUsageIndexPath,
      artifactName: "token usage index",
    });
    if (!loaded.ok) return loaded.response;
    return c.json(loaded.value);
  });

  app.get("/api/token-graph", async (c) => {
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const loaded = await loadArtifactOrFail(c, {
      filePath: sysCtx.tokenGraphVizPath,
      artifactName: "token graph",
    });
    if (!loaded.ok) return loaded.response;
    return c.json(loaded.value);
  });

  app.get("/api/token-graph-query", async (c) => {
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const token = String(c.req.query("token") ?? c.req.query("tokenPath") ?? "").trim();
    if (!token) {
      return failJson(c, 400, {
        code: "validation.token_required",
        userMessage: "token query param is required.",
        recoverable: true,
        context: { field: "token" },
      });
    }

    const direction = normalizeTokenGraphDirection(c.req.query("direction"));
    const depth = normalizeTokenGraphDepth(c.req.query("depth"));
    const loaded = await loadArtifactOrFail(c, {
      filePath: sysCtx.tokenGraphVizPath,
      artifactName: "token graph",
    });
    if (!loaded.ok) return loaded.response;
    const graph = loaded.value;
    const payload = buildTokenGraphQueryPayload({ graph, token, direction, depth });
    if (!payload) {
      return failJson(c, 404, {
        code: "token_graph.token_not_found",
        userMessage: `Token '${token}' not found in token graph.`,
        recoverable: true,
        context: { token },
      });
    }
    return c.json(payload);
  });
}
