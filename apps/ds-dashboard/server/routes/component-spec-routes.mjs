import path from "node:path";

import { buildSpecDiff } from "../../src/lib/spec-diff.ts";
import { validateComponentSpec } from "../../src/lib/spec-validator.ts";
import {
  MAX_COMPONENT_SPEC_BYTES,
  buildSpecValidationPayload,
  loadTokenRegistry,
  parseYamlSafely,
  persistSpecWithBackup,
  readLatestSpecBackup,
  readTextFileIfExists,
  restoreSpecFromRaw,
  resolveComponentSpecTarget,
  runCommandCapture,
  sanitizeComponentSlug,
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
    if (!raw.trim()) {
      return c.json({
        ok: true,
        slug,
        path: target.specRelPath,
        rawHash: null,
        parsed: null,
        validation: {
          valid: false,
          blockingIssueCount: 1,
          warningCount: 0,
          issues: [
            {
              severity: "error",
              code: "SPEC_EMPTY",
              path: "$",
              message: "Spec content cannot be empty.",
            },
          ],
        },
        diff: [],
      });
    }

    if (Buffer.byteLength(raw, "utf8") > MAX_COMPONENT_SPEC_BYTES) {
      return c.json({
        ok: true,
        slug,
        path: target.specRelPath,
        rawHash: null,
        parsed: null,
        validation: {
          valid: false,
          blockingIssueCount: 1,
          warningCount: 0,
          issues: [
            {
              severity: "error",
              code: "SPEC_TOO_LARGE",
              path: "$",
              message: `Spec exceeds ${MAX_COMPONENT_SPEC_BYTES} bytes.`,
            },
          ],
        },
        diff: [],
      });
    }

    const currentLoaded = await readTextFileIfExists(target.specAbsPath);
    const currentRaw = currentLoaded.raw;
    const baselineParsed = parseYamlSafely(currentRaw).parsed;
    const tokenRegistry = await loadTokenRegistry(sysCtx.tokenRegistryPath);

    const payload = buildSpecValidationPayload(
      {
        slug,
        path: target.specRelPath,
        raw,
        baselineParsed,
        tokenRegistry,
      },
      {
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

    if (!raw.trim()) {
      return c.json({
        ok: false,
        slug,
        path: target.specRelPath,
        rawHash: null,
        backupPath: null,
        parsed: null,
        validation: {
          valid: false,
          blockingIssueCount: 1,
          warningCount: 0,
          issues: [
            {
              severity: "error",
              code: "SPEC_EMPTY",
              path: "$",
              message: "Spec content cannot be empty.",
            },
          ],
        },
        diff: [],
        message: "Spec content cannot be empty.",
      });
    }

    if (Buffer.byteLength(raw, "utf8") > MAX_COMPONENT_SPEC_BYTES) {
      return c.json({
        ok: false,
        slug,
        path: target.specRelPath,
        rawHash: null,
        backupPath: null,
        parsed: null,
        validation: {
          valid: false,
          blockingIssueCount: 1,
          warningCount: 0,
          issues: [
            {
              severity: "error",
              code: "SPEC_TOO_LARGE",
              path: "$",
              message: `Spec exceeds ${MAX_COMPONENT_SPEC_BYTES} bytes.`,
            },
          ],
        },
        diff: [],
        message: `Spec exceeds ${MAX_COMPONENT_SPEC_BYTES} bytes.`,
      });
    }

    const currentLoaded = await readTextFileIfExists(target.specAbsPath);
    const currentRaw = currentLoaded.raw;
    const currentExists = currentLoaded.exists;

    const currentHash = currentExists ? sha256Text(currentRaw) : null;
    if (expectedHash && expectedHash !== currentHash) {
      return c.json({
        ok: false,
        slug,
        path: target.specRelPath,
        rawHash: currentHash,
        backupPath: null,
        parsed: null,
        validation: {
          valid: false,
          blockingIssueCount: 1,
          warningCount: 0,
          issues: [
            {
              severity: "error",
              code: "SPEC_CONFLICT",
              path: "$",
              message: "Spec file changed on disk since you opened the editor. Reload to merge latest content.",
            },
          ],
        },
        diff: [],
        message: "Spec file changed on disk; reload before saving.",
      });
    }

    const baselineParsed = parseYamlSafely(currentRaw).parsed;
    const tokenRegistry = await loadTokenRegistry(sysCtx.tokenRegistryPath);
    const validationPayload = buildSpecValidationPayload(
      {
        slug,
        path: target.specRelPath,
        raw,
        baselineParsed,
        tokenRegistry,
      },
      {
        validateComponentSpecFn: validateComponentSpec,
        buildSpecDiffFn: buildSpecDiff,
        sha256TextFn: sha256Text,
      },
    );

    if (!validationPayload.validation.valid) {
      return c.json({
        ok: false,
        slug,
        path: target.specRelPath,
        rawHash: currentHash,
        backupPath: null,
        parsed: validationPayload.parsed,
        validation: validationPayload.validation,
        diff: validationPayload.diff,
        message: "Spec has validation errors.",
      });
    }

    const requiresConfirmation = validationPayload.validation.issues.some(
      (issue) => issue.requiresConfirmation === true,
    );
    if (requiresConfirmation && !confirmRiskyChanges) {
      return c.json({
        ok: false,
        slug,
        path: target.specRelPath,
        rawHash: currentHash,
        backupPath: null,
        parsed: validationPayload.parsed,
        validation: validationPayload.validation,
        diff: validationPayload.diff,
        requiresConfirmation: true,
        message: "This change includes risky fields and requires explicit confirmation.",
      });
    }

    const persisted = await persistSpecWithBackup({
      specAbsPath: target.specAbsPath,
      specBackupsDirPath: sysCtx.specBackupsDirPath,
      slug,
      currentRaw,
      currentExists,
      nextRaw: raw,
    });

    let refreshed = false;
    let refreshOutput = "";
    if (refreshRegistryAfterSave) {
      const refresh = await runCommandCapture({
        cwd: sysCtx.repoRoot,
        command: "npm",
        commandArgs: ["run", "ds:registry:refresh"],
      });
      refreshed = refresh.ok;
      refreshOutput = [refresh.stdout, refresh.stderr].filter(Boolean).join("\n").trim();
      if (!refresh.ok) {
        return c.json({
          ok: false,
          slug,
          path: target.specRelPath,
          rawHash: sha256Text(raw),
          backupPath: path.relative(sysCtx.repoRoot, persisted.backupLatestPath),
          parsed: validationPayload.parsed,
          validation: validationPayload.validation,
          diff: validationPayload.diff,
          refreshed,
          refreshOutput,
          message: "Spec saved, but registry refresh failed.",
        });
      }
    }

    return c.json({
      ok: true,
      slug,
      path: target.specRelPath,
      rawHash: sha256Text(raw),
      backupPath: path.relative(sysCtx.repoRoot, persisted.backupLatestPath),
      parsed: validationPayload.parsed,
      validation: validationPayload.validation,
      diff: validationPayload.diff,
      refreshed,
      refreshOutput,
      message: "Spec saved successfully.",
    });
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
    const latestBackup = await readLatestSpecBackup({
      specBackupsDirPath: sysCtx.specBackupsDirPath,
      slug,
    });
    if (!latestBackup.exists) {
      return c.json({
        ok: false,
        slug,
        path: target.specRelPath,
        restoredFrom: null,
        rawHash: null,
        message: "No backup file found for this component.",
      });
    }

    const backupRaw = latestBackup.raw;
    if (!backupRaw.trim()) {
      return c.json({
        ok: false,
        slug,
        path: target.specRelPath,
        restoredFrom: path.relative(sysCtx.repoRoot, latestBackup.backupLatestPath),
        rawHash: null,
        message: "Backup exists but is empty; restore skipped.",
      });
    }

    await restoreSpecFromRaw({
      specAbsPath: target.specAbsPath,
      raw: backupRaw,
    });

    let refreshed = false;
    let refreshOutput = "";
    if (refreshRegistryAfterRestore) {
      const refresh = await runCommandCapture({
        cwd: sysCtx.repoRoot,
        command: "npm",
        commandArgs: ["run", "ds:registry:refresh"],
      });
      refreshed = refresh.ok;
      refreshOutput = [refresh.stdout, refresh.stderr].filter(Boolean).join("\n").trim();
    }

    return c.json({
      ok: true,
      slug,
      path: target.specRelPath,
      restoredFrom: path.relative(sysCtx.repoRoot, latestBackup.backupLatestPath),
      rawHash: sha256Text(backupRaw),
      refreshed,
      refreshOutput,
      message: "Spec restored from latest backup.",
    });
  });
}
