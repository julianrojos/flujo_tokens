import { buildSpecDiff } from "../../src/lib/spec-diff.ts";
import { validateComponentSpec } from "../../src/lib/spec-validator.ts";
import {
  buildComponentSpecGetPayload,
  buildRestoreComponentSpecRouteArgs,
  buildSaveComponentSpecRouteArgs,
  buildValidateComponentSpecRouteArgs,
} from "../lib/component-spec-route-handler-service.mjs";
import { resolveComponentSpecRequestContext } from "../lib/component-spec-route-service.mjs";
import {
  MAX_COMPONENT_SPEC_BYTES,
  loadTokenRegistry,
  parseYamlSafely,
  persistSpecWithBackup,
  readLatestSpecBackup,
  readTextFileIfExists,
  restoreComponentSpecFromLatestBackup,
  saveComponentSpecRaw,
  restoreSpecFromRaw,
  resolveComponentSpecTarget,
  runCommandCapture,
  sanitizeComponentSlug,
  validateComponentSpecRaw,
} from "./component-spec-service.mjs";

export async function resolveComponentSpecContext(c, deps, requireDevEdit = false) {
  const { getSystemContext, isDevRuntime, resolveRepoFilePath } = deps;
  return resolveComponentSpecRequestContext({
    requireDevEdit,
    systemHeader: c.req.header("x-ds-system"),
    routeSlug: decodeURIComponent(String(c.req.param("slug") || "")),
    getSystemContextFn: getSystemContext,
    isDevRuntimeFn: isDevRuntime,
    sanitizeComponentSlugFn: sanitizeComponentSlug,
    resolveComponentSpecTargetFn: resolveComponentSpecTarget,
    resolveRepoFilePathFn: resolveRepoFilePath,
  });
}

async function withResolvedComponentSpecContext(c, deps, requireDevEdit, run) {
  const { failJson } = deps;
  const resolved = await resolveComponentSpecContext(c, deps, requireDevEdit);
  if (!resolved.ok) return failJson(c, resolved.error.statusCode, resolved.error.args);
  return run(resolved);
}

export async function handleGetComponentSpecRoute(c, deps) {
  const { sha256Text } = deps;
  return withResolvedComponentSpecContext(c, deps, false, async ({ slug, target }) => {
    const loaded = await readTextFileIfExists(target.specAbsPath);
    return c.json(
      buildComponentSpecGetPayload({
        slug,
        specRelPath: target.specRelPath,
        exists: loaded.exists,
        raw: loaded.raw,
        parseYamlSafelyFn: parseYamlSafely,
        sha256TextFn: sha256Text,
      }),
    );
  });
}

export async function handleValidateComponentSpecRoute(c, deps) {
  const { readJsonBody, sha256Text } = deps;
  return withResolvedComponentSpecContext(c, deps, true, async ({ sysCtx, slug, target }) => {
    const body = await readJsonBody(c);
    const validationArgs = buildValidateComponentSpecRouteArgs({
      slug,
      specRelPath: target.specRelPath,
      specAbsPath: target.specAbsPath,
      tokenRegistryPath: sysCtx.tokenRegistryPath,
      maxBytes: MAX_COMPONENT_SPEC_BYTES,
      body,
    });
    const payload = await validateComponentSpecRaw(
      validationArgs,
      {
        readTextFileIfExistsFn: readTextFileIfExists,
        loadTokenRegistryFn: loadTokenRegistry,
        validateComponentSpecFn: validateComponentSpec,
        buildSpecDiffFn: buildSpecDiff,
        sha256TextFn: sha256Text,
      },
    );
    return c.json(payload);
  });
}

export async function handleSaveComponentSpecRoute(c, deps) {
  const { readJsonBody, sha256Text } = deps;
  return withResolvedComponentSpecContext(c, deps, true, async ({ sysCtx, slug, target }) => {
    const body = await readJsonBody(c);
    const saveArgs = buildSaveComponentSpecRouteArgs({
      slug,
      specRelPath: target.specRelPath,
      specAbsPath: target.specAbsPath,
      specBackupsDirPath: sysCtx.specBackupsDirPath,
      repoRoot: sysCtx.repoRoot,
      tokenRegistryPath: sysCtx.tokenRegistryPath,
      maxBytes: MAX_COMPONENT_SPEC_BYTES,
      body,
    });
    const payload = await saveComponentSpecRaw(
      saveArgs,
      {
        readTextFileIfExistsFn: readTextFileIfExists,
        loadTokenRegistryFn: loadTokenRegistry,
        validateComponentSpecFn: validateComponentSpec,
        buildSpecDiffFn: buildSpecDiff,
        sha256TextFn: sha256Text,
        persistSpecWithBackupFn: persistSpecWithBackup,
        runCommandCaptureFn: runCommandCapture,
      },
    );

    return c.json(payload);
  });
}

export async function handleRestoreComponentSpecRoute(c, deps) {
  const { readJsonBody, sha256Text } = deps;
  return withResolvedComponentSpecContext(c, deps, true, async ({ sysCtx, slug, target }) => {
    const body = await readJsonBody(c);
    const restoreArgs = buildRestoreComponentSpecRouteArgs({
      slug,
      specRelPath: target.specRelPath,
      specAbsPath: target.specAbsPath,
      repoRoot: sysCtx.repoRoot,
      specBackupsDirPath: sysCtx.specBackupsDirPath,
      body,
      sha256TextFn: sha256Text,
    });
    const restoredPayload = await restoreComponentSpecFromLatestBackup(
      restoreArgs,
      {
        readLatestSpecBackupFn: readLatestSpecBackup,
        restoreSpecFromRawFn: restoreSpecFromRaw,
        runCommandCaptureFn: runCommandCapture,
      },
    );

    return c.json(restoredPayload);
  });
}
