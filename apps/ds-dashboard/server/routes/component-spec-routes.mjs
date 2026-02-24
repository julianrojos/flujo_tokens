import { buildSpecDiff } from "../../src/lib/spec-diff.ts";
import { validateComponentSpec } from "../../src/lib/spec-validator.ts";
import {
  buildComponentSpecGetPayload,
  buildRestoreComponentSpecRouteArgs,
  buildSaveComponentSpecRouteArgs,
  buildValidateComponentSpecRouteArgs,
} from "../lib/component-spec-route-handler-service.mjs";
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
} from "../lib/component-spec-service.mjs";
import { resolveComponentSpecRequestContext } from "../lib/component-spec-route-service.mjs";

export function registerComponentSpecRoutes(app, deps) {
  const {
    failJson,
    getSystemContext,
    isDevRuntime,
    readJsonBody,
    resolveRepoFilePath,
    sha256Text,
  } = deps;

  async function resolveRequestContext(c, requireDevEdit = false) {
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

  app.get("/api/component-spec/:slug", async (c) => {
    const resolved = await resolveRequestContext(c, false);
    if (!resolved.ok) {
      return failJson(c, resolved.error.statusCode, resolved.error.args);
    }
    const { slug, target } = resolved;

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

  app.post("/api/component-spec/:slug/validate", async (c) => {
    const resolved = await resolveRequestContext(c, true);
    if (!resolved.ok) {
      return failJson(c, resolved.error.statusCode, resolved.error.args);
    }
    const { sysCtx, slug, target } = resolved;

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

  app.post("/api/component-spec/:slug/save", async (c) => {
    const resolved = await resolveRequestContext(c, true);
    if (!resolved.ok) {
      return failJson(c, resolved.error.statusCode, resolved.error.args);
    }
    const { sysCtx, slug, target } = resolved;

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

  app.post("/api/component-spec/:slug/restore-backup", async (c) => {
    const resolved = await resolveRequestContext(c, true);
    if (!resolved.ok) {
      return failJson(c, resolved.error.statusCode, resolved.error.args);
    }
    const { sysCtx, slug, target } = resolved;

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
