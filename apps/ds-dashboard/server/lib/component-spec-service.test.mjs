import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSpecValidationPayload,
  parseYamlSafely,
  resolveComponentSpecTarget,
  runCommandCapture,
  sanitizeComponentSlug,
} from "./component-spec-service.mjs";

test("component-spec-service: sanitizeComponentSlug enforces expected pattern", () => {
  assert.equal(sanitizeComponentSlug("Button_Primary"), "button_primary");
  assert.equal(sanitizeComponentSlug("  badge  "), "badge");
  assert.equal(sanitizeComponentSlug("button-primary"), null);
  assert.equal(sanitizeComponentSlug("../badge"), null);
});

test("component-spec-service: resolveComponentSpecTarget resolves valid registry entry", async () => {
  const registry = {
    components: [
      {
        slug: "button",
        paths: { spec: "docs/_spec/components/button.yml" },
      },
    ],
  };

  const result = await resolveComponentSpecTarget(
    {
      repoRoot: "/repo",
      componentRegistryPath: "/repo/docs/_generated/component-registry.json",
      slug: "button",
    },
    {
      readFileFn: async () => JSON.stringify(registry),
      resolveRepoFilePathFn: (_repoRoot, relPath) => `/repo/${relPath}`,
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.specRelPath, "docs/_spec/components/button.yml");
  assert.equal(result.specAbsPath, "/repo/docs/_spec/components/button.yml");
});

test("component-spec-service: resolveComponentSpecTarget reports missing/invalid target", async () => {
  const registry = {
    components: [{ slug: "button", paths: {} }],
  };

  const missingComponent = await resolveComponentSpecTarget(
    {
      repoRoot: "/repo",
      componentRegistryPath: "/repo/docs/_generated/component-registry.json",
      slug: "badge",
    },
    {
      readFileFn: async () => JSON.stringify(registry),
      resolveRepoFilePathFn: () => "/repo/docs/_spec/components/badge.yml",
    },
  );
  assert.equal(missingComponent.ok, false);
  assert.match(missingComponent.message, /not found/i);

  const missingSpecPath = await resolveComponentSpecTarget(
    {
      repoRoot: "/repo",
      componentRegistryPath: "/repo/docs/_generated/component-registry.json",
      slug: "button",
    },
    {
      readFileFn: async () => JSON.stringify(registry),
      resolveRepoFilePathFn: () => "/repo/docs/_spec/components/button.yml",
    },
  );
  assert.equal(missingSpecPath.ok, false);
  assert.match(missingSpecPath.message, /does not define a spec path/i);

  const outsideRepo = await resolveComponentSpecTarget(
    {
      repoRoot: "/repo",
      componentRegistryPath: "/repo/docs/_generated/component-registry.json",
      slug: "button",
    },
    {
      readFileFn: async () =>
        JSON.stringify({
          components: [{ slug: "button", paths: { spec: "../outside.yml" } }],
        }),
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
