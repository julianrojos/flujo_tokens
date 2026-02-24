import {
  artifactReadFailureToApiError,
  buildComponentUsageIndex,
  buildTokenCollectionTrees,
  readJsonArtifact,
} from "../lib/registry-artifacts-service.mjs";

export function registerRegistryRoutes(app, deps) {
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

  app.get("/api/component-registry", async (c) => {
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const loaded = await loadArtifactOrFail(c, {
      filePath: sysCtx.componentRegistryPath,
      artifactName: "component registry",
    });
    if (!loaded.ok) return loaded.response;
    return c.json(loaded.value);
  });

  app.get("/api/component-usage-index", async (c) => {
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const loaded = await loadArtifactOrFail(c, {
      filePath: sysCtx.componentRegistryPath,
      artifactName: "component registry",
    });
    if (!loaded.ok) return loaded.response;
    const registry = loaded.value;
    const rows = Array.isArray(registry?.components) ? registry.components : [];
    return c.json(buildComponentUsageIndex(rows, sysCtx.repoRoot));
  });

  app.get("/api/token-registry", async (c) => {
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const loaded = await loadArtifactOrFail(c, {
      filePath: sysCtx.tokenRegistryPath,
      artifactName: "token registry",
    });
    if (!loaded.ok) return loaded.response;
    return c.json(loaded.value);
  });

  app.get("/api/token-collection-trees", async (c) => {
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const loaded = await loadArtifactOrFail(c, {
      filePath: sysCtx.tokenRegistryPath,
      artifactName: "token registry",
    });
    if (!loaded.ok) return loaded.response;
    const parsed = loaded.value;
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    return c.json(buildTokenCollectionTrees(entries));
  });
}
