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
    const systemId = normalizeSystemId(body.id);
    const systemName = String(body.name || "").trim();
    if (!systemId || !systemName) {
      return failJson(c, 400, {
        code: "validation.missing_required_fields",
        userMessage: "Both `id` and `name` are required.",
        recoverable: true,
        context: { required: ["id", "name"] },
      });
    }

    const exists = Array.isArray(config.systems)
      ? config.systems.some((row) => String(row?.id || "").trim() === systemId)
      : false;
    if (exists) {
      return failJson(c, 409, {
        code: "design_system.already_exists",
        userMessage: `System '${systemId}' already exists.`,
        recoverable: true,
        context: { systemId },
      });
    }

    const inputDir = ensureRelativeDir(body.inputDir, `input/${systemId}`);
    const outputDir = ensureRelativeDir(body.outputDir, `output/${systemId}`);
    const docsDir = ensureRelativeDir(body.docsDir, `docs/${systemId}`);
    const nextSystem = {
      id: systemId,
      name: systemName,
      appName: String(body.appName || "").trim() || systemName,
      figmaFileId: String(body.figmaFileId || "").trim(),
      figmaApiToken: normalizeFigmaApiTokenRef(
        body.figmaApiToken,
        `FIGMA_TOKEN_${systemId.toUpperCase().replace(/-/g, "_")}`,
      ),
      inputDir,
      outputDir,
      docsDir,
      collections: normalizeCollectionList(body.collections),
      compileVariablesOnCapture: body.compileVariablesOnCapture !== false,
    };

    const nextSystems = [...(Array.isArray(config.systems) ? config.systems : []), nextSystem];
    const makeDefault = body.makeDefault === true;
    const nextConfig = {
      ...config,
      systems: nextSystems,
      defaultSystem: makeDefault ? systemId : config.defaultSystem || systemId,
    };

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
    const nextSystems = Array.isArray(config.systems) ? [...config.systems] : [];
    const targetIndex = nextSystems.findIndex(
      (row) => String(row?.id || "").trim() === routeSystemId,
    );
    if (targetIndex < 0) {
      return failJson(c, 404, {
        code: "design_system.not_found",
        userMessage: `System '${routeSystemId}' not found.`,
        recoverable: true,
        context: { systemId: routeSystemId },
      });
    }

    const current = nextSystems[targetIndex] || {};
    const normalizedName = String(body.name ?? current.name ?? "").trim();
    if (!normalizedName) {
      return failJson(c, 400, {
        code: "validation.invalid_name",
        userMessage: "System name cannot be empty.",
        recoverable: true,
        context: { field: "name" },
      });
    }

    const updated = {
      ...current,
      id: routeSystemId,
      name: normalizedName,
      appName: String(body.appName ?? current.appName ?? normalizedName).trim() || normalizedName,
      figmaFileId: String(body.figmaFileId ?? current.figmaFileId ?? "").trim(),
      figmaApiToken: normalizeFigmaApiTokenRef(body.figmaApiToken ?? current.figmaApiToken),
      inputDir: ensureRelativeDir(body.inputDir ?? current.inputDir, `input/${routeSystemId}`),
      outputDir: ensureRelativeDir(body.outputDir ?? current.outputDir, `output/${routeSystemId}`),
      docsDir: ensureRelativeDir(body.docsDir ?? current.docsDir, `docs/${routeSystemId}`),
      collections: normalizeCollectionList(body.collections ?? current.collections ?? []),
      compileVariablesOnCapture:
        body.compileVariablesOnCapture !== undefined
          ? body.compileVariablesOnCapture === true
          : current.compileVariablesOnCapture !== false,
    };

    nextSystems[targetIndex] = updated;
    const makeDefault = body.makeDefault === true;
    const nextConfig = {
      ...config,
      systems: nextSystems,
      defaultSystem: makeDefault ? routeSystemId : config.defaultSystem || routeSystemId,
    };
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
    const currentSystems = Array.isArray(config.systems) ? config.systems : [];
    const targetSystem = currentSystems.find(
      (row) => String(row?.id || "").trim() === routeSystemId,
    );
    const nextSystems = currentSystems.filter(
      (row) => String(row?.id || "").trim() !== routeSystemId,
    );
    if (nextSystems.length === currentSystems.length) {
      return failJson(c, 404, {
        code: "design_system.not_found",
        userMessage: `System '${routeSystemId}' not found.`,
        recoverable: true,
        context: { systemId: routeSystemId },
      });
    }
    if (nextSystems.length === 0) {
      return failJson(c, 400, {
        code: "design_system.last_system_protected",
        userMessage: "Cannot delete the last design system.",
        recoverable: true,
        context: { systemId: routeSystemId },
      });
    }

    const nextDefault =
      config.defaultSystem === routeSystemId
        ? String(nextSystems[0]?.id || "")
        : String(config.defaultSystem || nextSystems[0]?.id || "");
    const nextConfig = {
      ...config,
      systems: nextSystems,
      defaultSystem: nextDefault,
    };

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
