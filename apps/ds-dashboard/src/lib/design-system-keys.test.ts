import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveDesignSystemContext, resolveDsFileKeyFromConfig } from "./design-system-keys";

describe("resolveDsFileKeyFromConfig", () => {
  it("returns figmaFileId for active system", () => {
    const result = resolveDsFileKeyFromConfig(
      {
        systems: [
          { id: "sys-1", figmaFileId: "FILE_A" },
          { id: "sys-2", figmaFileId: "FILE_B" },
        ],
      },
      "sys-2",
    );

    assert.equal(result, "FILE_B");
  });

  it("returns null when active system has no figmaFileId", () => {
    const result = resolveDsFileKeyFromConfig(
      {
        systems: [{ id: "sys-1" }],
      },
      "sys-1",
    );

    assert.equal(result, null);
  });
});

describe("resolveDesignSystemContext", () => {
  it("prefers active system over default", () => {
    const result = resolveDesignSystemContext(
      {
        defaultSystem: "sys-1",
        systems: [
          { id: "sys-1", figmaFileId: "FILE_A" },
          { id: "sys-2", figmaFileId: "FILE_B" },
        ],
      },
      "sys-2",
    );

    assert.equal(result.systemId, "sys-2");
    assert.equal(result.dsFileKey, "FILE_B");
  });

  it("falls back to default system when active is missing", () => {
    const result = resolveDesignSystemContext(
      {
        defaultSystem: "sys-1",
        systems: [{ id: "sys-1", figmaFileId: "FILE_A" }],
      },
      "",
    );

    assert.equal(result.systemId, "sys-1");
    assert.equal(result.dsFileKey, "FILE_A");
  });

  it("returns empty context when no matching system exists", () => {
    const result = resolveDesignSystemContext(
      {
        defaultSystem: "unknown",
        systems: [{ id: "sys-1", figmaFileId: "FILE_A" }],
      },
      "ghost",
    );

    assert.equal(result.systemId, "");
    assert.equal(result.dsFileKey, null);
  });
});
