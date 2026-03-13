import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildUpdateActionsProps } from "../src/features/system/design-systems-admin-page-logic";

describe("design-systems-admin-page logic", () => {
  it("builds update actions props without reload callbacks", () => {
    const props = buildUpdateActionsProps({
      systemId: "demo-02",
      figmaFileId: "abc123",
      disabled: true,
    });

    assert.deepEqual(props, {
      systemId: "demo-02",
      figmaFileId: "abc123",
      disabled: true,
    });
    assert.equal("onRunSuccess" in (props as Record<string, unknown>), false);
  });
});
