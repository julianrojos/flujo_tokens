import {
  artifactReadFailureToApiError,
  buildComponentUsageIndex,
  buildTokenCollectionTrees,
  readJsonArtifact,
} from "./registry-artifacts-service.mjs";

async function loadArtifactOrFail(c, args, failJson) {
  const loaded = await readJsonArtifact(args);
  if (loaded.ok) return loaded;
  const failure = artifactReadFailureToApiError(loaded.error);
  return {
    ok: false,
    response: failJson(c, failure.statusCode, failure.args),
  };
}

export async function handleComponentRegistryRoute(c, deps) {
  const { failJson, getSystemContext } = deps;
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const loaded = await loadArtifactOrFail(
    c,
    {
      filePath: sysCtx.componentRegistryPath,
      artifactName: "component registry",
    },
    failJson,
  );
  if (!loaded.ok) return loaded.response;
  return c.json(loaded.value);
}

export async function handleComponentUsageIndexRoute(c, deps) {
  const { failJson, getSystemContext } = deps;
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const loaded = await loadArtifactOrFail(
    c,
    {
      filePath: sysCtx.componentRegistryPath,
      artifactName: "component registry",
    },
    failJson,
  );
  if (!loaded.ok) return loaded.response;
  const registry = loaded.value;
  const rows = Array.isArray(registry?.components) ? registry.components : [];
  return c.json(buildComponentUsageIndex(rows, sysCtx.repoRoot));
}

export async function handleTokenRegistryRoute(c, deps) {
  const { failJson, getSystemContext } = deps;
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const loaded = await loadArtifactOrFail(
    c,
    {
      filePath: sysCtx.tokenRegistryPath,
      artifactName: "token registry",
    },
    failJson,
  );
  if (!loaded.ok) return loaded.response;
  return c.json(loaded.value);
}

export async function handleTokenCollectionTreesRoute(c, deps) {
  const { failJson, getSystemContext } = deps;
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const loaded = await loadArtifactOrFail(
    c,
    {
      filePath: sysCtx.tokenRegistryPath,
      artifactName: "token registry",
    },
    failJson,
  );
  if (!loaded.ok) return loaded.response;
  const parsed = loaded.value;
  const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
  return c.json(buildTokenCollectionTrees(entries));
}
