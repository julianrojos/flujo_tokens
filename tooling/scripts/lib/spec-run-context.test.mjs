import assert from "node:assert/strict";
import test from "node:test";

import { createSpecRunContext } from "./spec-run-context.mjs";

test("spec-run-context: creates normalized context from args and system context", () => {
  const result = createSpecRunContext({
    args: {
      url: "https://www.figma.com/design/FILE123/Components?node-id=123-456",
      "component-name": "Alert",
      "spec-root": "/tmp/specs",
      template: "/tmp/specs/_template.yml",
      registry: "/tmp/registry.json",
      force: "true",
      "skip-validation": "false",
      "allow-non-evidence-updates": "false",
      agent: "auto",
    },
    ctx: {
      paths: {
        docs: "/tmp/docs",
        registry: "/tmp/docs/_generated/component-registry.json",
        specs: "/tmp/specs",
        tokenRegistry: "/tmp/docs/_generated/token-registry.json",
      },
    },
  });

  assert.equal(result.componentName, "Alert");
  assert.equal(result.fileKeyFromUrl, "FILE123");
  assert.equal(result.nodeId, "123:456");
  assert.equal(result.outputPath, "/tmp/specs/alert.yml");
  assert.equal(result.registryPath, "/tmp/registry.json");
  assert.equal(result.allowedWritePaths.length, 3);
});

test("spec-run-context: throws when no source is provided", () => {
  assert.throws(() =>
    createSpecRunContext({
      args: {
        "component-name": "",
      },
      ctx: {
        paths: {
          docs: "/tmp/docs",
          registry: "/tmp/docs/_generated/component-registry.json",
          specs: "/tmp/specs",
          tokenRegistry: "/tmp/docs/_generated/token-registry.json",
        },
      },
    }),
  );
});
