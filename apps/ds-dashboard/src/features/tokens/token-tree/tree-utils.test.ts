import assert from "node:assert";
import { describe, it } from "node:test";

import {
  collectExpandableNodeIds,
  countTokens,
  findExpandedPathByQuery,
  shouldRenderNodeByQuery,
} from "./tree-utils";
import type { TokenTreeNode } from "@/types/token-tree";

const tree: TokenTreeNode = {
  id: "root",
  name: "Root",
  type: "group",
  path: "root",
  children: [
    {
      id: "group",
      name: "Typography",
      type: "group",
      path: "root/typography",
      children: [
        {
          id: "token-1",
          name: "Font Size",
          type: "token",
          path: "root/typography/font-size",
          children: [],
          tokenData: {
            path: "typography.fontSize",
            slashPath: "typography/font-size",
            cssVar: "--typography-font-size",
            type: "dimension",
            resolvedValue: "16px",
            aliasOf: null,
            collection: "core",
          },
        },
      ],
    },
  ],
};

describe("tree-utils", () => {
  it("counts tokens in nested trees", () => {
    assert.equal(countTokens(tree), 1);
  });

  it("collects expandable node ids for non-token nodes", () => {
    const ids = new Set<string>();
    collectExpandableNodeIds(tree, ids);
    assert.deepEqual(Array.from(ids).sort(), ["group", "root"]);
  });

  it("expands ancestors for matching query", () => {
    const expanded = findExpandedPathByQuery([tree], "font");
    assert.deepEqual(Array.from(expanded).sort(), ["group", "root"]);
  });

  it("renders matching descendants only when the query matches", () => {
    assert.equal(shouldRenderNodeByQuery(tree, "font"), true);
    assert.equal(shouldRenderNodeByQuery(tree, "missing"), false);
  });
});
