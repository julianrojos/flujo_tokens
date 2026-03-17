/**
 * System Route Handler Service (JavaScript shim)
 *
 * Re-exports from TypeScript implementation for backward compatibility.
 */

/**
 * @typedef {import('./system-route-handler-service.js').FsSync} FsSync
 * @typedef {import('./system-route-handler-service.js').DesignSystem} DesignSystem
 * @typedef {import('./system-route-handler-service.js').DesignSystemsConfig} DesignSystemsConfig
 * @typedef {import('./system-route-handler-service.js').ScaffoldResult} ScaffoldResult
 * @typedef {import('./system-route-handler-service.js').ResetGlobalArtifactsResult} ResetGlobalArtifactsResult
 */

export {
  isEmptyDir,
  getProtectedRoot,
  pruneEmptyAncestorDirs,
  decodeSystemRouteId,
  buildNoStoreJsonResponse,
  collectRemovableSystemPaths,
  removeExistingPaths,
  buildCreateDesignSystemSuccessPayload,
  buildUpdateDesignSystemSuccessPayload,
  buildDeleteDesignSystemSuccessPayload,
  ensureSystemFilesystemScaffold,
  resetGlobalArtifactsForNoSystems,
} from "./system-route-handler-service.js";
