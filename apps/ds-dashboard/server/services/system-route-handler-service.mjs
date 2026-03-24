import {
  buildCreateDesignSystemConfigMutation,
  buildDeleteDesignSystemConfigMutation,
  buildUpdateDesignSystemConfigMutation,
} from "./system-route-service.mjs";
import {
  buildCreateDesignSystemSuccessPayload,
  buildDeleteDesignSystemSuccessPayload,
  buildNoStoreJsonResponse,
  ensureSystemFilesystemScaffold,
  resetGlobalArtifactsForNoSystems,
  buildUpdateDesignSystemSuccessPayload,
  collectRemovableSystemPaths,
  decodeSystemRouteId,
  removeExistingPathsWithOptions,
  pruneEmptyAncestorDirs,
} from "../lib/system-route-handler-service.mjs";

export function handleLegacyHealthRoute(c, deps) {
  const { buildHealthPayload } = deps;
  return c.json({
    ok: true,
    ...buildHealthPayload(),
  });
}

export function handleApiHealthRoute(c, deps) {
  const { buildHealthPayload } = deps;
  return c.json(buildHealthPayload());
}

export function handleListDesignSystemsRoute(_c, deps) {
  const { designSystemRepository } = deps;
  const config = designSystemRepository.getConfig();
  return buildNoStoreJsonResponse(config);
}

export async function handleCreateDesignSystemRoute(c, deps) {
  const {
    failJson,
    readJsonBody,
    designSystemRepository,
    normalizeSystemId,
    ensureRelativeDir,
    normalizeFigmaApiTokenRef,
    normalizeCollectionList,
    summarizeDesignSystemsConfig,
    repoRoot,
    fsSync,
  } = deps;
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
  try {
    ensureSystemFilesystemScaffold({ nextSystem, repoRoot, fsSync });
  } catch (error) {
    return failJson(c, 500, {
      code: "design_system.bootstrap_failed",
      userMessage: "Failed to initialize filesystem scaffold for the new design system.",
      recoverable: true,
      context: {
        systemId: nextSystem.id,
        docsDir: nextSystem.docsDir,
        reason: error instanceof Error ? error.message : String(error),
      },
    });
  }

  designSystemRepository.saveConfig(nextConfig);
  return c.json(
    buildCreateDesignSystemSuccessPayload({
      nextSystem,
      nextConfig,
      summarizeDesignSystemsConfigFn: summarizeDesignSystemsConfig,
    }),
    200,
  );
}

export async function handleUpdateDesignSystemRoute(c, deps) {
  const {
    failJson,
    readJsonBody,
    designSystemRepository,
    ensureRelativeDir,
    normalizeFigmaApiTokenRef,
    normalizeCollectionList,
    summarizeDesignSystemsConfig,
  } = deps;
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
}

export async function handleDeleteDesignSystemRoute(c, deps) {
  const {
    failJson,
    designSystemRepository,
    repoRoot,
    resolveSafeSystemPathsForDeletion,
    fsSync,
    summarizeDesignSystemsConfig,
    db,
  } = deps;
  const routeSystemId = decodeSystemRouteId(c.req.param("id"));
  const config = designSystemRepository.getConfig();
  const mutation = buildDeleteDesignSystemConfigMutation({ config, routeSystemId });
  if (mutation.error) {
    return failJson(c, mutation.error.status, mutation.error.payload);
  }
  const { targetSystem, nextSystems, nextConfig } = mutation;

  const removedPaths = removeExistingPathsWithOptions(
    collectRemovableSystemPaths({
      targetSystem,
      repoRoot,
      nextSystems,
      resolveSafeSystemPathsForDeletionFn: resolveSafeSystemPathsForDeletion,
    }),
    fsSync,
    {
      repoRoot,
      protectedTopLevelDirs: ["docs", "input", "output"],
    },
  );

  // Prune empty ancestor directories after removing system paths
  const prunedEmptyDirs = pruneEmptyAncestorDirs(removedPaths, { repoRoot, fsSync });

  if (nextSystems.length === 0) {
    try {
      resetGlobalArtifactsForNoSystems({
        repoRoot,
        fsSync,
      });
    } catch (error) {
      return failJson(c, 500, {
        code: "design_system.cleanup_failed",
        userMessage: "Failed to reset global documentation artifacts after removing the last design system.",
        recoverable: true,
        context: {
          reason: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  designSystemRepository.saveConfig(nextConfig);

  // Cascade delete consumers from DB after config/FS deletion
  let deletedConsumersCount = undefined;
  let deletedConsumerNames = undefined;
  if (db && targetSystem?.figmaFileId) {
    try {
      const { DependencyRepository } = await import("../db/dependency-repository.js");
      const dependencyRepo = new DependencyRepository(db);
      const linkedConsumers = dependencyRepo.listConsumers(targetSystem.figmaFileId.trim());
      const consumerNameById = new Map(
        linkedConsumers.map((consumer) => [consumer.id, consumer.consumer_name]),
      );
      const result = dependencyRepo.removeAllByDsFileKey(targetSystem.figmaFileId.trim());
      deletedConsumersCount = result.deletedConsumerCount;
      deletedConsumerNames = result.deletedConsumerIds.map((id) => consumerNameById.get(id) ?? id);
    } catch (dbError) {
      console.warn('[handleDeleteDesignSystemRoute] DB cascade delete failed:', dbError);
      // Continue with response but indicate partial failure
    }
  }

  return c.json(
    buildDeleteDesignSystemSuccessPayload({
      removedPaths,
      prunedEmptyDirs,
      nextConfig,
      summarizeDesignSystemsConfigFn: summarizeDesignSystemsConfig,
      deletedConsumersCount,
      deletedConsumerNames,
    }),
    200,
  );
}

export async function handleDeletePreviewRoute(c, deps) {
  const { failJson, designSystemRepository, db } = deps;
  const routeSystemId = c.req.param("id");
  const normalizedSystemId = decodeSystemRouteId(routeSystemId);

  try {
    const config = designSystemRepository.getConfig();
    const systems = Array.isArray(config?.systems) ? config.systems : [];
    const targetSystem = systems.find(
      (system) => String(system?.id || "").trim() === normalizedSystemId,
    );

    if (!targetSystem) {
      return failJson(c, 404, {
        code: "design_system.not_found",
        userMessage: "Design system not found.",
        context: { systemId: normalizedSystemId },
      });
    }

    const figmaFileId = targetSystem.figmaFileId;
    if (!figmaFileId || !figmaFileId.trim()) {
      return c.json({
        ok: true,
        data: {
          system: { id: targetSystem.id, name: targetSystem.name },
          consumers: [],
          totalConsumerCount: 0,
          counts: { syncRuns: 0, componentUsage: 0, variableUsage: 0, parentVariableUsage: 0 },
        },
      });
    }

    if (!db) {
      return c.json({
        ok: true,
        data: {
          system: { id: targetSystem.id, name: targetSystem.name },
          consumers: [],
          totalConsumerCount: 0,
          counts: { syncRuns: 0, componentUsage: 0, variableUsage: 0, parentVariableUsage: 0 },
        },
      });
    }

    // Dynamic import to avoid .mjs/.ts import issues
    const { DependencyRepository } = await import("../db/dependency-repository.js");
    const dependencyRepo = new DependencyRepository(db);
    const preview = dependencyRepo.getDeletePreview(figmaFileId.trim());

    return c.json({
      ok: true,
      data: {
        system: { id: targetSystem.id, name: targetSystem.name },
        consumers: preview.consumers,
        totalConsumerCount: preview.totalConsumerCount,
        counts: preview.counts,
      },
    });
  } catch (error) {
    return failJson(c, 500, {
      code: "design_system.preview_failed",
      userMessage: "Failed to generate delete preview.",
      context: {
        reason: error instanceof Error ? error.message : String(error),
        systemId: normalizedSystemId,
      },
    });
  }
}
