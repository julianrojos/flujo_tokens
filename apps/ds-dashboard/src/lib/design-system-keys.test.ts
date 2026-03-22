import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveDsFileKeyFromConfig } from "./design-system-keys";

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

