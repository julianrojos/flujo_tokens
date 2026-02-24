import { buildSpecDiff } from "../../src/lib/spec-diff.ts";
import { validateComponentSpec } from "../../src/lib/spec-validator.ts";
import {
  MAX_COMPONENT_SPEC_BYTES,
  loadTokenRegistry,
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

export function registerComponentSpecRoutes(app, deps) {
  const {
    failJson,
    getSystemContext,
    isDevRuntime,
    readJsonBody,
    resolveRepoFilePath,
    sha256Text,
  } = deps;

  app.get("/api/component-spec/:slug", async (c) => {
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const slug = sanitizeComponentSlug(decodeURIComponent(String(c.req.param("slug") || "")));
    if (!slug) {
      return failJson(c, 400, {
        code: "validation.invalid_component_slug",
        userMessage: "Invalid component slug.",
        recoverable: true,
        context: { slug: c.req.param("slug") },
      });
    }

    const target = await resolveComponentSpecTarget(
      {
        repoRoot: sysCtx.repoRoot,
        componentRegistryPath: sysCtx.componentRegistryPath,
        slug,
      },
      { resolveRepoFilePathFn: resolveRepoFilePath },
    );
    if (!target.ok) {
      return failJson(c, 404, {
        code: "component_spec.not_found",
        userMessage: target.message,
        recoverable: true,
        context: { slug },
      });
    }

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
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    if (!isDevRuntime()) {
      return failJson(c, 403, {
        code: "component_spec.editing_disabled",
        userMessage: "Spec editing is only enabled in development mode.",
        recoverable: true,
      });
    }

    const slug = sanitizeComponentSlug(decodeURIComponent(String(c.req.param("slug") || "")));
    if (!slug) {
      return failJson(c, 400, {
        code: "validation.invalid_component_slug",
        userMessage: "Invalid component slug.",
        recoverable: true,
        context: { slug: c.req.param("slug") },
      });
    }

    const target = await resolveComponentSpecTarget(
      {
        repoRoot: sysCtx.repoRoot,
        componentRegistryPath: sysCtx.componentRegistryPath,
        slug,
      },
      { resolveRepoFilePathFn: resolveRepoFilePath },
    );
    if (!target.ok) {
      return failJson(c, 404, {
        code: "component_spec.not_found",
        userMessage: target.message,
        recoverable: true,
        context: { slug },
      });
    }

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
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    if (!isDevRuntime()) {
      return failJson(c, 403, {
        code: "component_spec.editing_disabled",
        userMessage: "Spec editing is only enabled in development mode.",
        recoverable: true,
      });
    }

    const slug = sanitizeComponentSlug(decodeURIComponent(String(c.req.param("slug") || "")));
    if (!slug) {
      return failJson(c, 400, {
        code: "validation.invalid_component_slug",
        userMessage: "Invalid component slug.",
        recoverable: true,
        context: { slug: c.req.param("slug") },
      });
    }

    const target = await resolveComponentSpecTarget(
      {
        repoRoot: sysCtx.repoRoot,
        componentRegistryPath: sysCtx.componentRegistryPath,
        slug,
      },
      { resolveRepoFilePathFn: resolveRepoFilePath },
    );
    if (!target.ok) {
      return failJson(c, 404, {
        code: "component_spec.not_found",
        userMessage: target.message,
        recoverable: true,
        context: { slug },
      });
    }

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
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    if (!isDevRuntime()) {
      return failJson(c, 403, {
        code: "component_spec.editing_disabled",
        userMessage: "Spec editing is only enabled in development mode.",
        recoverable: true,
      });
    }

    const slug = sanitizeComponentSlug(decodeURIComponent(String(c.req.param("slug") || "")));
    if (!slug) {
      return failJson(c, 400, {
        code: "validation.invalid_component_slug",
        userMessage: "Invalid component slug.",
        recoverable: true,
        context: { slug: c.req.param("slug") },
      });
    }

    const target = await resolveComponentSpecTarget(
      {
        repoRoot: sysCtx.repoRoot,
        componentRegistryPath: sysCtx.componentRegistryPath,
        slug,
      },
      { resolveRepoFilePathFn: resolveRepoFilePath },
    );
    if (!target.ok) {
      return failJson(c, 404, {
        code: "component_spec.not_found",
        userMessage: target.message,
        recoverable: true,
        context: { slug },
      });
    }

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
