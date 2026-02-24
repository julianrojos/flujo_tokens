import fs from "node:fs/promises";
import path from "node:path";

import { buildSpecDiff } from "../../src/lib/spec-diff.ts";
import { validateComponentSpec } from "../../src/lib/spec-validator.ts";
import {
  MAX_COMPONENT_SPEC_BYTES,
  buildSpecValidationPayload,
  parseYamlSafely,
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

    let raw = "";
    let exists = true;
    try {
      raw = await fs.readFile(target.specAbsPath, "utf8");
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error ? String(error.code || "") : "";
      if (code === "ENOENT") {
        exists = false;
        raw = "";
      } else {
        throw error;
      }
    }

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

    let currentRaw = "";
    try {
      currentRaw = await fs.readFile(target.specAbsPath, "utf8");
    } catch {
      currentRaw = "";
    }
    const baselineParsed = parseYamlSafely(currentRaw).parsed;
    const tokenRegistryRaw = await fs.readFile(sysCtx.tokenRegistryPath, "utf8").catch(() => "");
    const tokenRegistry = tokenRegistryRaw ? JSON.parse(tokenRegistryRaw) : null;

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

    let currentRaw = "";
    let currentExists = true;
    try {
      currentRaw = await fs.readFile(target.specAbsPath, "utf8");
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error ? String(error.code || "") : "";
      if (code === "ENOENT") {
        currentRaw = "";
        currentExists = false;
      } else {
        throw error;
      }
    }

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
    const tokenRegistryRaw = await fs.readFile(sysCtx.tokenRegistryPath, "utf8").catch(() => "");
    const tokenRegistry = tokenRegistryRaw ? JSON.parse(tokenRegistryRaw) : null;
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

    await fs.mkdir(path.dirname(target.specAbsPath), { recursive: true });
    await fs.mkdir(sysCtx.specBackupsDirPath, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupTimestampPath = path.join(sysCtx.specBackupsDirPath, `${slug}.${timestamp}.yml`);
    const backupLatestPath = path.join(sysCtx.specBackupsDirPath, `${slug}.last.yml`);
    const backupContent = currentExists ? currentRaw : "";
    await fs.writeFile(backupTimestampPath, backupContent, "utf8");
    await fs.writeFile(backupLatestPath, backupContent, "utf8");

    const tempPath = `${target.specAbsPath}.tmp-${Date.now()}`;
    await fs.writeFile(tempPath, raw, "utf8");
    await fs.rename(tempPath, target.specAbsPath);

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
          backupPath: path.relative(sysCtx.repoRoot, backupLatestPath),
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
      backupPath: path.relative(sysCtx.repoRoot, backupLatestPath),
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
    const backupLatestPath = path.join(sysCtx.specBackupsDirPath, `${slug}.last.yml`);
    const backupExists = await fs
      .stat(backupLatestPath)
      .then((stat) => stat.isFile())
      .catch(() => false);

    if (!backupExists) {
      return c.json({
        ok: false,
        slug,
        path: target.specRelPath,
        restoredFrom: null,
        rawHash: null,
        message: "No backup file found for this component.",
      });
    }

    const backupRaw = await fs.readFile(backupLatestPath, "utf8");
    if (!backupRaw.trim()) {
      return c.json({
        ok: false,
        slug,
        path: target.specRelPath,
        restoredFrom: path.relative(sysCtx.repoRoot, backupLatestPath),
        rawHash: null,
        message: "Backup exists but is empty; restore skipped.",
      });
    }

    await fs.mkdir(path.dirname(target.specAbsPath), { recursive: true });
    const tempPath = `${target.specAbsPath}.tmp-restore-${Date.now()}`;
    await fs.writeFile(tempPath, backupRaw, "utf8");
    await fs.rename(tempPath, target.specAbsPath);

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
      restoredFrom: path.relative(sysCtx.repoRoot, backupLatestPath),
      rawHash: sha256Text(backupRaw),
      refreshed,
      refreshOutput,
      message: "Spec restored from latest backup.",
    });
  });
}
