import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAssetUrl } from "./component-detail-transforms";

describe("buildAssetUrl", () => {
  it("includes the active system id when present", () => {
    const url = buildAssetUrl(
      "design-systems/sys-02/docs/_generated/visual-proofs/images/button.png",
      "cache-key",
      "sys-02",
    );

    assert.equal(
      url,
      "/api/asset?path=design-systems%2Fsys-02%2Fdocs%2F_generated%2Fvisual-proofs%2Fimages%2Fbutton.png&t=cache-key&system=sys-02",
    );
  });

  it("omits the system parameter when it is not provided", () => {
    const url = buildAssetUrl(
      "design-systems/sys-02/docs/_generated/visual-proofs/images/button.png",
    );

    assert.equal(
      url,
      "/api/asset?path=design-systems%2Fsys-02%2Fdocs%2F_generated%2Fvisual-proofs%2Fimages%2Fbutton.png",
    );
  });
});
