import test from "node:test";
import assert from "node:assert/strict";

import {
  artifactReadFailureToApiError,
  buildComponentUsageIndex,
  buildTokenCollectionTrees,
  readJsonArtifact,
} from "./registry-artifacts-service.mjs";

test("registry-artifacts-service: readJsonArtifact returns parsed JSON", async () => {
  const result = await readJsonArtifact({
    filePath: "/tmp/token-registry.json",
    artifactName: "token registry",
    readFile: async () => '{"ok":true,"entries":[1]}',
  });

  assert.deepEqual(result, {
    ok: true,
    value: { ok: true, entries: [1] },
  });
});

test("registry-artifacts-service: readJsonArtifact supports allowMissing", async () => {
  const result = await readJsonArtifact({
    filePath: "/tmp/missing.json",
    artifactName: "token registry",
    allowMissing: true,
    missingValue: null,
    readFile: async () => {
      const error = new Error("not found");
      error.code = "ENOENT";
      throw error;
    },
  });

  assert.deepEqual(result, { ok: true, value: null });
});

test("registry-artifacts-service: artifactReadFailureToApiError maps not_found correctly", () => {
  const failure = artifactReadFailureToApiError({
    kind: "not_found",
    artifactName: "component registry",
    filePath: "/repo/docs/_generated/component-registry.json",
  });

  assert.equal(failure.statusCode, 404);
  assert.equal(failure.args.code, "file.not_found");
  assert.match(failure.args.userMessage, /component registry artifact not found/i);
});

test("registry-artifacts-service: buildTokenCollectionTrees groups and sorts tokens", () => {
  const result = buildTokenCollectionTrees([
    {
      collection: "semantic",
      path: "semantic.color.text.default",
      slashPath: "semantic/color/text/default",
    },
    {
      collection: "semantic",
      path: "semantic.color.background.default",
      slashPath: "semantic/color/background/default",
    },
  ]);

  assert.equal(result.summary.collections, 1);
  assert.equal(result.summary.tokens, 2);
  assert.equal(result.collections[0].collection, "semantic");
  assert.equal(result.collections[0].root.children[0].name, "color");
});

test("registry-artifacts-service: buildComponentUsageIndex links related components from spec YAML", () => {
  const rows = [
    { slug: "alert", paths: { spec: "docs/_spec/components/alert.yml" } },
    { slug: "icon", paths: { spec: "docs/_spec/components/icon.yml" } },
  ];

  const specContentByPath = new Map([
    ["/repo/docs/_spec/components/alert.yml", "related_components:\n  - icon\n"],
    ["/repo/docs/_spec/components/icon.yml", "related_components: []\n"],
  ]);

  const result = buildComponentUsageIndex(rows, "/repo", {
    readFileSync: (absPath) => {
      if (!specContentByPath.has(absPath)) throw new Error("missing");
      return specContentByPath.get(absPath);
    },
  });

  assert.deepEqual(result.by_slug.alert.uses, ["icon"]);
  assert.deepEqual(result.by_slug.icon.used_in, ["alert"]);
});
