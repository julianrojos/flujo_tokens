import {
  artifactReadFailureToApiError,
  readJsonArtifact,
} from "./registry-artifacts-service.mjs";
import {
  buildEmptyComponentsHealthReport,
  buildEmptyTokenHealthReport,
  filterSnapshotsByRange,
  normalizeHealthHistoryPayload,
  normalizeHealthHistoryRange,
} from "./health-artifacts-service.mjs";

async function loadArtifactOrFail(c, args, failJson) {
  const loaded = await readJsonArtifact(args);
  if (loaded.ok) return loaded;
  const failure = artifactReadFailureToApiError(loaded.error);
  return {
    ok: false,
    response: failJson(c, failure.statusCode, failure.args),
  };
}

export async function handleTokenHealthRoute(c, deps) {
  const { failJson, getSystemContext } = deps;
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const loaded = await loadArtifactOrFail(
    c,
    {
      filePath: sysCtx.tokenHealthPath,
      artifactName: "token health",
      allowMissing: true,
      missingValue: null,
    },
    failJson,
  );
  if (!loaded.ok) return loaded.response;
  if (loaded.value !== null) return c.json(loaded.value);
  return c.json(
    buildEmptyTokenHealthReport({
      tokenRegistryPath: sysCtx.tokenRegistryPath,
      tokenUsageIndexPath: sysCtx.tokenUsageIndexPath,
      tokenGraphVizPath: sysCtx.tokenGraphVizPath,
      wcagPairsPath: sysCtx.wcagPairsPath,
      reason: "Token health artifact not found. Run the pipeline or capture components first.",
    }),
  );
}

export async function handleComponentsHealthRoute(c, deps) {
  const { failJson, getSystemContext } = deps;
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const loaded = await loadArtifactOrFail(
    c,
    {
      filePath: sysCtx.componentsHealthPath,
      artifactName: "components health",
      allowMissing: true,
      missingValue: null,
    },
    failJson,
  );
  if (!loaded.ok) return loaded.response;
  if (loaded.value !== null) return c.json(loaded.value);
  return c.json(
    buildEmptyComponentsHealthReport({
      componentRegistryPath: sysCtx.componentRegistryPath,
    }),
  );
}

export async function handleHealthHistoryRoute(c, deps) {
  const { failJson, getSystemContext } = deps;
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const range = normalizeHealthHistoryRange(c.req.query("range"));
  const loaded = await loadArtifactOrFail(
    c,
    {
      filePath: sysCtx.healthHistoryPath,
      artifactName: "health history",
      allowMissing: true,
      missingValue: null,
    },
    failJson,
  );
  if (!loaded.ok) return loaded.response;
  const parsed = normalizeHealthHistoryPayload(loaded.value);
  const snapshots = filterSnapshotsByRange(parsed.snapshots, range);
  return c.json({
    ...parsed,
    snapshots,
    summary: {
      snapshots_total: snapshots.length,
      latest_at: snapshots.length ? snapshots[snapshots.length - 1].captured_at : null,
    },
    range,
  });
}
