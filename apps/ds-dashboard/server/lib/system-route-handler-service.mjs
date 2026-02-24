export function decodeSystemRouteId(rawRouteId) {
  return decodeURIComponent(String(rawRouteId || ""));
}

export function buildNoStoreJsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function collectRemovableSystemPaths({
  targetSystem,
  repoRoot,
  nextSystems,
  resolveSafeSystemPathsForDeletionFn,
}) {
  if (!targetSystem) return [];
  return resolveSafeSystemPathsForDeletionFn(targetSystem, repoRoot, nextSystems);
}

export function removeExistingPaths(paths, fsSync) {
  const removed = [];
  for (const targetPath of paths) {
    if (!fsSync.existsSync(targetPath)) continue;
    fsSync.rmSync(targetPath, { recursive: true, force: true });
    removed.push(targetPath);
  }
  return removed;
}

export function buildCreateDesignSystemSuccessPayload({
  nextSystem,
  nextConfig,
  summarizeDesignSystemsConfigFn,
}) {
  return {
    ok: true,
    system: { id: nextSystem.id, name: nextSystem.name },
    config: summarizeDesignSystemsConfigFn(nextConfig),
  };
}

export function buildUpdateDesignSystemSuccessPayload({
  routeSystemId,
  updated,
  nextConfig,
  summarizeDesignSystemsConfigFn,
}) {
  return {
    ok: true,
    system: { id: routeSystemId, name: updated.name },
    config: summarizeDesignSystemsConfigFn(nextConfig),
  };
}

export function buildDeleteDesignSystemSuccessPayload({
  removedPaths,
  nextConfig,
  summarizeDesignSystemsConfigFn,
}) {
  return {
    ok: true,
    removedPaths,
    config: summarizeDesignSystemsConfigFn(nextConfig),
  };
}
