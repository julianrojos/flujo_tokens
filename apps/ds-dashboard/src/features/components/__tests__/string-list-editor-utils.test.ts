import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getAddItemAriaLabel,
  getRemoveItemAriaLabel,
  syncItemIdsByLength,
} from "../../../components/ui/string-list-editor.utils";

describe("string-list-editor a11y labels", () => {
  it("builds contextual add-item labels", () => {
    assert.strictEqual(getAddItemAriaLabel(undefined), "Add item");
    assert.strictEqual(getAddItemAriaLabel("Do"), "Add Do item");
  });

  it("builds contextual remove-item labels with index", () => {
    assert.strictEqual(getRemoveItemAriaLabel(undefined, 0), "Remove item 1");
    assert.strictEqual(getRemoveItemAriaLabel("Don't", 1), "Remove Don't item 2");
  });
});

describe("syncItemIdsByLength", () => {
  it("keeps current ids when length is unchanged", () => {
    const current = ["sli-1", "sli-2"];
    const result = syncItemIdsByLength(current, 2, () => "sli-new");
    assert.strictEqual(result, current);
  });

  it("regenerates ids when length changes", () => {
    let n = 0;
    const result = syncItemIdsByLength(["sli-1"], 3, () => `sli-${n++}`);
    assert.deepStrictEqual(result, ["sli-0", "sli-1", "sli-2"]);
  });
});
