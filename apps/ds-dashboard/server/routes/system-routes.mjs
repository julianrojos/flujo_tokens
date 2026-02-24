import {
  buildCreateDesignSystemConfigMutation,
  buildDeleteDesignSystemConfigMutation,
  buildUpdateDesignSystemConfigMutation,
} from "../lib/system-route-service.mjs";

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
    return new Response(JSON.stringify(config), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
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
      {
        ok: true,
        system: { id: nextSystem.id, name: nextSystem.name },
        config: summarizeDesignSystemsConfig(nextConfig),
      },
      200,
    );
  });

  app.put("/api/design-systems/:id", async (c) => {
    const routeSystemId = decodeURIComponent(String(c.req.param("id") || ""));
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
      {
        ok: true,
        system: { id: routeSystemId, name: updated.name },
        config: summarizeDesignSystemsConfig(nextConfig),
      },
      200,
    );
  });

  app.delete("/api/design-systems/:id", (c) => {
    const routeSystemId = decodeURIComponent(String(c.req.param("id") || ""));
    const config = designSystemRepository.getConfig();
    const mutation = buildDeleteDesignSystemConfigMutation({ config, routeSystemId });
    if (mutation.error) {
      return failJson(c, mutation.error.status, mutation.error.payload);
    }
    const { targetSystem, nextSystems, nextConfig } = mutation;

    const removedPaths = targetSystem
      ? resolveSafeSystemPathsForDeletion(targetSystem, repoRoot, nextSystems)
      : [];
    for (const targetPath of removedPaths) {
      if (!fsSync.existsSync(targetPath)) continue;
      fsSync.rmSync(targetPath, { recursive: true, force: true });
    }

    designSystemRepository.saveConfig(nextConfig);
    return c.json(
      {
        ok: true,
        removedPaths,
        config: summarizeDesignSystemsConfig(nextConfig),
      },
      200,
    );
  });
}
