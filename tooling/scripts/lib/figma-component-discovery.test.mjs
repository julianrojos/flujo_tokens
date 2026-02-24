import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyTargetKind,
  extractSingleNodeCandidate,
  isKindAllowed,
  resolveSpecExhibitNodeIds,
} from "./figma-component-discovery.mjs";

test("figma-component-discovery: classifies and filters target kinds", () => {
  assert.equal(classifyTargetKind("component_set"), "component_set");
  assert.equal(classifyTargetKind("component"), "component");
  assert.equal(classifyTargetKind("frame"), "unknown");

  assert.equal(isKindAllowed("component", "all"), true);
  assert.equal(isKindAllowed("unknown", "all"), false);
  assert.equal(isKindAllowed("component_set", "component_set"), true);
  assert.equal(isKindAllowed("component", "component_set"), false);
});

test("figma-component-discovery: extracts single node candidate with normalized kind", () => {
  const candidate = extractSingleNodeCandidate(
    {
      nodes: {
        "10:20": {
          document: {
            id: "10:20",
            type: "COMPONENT_SET",
            name: "Button",
          },
        },
      },
    },
    "10:20",
  );

  assert.deepEqual(candidate, {
    node_id: "10:20",
    name: "Button",
    kind: "component_set",
    page_name: null,
  });
});

test("figma-component-discovery: resolves exhibit node ids from specs canvas frame", () => {
  const figmaFilePayload = {
    document: {
      id: "0:0",
      type: "DOCUMENT",
      children: [
        {
          id: "1:0",
          type: "CANVAS",
          name: "Components",
          children: [
            {
              id: "100:1",
              type: "COMPONENT_SET",
              name: "Button",
              children: [],
            },
            {
              id: "200:1",
              type: "FRAME",
              name: "Specs",
              children: [
                {
                  id: "210:1",
                  type: "FRAME",
                  name: "Specification",
                  children: [
                    {
                      id: "220:1",
                      type: "FRAME",
                      name: "Anatomy",
                      children: [{ id: "221:1", type: "FRAME", name: "Exhibit" }],
                    },
                    {
                      id: "230:1",
                      type: "FRAME",
                      name: "Properties",
                      children: [{ id: "231:1", type: "FRAME", name: "Exhibits" }],
                    },
                    {
                      id: "240:1",
                      type: "FRAME",
                      name: "Layout and spacing",
                      children: [{ id: "241:1", type: "FRAME", name: "Selected node" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };

  const result = resolveSpecExhibitNodeIds({
    figmaFilePayload,
    targetNodeId: "100:1",
  });

  assert.deepEqual(result, {
    specsNodeId: "200:1",
    anatomyNodeId: "221:1",
    propertiesNodeId: "231:1",
    layoutNodeId: "241:1",
  });
});
