import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSpecValidationPayload,
  loadTokenRegistry,
  parseYamlSafely,
  persistSpecWithBackup,
  readLatestSpecBackup,
  readTextFileIfExists,
  restoreComponentSpecFromLatestBackup,
  saveEditorialSpecFields,
  saveComponentSpecRaw,
  restoreSpecFromRaw,
  resolveComponentSpecTarget,
  runCommandCapture,
  sanitizeComponentSlug,
  validateComponentSpecRaw,
} from "./component-spec-service.mjs";

test("component-spec-service: sanitizeComponentSlug enforces expected pattern", () => {
  assert.equal(sanitizeComponentSlug("Button_Primary"), "button_primary");
  assert.equal(sanitizeComponentSlug("  badge  "), "badge");
  assert.equal(sanitizeComponentSlug("button-primary"), null);
  assert.equal(sanitizeComponentSlug("../badge"), null);
});

test("component-spec-service: resolveComponentSpecTarget resolves target from docsDir", async () => {
  const result = await resolveComponentSpecTarget(
    {
      repoRoot: "/repo",
      docsDir: "/repo/design-systems/sys-01/docs",
      slug: "button",
    },
    {
      resolveRepoFilePathFn: (_repoRoot, relPath) => `/repo/${relPath}`,
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.specRelPath, "design-systems/sys-01/docs/_spec/components/button.yml");
  assert.equal(result.specAbsPath, "/repo/design-systems/sys-01/docs/_spec/components/button.yml");
});

test("component-spec-service: resolveComponentSpecTarget reports missing/invalid target", async () => {
  const missingDocsDir = await resolveComponentSpecTarget(
    {
      repoRoot: "/repo",
      docsDir: "",
      slug: "button",
    },
    { resolveRepoFilePathFn: () => "/repo/design-systems/sys-01/docs/_spec/components/button.yml" },
  );
  assert.equal(missingDocsDir.ok, false);
  assert.match(missingDocsDir.message, /docs directory.*not configured/i);

  const outsideRepo = await resolveComponentSpecTarget(
    {
      repoRoot: "/repo",
      docsDir: "/repo/design-systems/sys-01/docs",
      slug: "button",
    },
    {
      resolveRepoFilePathFn: () => null,
    },
  );
  assert.equal(outsideRepo.ok, false);
  assert.match(outsideRepo.message, /outside repository root/i);
});

test("component-spec-service: parseYamlSafely returns parse errors", () => {
  const success = parseYamlSafely("name: Button\nstatus: draft\n");
  assert.deepEqual(success.parseError, null);
  assert.equal(success.parsed.name, "Button");

  const failure = parseYamlSafely("name: [");
  assert.equal(failure.parsed, null);
  assert.equal(typeof failure.parseError, "string");
  assert.match(failure.parseError, /yaml|flow|unexpected|missed/i);
});

test("component-spec-service: buildSpecValidationPayload delegates validation and diff", () => {
  const payload = buildSpecValidationPayload(
    {
      slug: "button",
      path: "docs/_spec/components/button.yml",
      raw: "name: button\nstatus: draft\n",
      baselineParsed: { name: "button", status: "draft" },
      tokenRegistry: { tokens: [] },
    },
    {
      validateComponentSpecFn: (parsed, context) => {
        assert.equal(parsed.name, "button");
        assert.deepEqual(context.previousSpec, { name: "button", status: "draft" });
        assert.deepEqual(context.tokenRegistry, { tokens: [] });
        return {
          valid: true,
          blockingIssueCount: 0,
          warningCount: 0,
          issues: [],
        };
      },
      buildSpecDiffFn: (before, after) => [{ before, after }],
      sha256TextFn: (value) => `hash:${value.length}`,
    },
  );

  assert.equal(payload.ok, true);
  assert.equal(payload.rawHash, "hash:27");
  assert.equal(payload.validation.valid, true);
  assert.equal(payload.diff.length, 1);
});

test("component-spec-service: buildSpecValidationPayload returns parse error payload", () => {
  const payload = buildSpecValidationPayload(
    {
      slug: "button",
      path: "docs/_spec/components/button.yml",
      raw: "name: [",
      baselineParsed: null,
      tokenRegistry: null,
    },
    {
      validateComponentSpecFn: () => {
        throw new Error("should not be called");
      },
      buildSpecDiffFn: () => {
        throw new Error("should not be called");
      },
      sha256TextFn: () => "unused",
    },
  );

  assert.equal(payload.ok, true);
  assert.equal(payload.rawHash, null);
  assert.equal(payload.validation.valid, false);
  assert.equal(payload.validation.issues[0].code, "SPEC_YAML_PARSE_ERROR");
});

test("component-spec-service: runCommandCapture maps spawn result", async () => {
  const success = await runCommandCapture(
    {
      cwd: "/repo",
      command: "npm",
      commandArgs: ["run", "ds:registry:refresh"],
    },
    {
      runSpawnWithCaptureFn: async () => ({
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        spawnError: null,
      }),
    },
  );
  assert.deepEqual(success, {
    ok: true,
    code: 0,
    stdout: "ok",
    stderr: "",
  });

  const failure = await runCommandCapture(
    {
      cwd: "/repo",
      command: "npm",
      commandArgs: ["run", "ds:registry:refresh"],
    },
    {
      runSpawnWithCaptureFn: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "failed",
        spawnError: "ENOENT",
      }),
    },
  );
  assert.deepEqual(failure, {
    ok: false,
    code: 1,
    stdout: "",
    stderr: "failed\nENOENT",
  });
});

test("component-spec-service: readTextFileIfExists and loadTokenRegistry handle missing files", async () => {
  const loaded = await readTextFileIfExists("/repo/missing.yml", {
    readFileFn: async () => {
      const error = new Error("missing");
      error.code = "ENOENT";
      throw error;
    },
  });
  assert.deepEqual(loaded, { exists: false, raw: "" });

  const tokenRegistry = await loadTokenRegistry("/repo/missing-token-registry.json", {
    readFileFn: async () => {
      throw new Error("missing");
    },
  });
  assert.equal(tokenRegistry, null);
});

test("component-spec-service: persistSpecWithBackup writes backup and next content atomically", async () => {
  const calls = [];
  const writes = new Map();
  const renamed = [];

  const persisted = await persistSpecWithBackup(
    {
      specAbsPath: "/repo/docs/_spec/components/button.yml",
      specBackupsDirPath: "/repo/docs/_spec/.backups",
      slug: "button",
      currentRaw: "name: button\n",
      currentExists: true,
      nextRaw: "name: button\nstatus: ready\n",
    },
    {
      mkdirFn: async (targetPath) => {
        calls.push(["mkdir", targetPath]);
      },
      writeFileFn: async (targetPath, content) => {
        writes.set(targetPath, content);
      },
      renameFn: async (from, to) => {
        renamed.push([from, to]);
      },
      nowFn: () => new Date("2026-02-24T10:30:00.000Z"),
      nowMsFn: () => 123,
    },
  );

  assert.equal(calls.length, 2);
  assert.match(persisted.backupLatestPath, /button\.last\.yml$/);
  assert.match(persisted.backupTimestampPath, /button\.2026-02-24T10-30-00-000Z\.yml$/);
  assert.equal(writes.get(persisted.backupLatestPath), "name: button\n");
  assert.equal(
    writes.get("/repo/docs/_spec/components/button.yml.tmp-123"),
    "name: button\nstatus: ready\n",
  );
  assert.deepEqual(renamed, [
    ["/repo/docs/_spec/components/button.yml.tmp-123", "/repo/docs/_spec/components/button.yml"],
  ]);
});

test("component-spec-service: readLatestSpecBackup and restoreSpecFromRaw pipeline", async () => {
  const backup = await readLatestSpecBackup(
    {
      specBackupsDirPath: "/repo/docs/_spec/.backups",
      slug: "button",
    },
    {
      statFn: async () => ({ isFile: () => true }),
      readFileFn: async () => "name: button\nstatus: draft\n",
    },
  );
  assert.equal(backup.exists, true);
  assert.match(backup.backupLatestPath, /button\.last\.yml$/);

  const writes = [];
  const renames = [];
  await restoreSpecFromRaw(
    {
      specAbsPath: "/repo/docs/_spec/components/button.yml",
      raw: backup.raw,
    },
    {
      mkdirFn: async () => {},
      writeFileFn: async (targetPath, content) => {
        writes.push([targetPath, content]);
      },
      renameFn: async (from, to) => {
        renames.push([from, to]);
      },
      nowMsFn: () => 777,
    },
  );

  assert.deepEqual(writes, [
    ["/repo/docs/_spec/components/button.yml.tmp-restore-777", "name: button\nstatus: draft\n"],
  ]);
  assert.deepEqual(renames, [
    [
      "/repo/docs/_spec/components/button.yml.tmp-restore-777",
      "/repo/docs/_spec/components/button.yml",
    ],
  ]);
});

test("component-spec-service: restoreComponentSpecFromLatestBackup handles missing backup", async () => {
  const payload = await restoreComponentSpecFromLatestBackup(
    {
      slug: "button",
      specRelPath: "docs/_spec/components/button.yml",
      specAbsPath: "/repo/docs/_spec/components/button.yml",
      repoRoot: "/repo",
      specBackupsDirPath: "/repo/docs/_spec/.backups",
      refreshRegistryAfterRestore: true,
      sha256TextFn: () => "unused",
    },
    {
      readLatestSpecBackupFn: async () => ({ exists: false, backupLatestPath: "", raw: "" }),
      restoreSpecFromRawFn: async () => {
        throw new Error("should not be called");
      },
      runCommandCaptureFn: async () => {
        throw new Error("should not be called");
      },
    },
  );

  assert.equal(payload.ok, false);
  assert.equal(payload.restoredFrom, null);
  assert.equal(payload.message, "No backup file found for this component.");
});

test("component-spec-service: restoreComponentSpecFromLatestBackup restores and refreshes", async () => {
  const restoredCalls = [];
  const refreshCalls = [];
  const payload = await restoreComponentSpecFromLatestBackup(
    {
      slug: "button",
      specRelPath: "docs/_spec/components/button.yml",
      specAbsPath: "/repo/docs/_spec/components/button.yml",
      repoRoot: "/repo",
      specBackupsDirPath: "/repo/docs/_spec/.backups",
      refreshRegistryAfterRestore: true,
      sha256TextFn: (value) => `hash:${value.length}`,
    },
    {
      readLatestSpecBackupFn: async () => ({
        exists: true,
        backupLatestPath: "/repo/docs/_spec/.backups/button.last.yml",
        raw: "name: Button\nstatus: draft\n",
      }),
      restoreSpecFromRawFn: async (args) => {
        restoredCalls.push(args);
      },
      runCommandCaptureFn: async (args) => {
        refreshCalls.push(args);
        return { ok: true, stdout: "ok", stderr: "" };
      },
    },
  );

  assert.equal(payload.ok, true);
  assert.equal(payload.restoredFrom, "docs/_spec/.backups/button.last.yml");
  assert.equal(payload.rawHash, "hash:27");
  assert.equal(payload.refreshed, true);
  assert.equal(payload.refreshOutput, "ok");
  assert.deepEqual(restoredCalls, [
    {
      specAbsPath: "/repo/docs/_spec/components/button.yml",
      raw: "name: Button\nstatus: draft\n",
    },
  ]);
  assert.deepEqual(refreshCalls, [
    {
      cwd: "/repo",
      command: "npm",
      commandArgs: ["run", "ds:registry:refresh"],
    },
  ]);
});

test("component-spec-service: validateComponentSpecRaw returns empty payload for blank input", async () => {
  const payload = await validateComponentSpecRaw(
    {
      slug: "button",
      path: "docs/_spec/components/button.yml",
      raw: "",
      specAbsPath: "/repo/docs/_spec/components/button.yml",
      tokenRegistryPath: "/repo/docs/_generated/token-registry.json",
      maxBytes: 10,
    },
    {
      validateComponentSpecFn: () => {
        throw new Error("should not be called");
      },
      buildSpecDiffFn: () => {
        throw new Error("should not be called");
      },
      sha256TextFn: () => "unused",
    },
  );

  assert.equal(payload.ok, true);
  assert.equal(payload.validation.valid, false);
  assert.equal(payload.validation.issues[0].code, "SPEC_EMPTY");
});

test("component-spec-service: saveComponentSpecRaw returns conflict on hash mismatch", async () => {
  const payload = await saveComponentSpecRaw(
    {
      slug: "button",
      path: "docs/_spec/components/button.yml",
      raw: "name: Button\nstatus: ready\n",
      specAbsPath: "/repo/docs/_spec/components/button.yml",
      specBackupsDirPath: "/repo/docs/_spec/.backups",
      repoRoot: "/repo",
      tokenRegistryPath: "/repo/docs/_generated/token-registry.json",
      expectedHash: "hash:expected",
      confirmRiskyChanges: false,
      refreshRegistryAfterSave: true,
      maxBytes: 1000,
    },
    {
      validateComponentSpecFn: () => {
        throw new Error("should not be called");
      },
      buildSpecDiffFn: () => {
        throw new Error("should not be called");
      },
      sha256TextFn: (value) => `hash:${value.length}`,
      readTextFileIfExistsFn: async () => ({
        exists: true,
        raw: "name: Button\nstatus: draft\n",
      }),
    },
  );

  assert.equal(payload.ok, false);
  assert.equal(payload.validation.issues[0].code, "SPEC_CONFLICT");
  assert.equal(payload.message, "Spec file changed on disk; reload before saving.");
});

test("component-spec-service: saveEditorialSpecFields persists allowed editorial keys", async () => {
  const persistCalls = [];
  const payload = await saveEditorialSpecFields(
    {
      slug: "button",
      path: "docs/_spec/components/button.yml",
      body: {
        expectedHash: null,
        fields: {
          summary: {
            purpose: "Human summary",
            when_to_use: "Use when primary action is needed",
            when_not_to_use: "Do not use for destructive actions",
          },
        },
      },
      specAbsPath: "/repo/docs/_spec/components/button.yml",
      specBackupsDirPath: "/repo/docs/_spec/.backups",
      repoRoot: "/repo",
    },
    {
      sha256TextFn: (value) => `hash:${value.length}`,
      readTextFileIfExistsFn: async () => ({
        exists: true,
        raw: "name: Button\nstatus: draft\nsummary:\n  purpose: old\n",
      }),
      parseYamlSafelyFn: () => ({
        parsed: {
          name: "Button",
          status: "draft",
          summary: { purpose: "old", when_to_use: "old", when_not_to_use: "old" },
          anatomy: [{ id: "container", description: "x" }],
        },
        parseError: null,
      }),
      persistSpecWithBackupFn: async (args) => {
        persistCalls.push(args);
        return { backupLatestPath: "/repo/docs/_spec/.backups/button.last.yml" };
      },
    },
  );

  assert.equal(payload.ok, true);
  assert.equal(payload.slug, "button");
  assert.equal(payload.path, "docs/_spec/components/button.yml");
  assert.equal(payload.savedKeys.length, 1);
  assert.equal(payload.savedKeys[0], "summary");
  assert.equal(payload.backupPath, "docs/_spec/.backups/button.last.yml");
  assert.equal(persistCalls.length, 1);
  assert.match(persistCalls[0].nextRaw, /purpose:\s+Human summary/);
});

test("component-spec-service: saveEditorialSpecFields rejects capture keys", async () => {
  await assert.rejects(
    () =>
      saveEditorialSpecFields(
        {
          slug: "button",
          path: "docs/_spec/components/button.yml",
          body: {
            fields: {
              anatomy: [],
            },
          },
          specAbsPath: "/repo/docs/_spec/components/button.yml",
          specBackupsDirPath: "/repo/docs/_spec/.backups",
          repoRoot: "/repo",
        },
        {
          sha256TextFn: () => "hash",
        },
      ),
    (error) => Number(error?.statusCode) === 400,
  );
});

test("component-spec-service: saveEditorialSpecFields rejects hash mismatch", async () => {
  await assert.rejects(
    () =>
      saveEditorialSpecFields(
        {
          slug: "button",
          path: "docs/_spec/components/button.yml",
          body: {
            expectedHash: "hash:old",
            fields: {
              summary: {
                purpose: "x",
                when_to_use: "y",
                when_not_to_use: "z",
              },
            },
          },
          specAbsPath: "/repo/docs/_spec/components/button.yml",
          specBackupsDirPath: "/repo/docs/_spec/.backups",
          repoRoot: "/repo",
        },
        {
          sha256TextFn: (value) => `hash:${value.length}`,
          readTextFileIfExistsFn: async () => ({
            exists: true,
            raw: "name: Button\nstatus: draft\n",
          }),
        },
      ),
    (error) => Number(error?.statusCode) === 409,
  );
});

test("component-spec-service: saveEditorialSpecFields rejects partial replacement for nested editorial fields", async () => {
  await assert.rejects(
    () =>
      saveEditorialSpecFields(
        {
          slug: "button",
          path: "docs/_spec/components/button.yml",
          body: {
            expectedHash: null,
            fields: {
              accessibility: {
                role: "button",
              },
            },
          },
          specAbsPath: "/repo/docs/_spec/components/button.yml",
          specBackupsDirPath: "/repo/docs/_spec/.backups",
          repoRoot: "/repo",
        },
        {
          sha256TextFn: (value) => `hash:${value.length}`,
          readTextFileIfExistsFn: async () => ({
            exists: true,
            raw: "name: Button\nstatus: draft\n",
          }),
          parseYamlSafelyFn: () => ({
            parsed: { name: "Button", status: "draft" },
            parseError: null,
          }),
        },
      ),
    (error) => Number(error?.statusCode) === 400,
  );
});

test("component-spec-service: saveEditorialSpecFields syncs markdown summary and normalizes multiline purpose", async () => {
  const writes = [];
  const specAbsPath = "/repo/docs/_spec/components/button.yml";
  const markdownAbsPath = "/repo/docs/components/button.md";

  const payload = await saveEditorialSpecFields(
    {
      slug: "button",
      path: "docs/_spec/components/button.yml",
      body: {
        expectedHash: null,
        fields: {
          summary: {
            purpose: "New purpose",
            when_to_use: "- New use",
            when_not_to_use: "- New dont",
          },
        },
      },
      specAbsPath,
      markdownAbsPath,
      markdownRelPath: "docs/components/button.md",
      specBackupsDirPath: "/repo/docs/_spec/.backups",
      repoRoot: "/repo",
    },
    {
      sha256TextFn: (value) => `hash:${value.length}`,
      readTextFileIfExistsFn: async (filePath) => {
        if (filePath === specAbsPath) {
          return {
            exists: true,
            raw: "name: Button\nstatus: draft\nsummary:\n  purpose: old\n",
          };
        }
        if (filePath === markdownAbsPath) {
          return {
            exists: true,
            raw: [
              "# Button",
              "",
              "## Overview",
              "",
              "- Purpose:",
              "  Old multiline purpose line 1",
              "  Old multiline purpose line 2",
              "",
              "## Usage Guidelines",
              "",
              "### When to use",
              "",
              "- Old use",
              "",
              "### When not to use",
              "",
              "- Old dont",
              "",
            ].join("\n"),
          };
        }
        return { exists: false, raw: "" };
      },
      parseYamlSafelyFn: () => ({
        parsed: {
          name: "Button",
          status: "draft",
          summary: { purpose: "old", when_to_use: "old", when_not_to_use: "old" },
        },
        parseError: null,
      }),
      persistSpecWithBackupFn: async () => ({
        backupLatestPath: "/repo/docs/_spec/.backups/button.last.yml",
      }),
      writeFileFn: async (filePath, content) => {
        writes.push({ filePath, content });
      },
    },
  );

  assert.equal(payload.ok, true);
  assert.equal(payload.markdownSynced, true);
  assert.equal(payload.markdownSyncError, null);
  assert.deepEqual(payload.markdownSectionsFound, {
    purpose: true,
    whenToUse: true,
    whenNotToUse: true,
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].filePath, markdownAbsPath);
  assert.match(writes[0].content, /- Purpose: New purpose/);
  assert.doesNotMatch(writes[0].content, /Old multiline purpose line 1/);
  assert.match(writes[0].content, /### When to use[\s\S]*- New use/);
  assert.match(writes[0].content, /### When not to use[\s\S]*- New dont/);
  assert.match(writes[0].content, /\n$/);
  assert.doesNotMatch(writes[0].content, /\n\n$/);
});

test("component-spec-service: saveEditorialSpecFields reports markdown summary sections missing", async () => {
  const writes = [];
  const specAbsPath = "/repo/docs/_spec/components/button.yml";
  const markdownAbsPath = "/repo/docs/components/button.md";

  const payload = await saveEditorialSpecFields(
    {
      slug: "button",
      path: "docs/_spec/components/button.yml",
      body: {
        expectedHash: null,
        fields: {
          summary: {
            purpose: "New purpose",
            when_to_use: "- New use",
            when_not_to_use: "- New dont",
          },
        },
      },
      specAbsPath,
      markdownAbsPath,
      markdownRelPath: "docs/components/button.md",
      specBackupsDirPath: "/repo/docs/_spec/.backups",
      repoRoot: "/repo",
    },
    {
      sha256TextFn: (value) => `hash:${value.length}`,
      readTextFileIfExistsFn: async (filePath) => {
        if (filePath === specAbsPath) {
          return {
            exists: true,
            raw: "name: Button\nstatus: draft\nsummary:\n  purpose: old\n",
          };
        }
        if (filePath === markdownAbsPath) {
          return {
            exists: true,
            raw: ["# Button", "", "No summary sections in this markdown."].join("\n"),
          };
        }
        return { exists: false, raw: "" };
      },
      parseYamlSafelyFn: () => ({
        parsed: {
          name: "Button",
          status: "draft",
          summary: { purpose: "old", when_to_use: "old", when_not_to_use: "old" },
        },
        parseError: null,
      }),
      persistSpecWithBackupFn: async () => ({
        backupLatestPath: "/repo/docs/_spec/.backups/button.last.yml",
      }),
      writeFileFn: async (filePath, content) => {
        writes.push({ filePath, content });
      },
    },
  );

  assert.equal(payload.ok, true);
  assert.equal(payload.markdownSynced, false);
  assert.match(
    String(payload.markdownSyncError || ""),
    /summary sync incomplete/i,
  );
  assert.deepEqual(payload.markdownSectionsFound, {
    purpose: false,
    whenToUse: false,
    whenNotToUse: false,
  });
  assert.equal(writes.length, 0);
});

test("component-spec-service: saveEditorialSpecFields reports markdown summary sync incomplete when one section is missing", async () => {
  const writes = [];
  const specAbsPath = "/repo/docs/_spec/components/button.yml";
  const markdownAbsPath = "/repo/docs/components/button.md";

  const payload = await saveEditorialSpecFields(
    {
      slug: "button",
      path: "docs/_spec/components/button.yml",
      body: {
        expectedHash: null,
        fields: {
          summary: {
            purpose: "New purpose",
            when_to_use: "- New use",
            when_not_to_use: "- New dont",
          },
        },
      },
      specAbsPath,
      markdownAbsPath,
      markdownRelPath: "docs/components/button.md",
      specBackupsDirPath: "/repo/docs/_spec/.backups",
      repoRoot: "/repo",
    },
    {
      sha256TextFn: (value) => `hash:${value.length}`,
      readTextFileIfExistsFn: async (filePath) => {
        if (filePath === specAbsPath) {
          return {
            exists: true,
            raw: "name: Button\nstatus: draft\nsummary:\n  purpose: old\n",
          };
        }
        if (filePath === markdownAbsPath) {
          return {
            exists: true,
            raw: [
              "# Button",
              "",
              "## Overview",
              "",
              "- Purpose: Old purpose",
              "",
              "## Usage Guidelines",
              "",
              "### When to use",
              "",
              "- Old use",
              "",
            ].join("\n"),
          };
        }
        return { exists: false, raw: "" };
      },
      parseYamlSafelyFn: () => ({
        parsed: {
          name: "Button",
          status: "draft",
          summary: { purpose: "old", when_to_use: "old", when_not_to_use: "old" },
        },
        parseError: null,
      }),
      persistSpecWithBackupFn: async () => ({
        backupLatestPath: "/repo/docs/_spec/.backups/button.last.yml",
      }),
      writeFileFn: async (filePath, content) => {
        writes.push({ filePath, content });
      },
    },
  );

  assert.equal(payload.ok, true);
  assert.equal(payload.markdownSynced, false);
  assert.match(String(payload.markdownSyncError || ""), /missing sections/i);
  assert.match(String(payload.markdownSyncError || ""), /when_not_to_use/i);
  assert.deepEqual(payload.markdownSectionsFound, {
    purpose: true,
    whenToUse: true,
    whenNotToUse: false,
  });
  assert.equal(writes.length, 0);
});
