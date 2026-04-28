import {
  buildCreateDesignSystemConfigMutation,
  buildDeleteDesignSystemConfigMutation,
  buildUpdateDesignSystemConfigMutation,
} from "./system-route-service.ts";
import { resolveDatabaseProvider } from "../db/pg-db-service.js";
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
  nextSystem.databaseProvider = resolveDatabaseProvider(process.env);
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
    databaseProvider: nextSystem.databaseProvider,
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
  const hasImportSnapshotFields =
    Object.prototype.hasOwnProperty.call(body, "detectedComponentsCount") ||
    Object.prototype.hasOwnProperty.call(body, "importedComponentsCount") ||
    Object.prototype.hasOwnProperty.call(body, "pendingComponentsCount") ||
    Object.prototype.hasOwnProperty.call(body, "importedComponentNames") ||
    Object.prototype.hasOwnProperty.call(body, "pendingComponentNames");
  const updatePatch = {
    name: updated.name,
    appName: updated.appName,
    detectedComponentsCount: updated.detectedComponentsCount,
    importedComponentsCount: updated.importedComponentsCount,
    pendingComponentsCount: updated.pendingComponentsCount,
    importedComponentNames: updated.importedComponentNames,
    pendingComponentNames: updated.pendingComponentNames,
    ...(hasImportSnapshotFields
      ? { databaseProvider: resolveDatabaseProvider(process.env) }
      : {}),
  };
  await designSystemRepository.update(routeSystemId, updatePatch);
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
    dependencyRepo: injectedDependencyRepo,
    pendingOpsRepo: injectedPendingOpsRepo,
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
  let mutationPhase: "none" | "consumers" | "design-system" | "filesystem" = "none";
  let dependencyRepo = injectedDependencyRepo ?? null;
  let preflightConsumers = undefined;
  let preflightFailed = false;
  let pendingOpId = undefined;
  let pendingOpsRepo = injectedPendingOpsRepo ?? null;
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
  if (normalizedFigmaFileId) {
    try {
      if ((!dependencyRepo || !pendingOpsRepo) && db) {
        const [{ DependencyRepository }, { PendingOperationsRepository }] = await Promise.all([
          import("../db/dependency-repository.js"),
          import("../db/pending-operations-repository.js"),
        ]);
        dependencyRepo = dependencyRepo ?? new DependencyRepository(db);
        pendingOpsRepo = pendingOpsRepo ?? new PendingOperationsRepository(db);
      }

      if (dependencyRepo) {
        preflightConsumers = await dependencyRepo.listConsumers(normalizedFigmaFileId);
      }
    } catch (error) {
      console.warn("[handleDeleteDesignSystemRoute] Preflight DB check failed:", error);
      preflightFailed = true;
    }
  }

  if (preflightFailed) {
    return failJson(c, 500, {
      code: "design_system.delete_failed",
      userMessage: "Failed to delete the design system.",
      recoverable: true,
      context: {
        systemId: routeSystemId,
        reason: "Preflight DB check failed before delete could start.",
      },
    });
  }

  if (normalizedFigmaFileId && !pendingOpsRepo) {
    return failJson(c, 500, {
      code: "design_system.delete_failed",
      userMessage: "Failed to delete the design system.",
      recoverable: true,
      context: {
        systemId: routeSystemId,
        reason: "Pending operation repository is unavailable.",
      },
    });
  }

  const removablePaths = collectRemovableSystemPaths({
    targetSystem,
    repoRoot,
    nextSystems,
    resolveSafeSystemPathsForDeletionFn: resolveSafeSystemPathsForDeletion,
  });
  let touchedPaths: string[] = [];

  if (pendingOpsRepo) {
    try {
      pendingOpId = await pendingOpsRepo.start({
        type: "delete_design_system",
        systemId: routeSystemId,
        payload: {
          systemId: routeSystemId,
          routeSystemId,
          figmaFileId: normalizedFigmaFileId || routeSystemId,
          normalizedFigmaFileId,
          repoRoot,
          attemptedChanges: removablePaths,
          preflightConsumerCount: preflightConsumers?.length ?? 0,
        },
      });
    } catch (error) {
      console.warn("[handleDeleteDesignSystemRoute] Failed to start pending op:", {
        systemId: routeSystemId,
        reason: error instanceof Error ? error.message : String(error),
      });
      return failJson(c, 500, {
        code: "design_system.delete_failed",
        userMessage: "Failed to delete the design system.",
        recoverable: true,
        context: {
          systemId: routeSystemId,
          reason: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  try {
    if (dependencyRepo && normalizedFigmaFileId) {
      const deletedConsumers = await dependencyRepo.removeAllByDsFileKey(
        normalizedFigmaFileId,
      );
      deletedConsumersCount = deletedConsumers.deletedConsumerCount;
      deletedConsumerNames = (preflightConsumers || [])
        .map((consumer: { consumer_name?: string | null }) =>
          String(consumer.consumer_name || "").trim(),
        )
        .filter(Boolean);
      consumerCleanupSkipped = false;
      mutationPhase = "consumers";
    } else {
      consumerCleanupSkipped = true;
    }

    await designSystemRepository.delete(routeSystemId);
    mutationPhase = "design-system";
  } catch (error) {
    if (pendingOpsRepo && pendingOpId && mutationPhase === "none") {
      try {
        await pendingOpsRepo.abandon(pendingOpId);
      } catch (abandonError) {
        console.error("[handleDeleteDesignSystemRoute] Failed to abandon pending op:", {
          pendingOpId,
          systemId: routeSystemId,
          reason: abandonError instanceof Error ? abandonError.message : String(abandonError),
        });
      }
    }
    console.warn("[handleDeleteDesignSystemRoute] Delete design system failed; pending op left for reconciliation:", error);
    return failJson(c, 500, {
      code: "design_system.delete_failed",
      userMessage: "Failed to delete the design system.",
      recoverable: true,
      context: {
        systemId: routeSystemId,
        reason: error instanceof Error ? error.message : String(error),
      },
    });
  }

  try {
    await designSystemRepository.setDefaultSystemId(nextConfig.defaultSystem || null);
  } catch (error) {
    console.warn("[handleDeleteDesignSystemRoute] Failed to update default system after delete:", {
      systemId: routeSystemId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  let filesystemCleanupSucceeded = true;
  try {
    const removedPaths = removeExistingPathsWithOptions(removablePaths, fsSync, {
      repoRoot,
      protectedTopLevelDirs: ["docs", "input", "output"],
    });
    const prunedDirs = pruneEmptyAncestorDirs(removablePaths, { repoRoot, fsSync });
    touchedPaths = [...removedPaths, ...prunedDirs];
    mutationPhase = "filesystem";
  } catch (error) {
    filesystemCleanupSucceeded = false;
    console.warn("[handleDeleteDesignSystemRoute] Failed to clean filesystem after delete:", {
      systemId: routeSystemId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  if (filesystemCleanupSucceeded && pendingOpsRepo && pendingOpId) {
    await markPendingOpCompleted();
  }

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
      filesystemCleanupPending: !filesystemCleanupSucceeded,
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
