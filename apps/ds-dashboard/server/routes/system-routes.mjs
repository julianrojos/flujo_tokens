import {
  buildCreateDesignSystemConfigMutation,
  buildDeleteDesignSystemConfigMutation,
  buildUpdateDesignSystemConfigMutation,
} from "../lib/system-route-service.mjs";
import {
  buildCreateDesignSystemSuccessPayload,
  buildDeleteDesignSystemSuccessPayload,
  buildNoStoreJsonResponse,
  buildUpdateDesignSystemSuccessPayload,
  collectRemovableSystemPaths,
  decodeSystemRouteId,
  removeExistingPaths,
} from "../lib/system-route-handler-service.mjs";

export function registerSystemRoutes(app, deps) {
  const {
    buildHealthPayload,
    failJson,
    readJsonBody,
    designSystemRepository,
    normalizeSystemId,
    ensureRelativeDir,
    normalizeFigmaApiTokenRef,
    normalizeCollectionList,
    summarizeDesignSystemsConfig,
    resolveSafeSystemPathsForDeletion,
    repoRoot,
    fsSync,
  } = deps;

  app.get("/health", (c) =>
    c.json({
      ok: true,
      ...buildHealthPayload(),
    }),
  );

  app.get("/api/health", (c) => c.json(buildHealthPayload()));

  app.get("/api/design-systems", () => {
    const config = designSystemRepository.getConfig();
    return buildNoStoreJsonResponse(config);
  });

  app.post("/api/design-systems", async (c) => {
    const body = await readJsonBody(c);
    const config = designSystemRepository.getConfig();
    const mutation = buildCreateDesignSystemConfigMutation({
      config,
      body,
      normalizeSystemId,
      ensureRelativeDir,
      normalizeFigmaApiTokenRef,
      normalizeCollectionList,
    });
    if (mutation.error) {
      return failJson(c, mutation.error.status, mutation.error.payload);
    }

    const { nextSystem, nextConfig } = mutation;
    designSystemRepository.saveConfig(nextConfig);
    return c.json(
      buildCreateDesignSystemSuccessPayload({
        nextSystem,
        nextConfig,
        summarizeDesignSystemsConfigFn: summarizeDesignSystemsConfig,
      }),
      200,
    );
  });

  app.put("/api/design-systems/:id", async (c) => {
    const routeSystemId = decodeSystemRouteId(c.req.param("id"));
    const body = await readJsonBody(c);
    const config = designSystemRepository.getConfig();
    const mutation = buildUpdateDesignSystemConfigMutation({
      config,
      routeSystemId,
      body,
      ensureRelativeDir,
      normalizeFigmaApiTokenRef,
      normalizeCollectionList,
    });
    if (mutation.error) {
      return failJson(c, mutation.error.status, mutation.error.payload);
    }
    const { updated, nextConfig } = mutation;
    designSystemRepository.saveConfig(nextConfig);
    return c.json(
      buildUpdateDesignSystemSuccessPayload({
        routeSystemId,
        updated,
        nextConfig,
        summarizeDesignSystemsConfigFn: summarizeDesignSystemsConfig,
      }),
      200,
    );
  });

  app.delete("/api/design-systems/:id", (c) => {
    const routeSystemId = decodeSystemRouteId(c.req.param("id"));
    const config = designSystemRepository.getConfig();
    const mutation = buildDeleteDesignSystemConfigMutation({ config, routeSystemId });
    if (mutation.error) {
      return failJson(c, mutation.error.status, mutation.error.payload);
    }
    const { targetSystem, nextSystems, nextConfig } = mutation;

    const removedPaths = removeExistingPaths(
      collectRemovableSystemPaths({
        targetSystem,
        repoRoot,
        nextSystems,
        resolveSafeSystemPathsForDeletionFn: resolveSafeSystemPathsForDeletion,
      }),
      fsSync,
    );

    designSystemRepository.saveConfig(nextConfig);
    return c.json(
      buildDeleteDesignSystemSuccessPayload({
        removedPaths,
        nextConfig,
        summarizeDesignSystemsConfigFn: summarizeDesignSystemsConfig,
      }),
      200,
    );
  });
}
