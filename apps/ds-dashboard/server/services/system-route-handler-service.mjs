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
  buildUpdateDesignSystemSuccessPayload,
  collectRemovableSystemPaths,
  decodeSystemRouteId,
  removeExistingPaths,
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

export function handleDeleteDesignSystemRoute(c, deps) {
  const {
    failJson,
    designSystemRepository,
    repoRoot,
    resolveSafeSystemPathsForDeletion,
    fsSync,
    summarizeDesignSystemsConfig,
  } = deps;
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
}
