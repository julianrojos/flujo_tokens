import {
  buildCreateDesignSystemConfigMutation,
  buildDeleteDesignSystemConfigMutation,
  buildUpdateDesignSystemConfigMutation,
} from "./system-route-service.ts";
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
} from "../lib/system-route-handler-service.ts";

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

export async function handleListDesignSystemsRoute(_c, deps) {
  const { designSystemRepository } = deps;
  const config = await designSystemRepository.getConfig();
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
    db,
  } = deps;
  const body = await readJsonBody(c);
  const config = await designSystemRepository.getConfig();
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
        reason: error instanceof Error ? error.message : String(error),
      },
    });
  }

  let existingConsumersCount = undefined;
  let existingConsumersCheckFailed = undefined;
  const normalizedFigmaFileId = String(nextSystem?.figmaFileId || "").trim();
  // Non-blocking by design: create can proceed without consumer insights.
  // We surface check failures in the payload via existingConsumersCheckFailed.
  if (db && normalizedFigmaFileId) {
    try {
      const { DependencyRepository } = await import("../db/dependency-repository.js");
      const dependencyRepo = new DependencyRepository(db);
      const existingConsumers = await dependencyRepo.listConsumers(normalizedFigmaFileId);
      existingConsumersCount = existingConsumers.length;
    } catch (dbError) {
      existingConsumersCheckFailed = true;
      console.warn("[handleCreateDesignSystemRoute] Existing-consumer check failed:", dbError);
    }
  }

  await designSystemRepository.create({
    id: nextSystem.id,
    name: nextSystem.name,
    appName: nextSystem.appName,
    figmaFileId: nextSystem.figmaFileId,
    figmaApiToken: nextSystem.figmaApiToken,
    collections: nextSystem.collections,
    detectedComponentsCount: nextSystem.detectedComponentsCount,
    importedComponentsCount: nextSystem.importedComponentsCount,
    pendingComponentsCount: nextSystem.pendingComponentsCount,
    importedComponentNames: nextSystem.importedComponentNames,
    pendingComponentNames: nextSystem.pendingComponentNames,
  });
  await designSystemRepository.setDefaultSystemId(nextConfig.defaultSystem || null);
  return c.json(
    buildCreateDesignSystemSuccessPayload({
      nextSystem,
      nextConfig,
      summarizeDesignSystemsConfigFn: summarizeDesignSystemsConfig,
      existingConsumersCount,
      existingConsumersCheckFailed,
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
    summarizeDesignSystemsConfig,
  } = deps;
  const routeSystemId = decodeSystemRouteId(c.req.param("id"));
  const body = await readJsonBody(c);
  const config = await designSystemRepository.getConfig();
  const mutation = buildUpdateDesignSystemConfigMutation({
    config,
    routeSystemId,
    body,
    ensureRelativeDir,
  });
  if (mutation.error) {
    return failJson(c, mutation.error.status, mutation.error.payload);
  }
  const { updated, nextConfig } = mutation;
  await designSystemRepository.update(routeSystemId, {
    name: updated.name,
    appName: updated.appName,
    detectedComponentsCount: updated.detectedComponentsCount,
    importedComponentsCount: updated.importedComponentsCount,
    pendingComponentsCount: updated.pendingComponentsCount,
    importedComponentNames: updated.importedComponentNames,
    pendingComponentNames: updated.pendingComponentNames,
  });
  await designSystemRepository.setDefaultSystemId(nextConfig.defaultSystem || null);
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
  const config = await designSystemRepository.getConfig();
  const mutation = buildDeleteDesignSystemConfigMutation({ config, routeSystemId });
  if (mutation.error) {
    return failJson(c, mutation.error.status, mutation.error.payload);
  }
  const { targetSystem, nextSystems, nextConfig } = mutation;
  const normalizedFigmaFileId = String(targetSystem?.figmaFileId || "").trim();

  let deletedConsumersCount = undefined;
  let deletedConsumerNames = undefined;
  let consumerCleanupSkipped = undefined;
  let dependencyRepo = null;
  let preflightConsumers = undefined;
  let pendingOpId = undefined;
  let pendingOpsRepo = undefined;
  const markPendingOpAbandoned = async () => {
    if (!pendingOpId || !pendingOpsRepo) return;
    try {
      await pendingOpsRepo.abandon(pendingOpId);
    } catch (error) {
      console.error("[handleDeleteDesignSystemRoute] Failed to abandon pending op:", {
        pendingOpId,
        systemId: routeSystemId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const markPendingOpCompleted = async () => {
    if (!pendingOpId || !pendingOpsRepo) return;
    try {
      await pendingOpsRepo.complete(pendingOpId);
    } catch (error) {
      console.error("[handleDeleteDesignSystemRoute] Failed to complete pending op:", {
        pendingOpId,
        systemId: routeSystemId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // Preflight DB check and WAL insert (before FS changes).
  if (db && normalizedFigmaFileId) {
    try {
      const [{ DependencyRepository }, { PendingOperationsRepository }] = await Promise.all([
        import("../db/dependency-repository.js"),
        import("../db/pending-operations-repository.js"),
      ]);
      dependencyRepo = new DependencyRepository(db);
      pendingOpsRepo = new PendingOperationsRepository(db);

      preflightConsumers = await dependencyRepo.listConsumers(normalizedFigmaFileId);
      if (preflightConsumers.length > 0) {
        const attemptedChanges = collectRemovableSystemPaths({
          targetSystem,
          repoRoot,
          nextSystems,
          resolveSafeSystemPathsForDeletionFn: resolveSafeSystemPathsForDeletion,
        });
        pendingOpId = await pendingOpsRepo.start({
          type: "system.delete",
          systemId: routeSystemId,
          payload: {
            routeSystemId,
            normalizedFigmaFileId,
            repoRoot,
            attemptedChanges,
            preflightConsumerCount: preflightConsumers.length,
          },
        });
      }
    } catch (error) {
      console.warn("[handleDeleteDesignSystemRoute] Preflight DB check failed:", error);
    }
  }

  const removablePaths = collectRemovableSystemPaths({
    targetSystem,
    repoRoot,
    nextSystems,
    resolveSafeSystemPathsForDeletionFn: resolveSafeSystemPathsForDeletion,
  });
  const prunedDirs = pruneEmptyAncestorDirs(removablePaths, { repoRoot, fsSync });
  const removedPaths = removeExistingPathsWithOptions(removablePaths, fsSync, {
    repoRoot,
    protectedTopLevelDirs: ["docs", "input", "output"],
  });
  const touchedPaths = [...removedPaths, ...prunedDirs];

  if (dependencyRepo && normalizedFigmaFileId) {
    try {
      const deletedConsumers = await dependencyRepo.deleteConsumers(normalizedFigmaFileId);
      deletedConsumersCount = deletedConsumers.length;
      deletedConsumerNames = deletedConsumers.map((consumer: { name?: string | null }) => String(consumer.name || '').trim()).filter(Boolean);
      consumerCleanupSkipped = false;
      if (deletedConsumersCount > 0 && pendingOpsRepo && pendingOpId) {
        await markPendingOpCompleted();
      }
    } catch (error) {
      consumerCleanupSkipped = true;
      console.warn("[handleDeleteDesignSystemRoute] Consumer cleanup failed:", error);
      await markPendingOpAbandoned();
    }
  }

  await designSystemRepository.remove(routeSystemId);
  await designSystemRepository.setDefaultSystemId(nextConfig.defaultSystem || null);

  return c.json(
    buildDeleteDesignSystemSuccessPayload({
      routeSystemId,
      nextConfig,
      summarizeDesignSystemsConfigFn: summarizeDesignSystemsConfig,
      removedPaths: touchedPaths,
      preflightConsumers,
      deletedConsumersCount,
      deletedConsumerNames,
      consumerCleanupSkipped,
    }),
    200,
  );
}

export async function handleDeletePreviewRoute(c, deps) {
  const { failJson, resolveSafeSystemPathsForDeletion, fsSync } = deps;
  const routeSystemId = decodeSystemRouteId(c.req.param("id"));
  const removedPaths = resolveSafeSystemPathsForDeletion(routeSystemId, deps.repoRoot, []);
  const prunedDirs = pruneEmptyAncestorDirs(removedPaths, { repoRoot: deps.repoRoot, fsSync });
  const removed = removeExistingPathsWithOptions(removedPaths, fsSync, {
    repoRoot: deps.repoRoot,
    protectedTopLevelDirs: ["docs", "input", "output"],
  });
  return c.json(
    buildDeleteDesignSystemSuccessPayload({
      routeSystemId,
      nextConfig: { defaultSystem: null },
      summarizeDesignSystemsConfigFn: deps.summarizeDesignSystemsConfig,
      removedPaths: [...removed, ...prunedDirs],
    }),
    200,
  );
}
