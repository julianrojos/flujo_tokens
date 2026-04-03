import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveSafeSystemPathsForDeletion } from "./system-utils.js";

describe("resolveSafeSystemPathsForDeletion", () => {
  it("includes design-systems/<id> root path so delete can remove empty system directory", () => {
    const paths = resolveSafeSystemPathsForDeletion(
      { id: "sys-01" },
      "/repo",
      [{ id: "sys-02" }],
    );

    assert.deepEqual(paths, [
      "/repo/design-systems/sys-01",
      "/repo/design-systems/sys-01/input",
      "/repo/design-systems/sys-01/output",
      "/repo/design-systems/sys-01/docs",
    ]);
  });
});

