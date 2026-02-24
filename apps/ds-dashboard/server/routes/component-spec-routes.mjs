import { buildSpecDiff } from "../../src/lib/spec-diff.ts";
import { validateComponentSpec } from "../../src/lib/spec-validator.ts";
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
    const { sysCtx, slug, target } = resolved;

    const loaded = await readTextFileIfExists(target.specAbsPath);
    const raw = loaded.raw;
    const exists = loaded.exists;

    const parsedPayload = parseYamlSafely(raw);
    return c.json({
      ok: true,
      slug,
      path: target.specRelPath,
      exists,
      raw,
      rawHash: exists ? sha256Text(raw) : null,
      parsed: parsedPayload.parsed,
      parseError: parsedPayload.parseError,
    });
  });

  app.post("/api/component-spec/:slug/validate", async (c) => {
    const resolved = await resolveRequestContext(c, true);
    if (!resolved.ok) {
      return failJson(c, resolved.error.statusCode, resolved.error.args);
    }
    const { sysCtx, slug, target } = resolved;

    const body = await readJsonBody(c);
    const raw = String(body.raw ?? "");
    const payload = await validateComponentSpecRaw(
      {
        slug,
        path: target.specRelPath,
        raw,
        specAbsPath: target.specAbsPath,
        tokenRegistryPath: sysCtx.tokenRegistryPath,
        maxBytes: MAX_COMPONENT_SPEC_BYTES,
      },
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
    const raw = String(body.raw ?? "");
    const expectedHash =
      body.expectedHash === null || body.expectedHash === undefined
        ? null
        : String(body.expectedHash).trim() || null;
    const refreshRegistryAfterSave = body.refreshRegistry !== false;
    const confirmRiskyChanges = body.confirmRiskyChanges === true;
    const payload = await saveComponentSpecRaw(
      {
        slug,
        path: target.specRelPath,
        raw,
        specAbsPath: target.specAbsPath,
        specBackupsDirPath: sysCtx.specBackupsDirPath,
        repoRoot: sysCtx.repoRoot,
        tokenRegistryPath: sysCtx.tokenRegistryPath,
        expectedHash,
        confirmRiskyChanges,
        refreshRegistryAfterSave,
        maxBytes: MAX_COMPONENT_SPEC_BYTES,
      },
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
    const refreshRegistryAfterRestore = body.refreshRegistry !== false;
    const restoredPayload = await restoreComponentSpecFromLatestBackup(
      {
        slug,
        specRelPath: target.specRelPath,
        specAbsPath: target.specAbsPath,
        repoRoot: sysCtx.repoRoot,
        specBackupsDirPath: sysCtx.specBackupsDirPath,
        refreshRegistryAfterRestore,
        sha256TextFn: sha256Text,
      },
      {
        readLatestSpecBackupFn: readLatestSpecBackup,
        restoreSpecFromRawFn: restoreSpecFromRaw,
        runCommandCaptureFn: runCommandCapture,
      },
    );

    return c.json(restoredPayload);
  });
}
