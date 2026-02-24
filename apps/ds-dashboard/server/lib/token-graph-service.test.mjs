import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTokenGraphQueryPayload,
  normalizeTokenGraphDepth,
  normalizeTokenGraphDirection,
} from "./token-graph-service.mjs";

test("token-graph-service: normalizeTokenGraphDirection defaults invalid values to both", () => {
  assert.equal(normalizeTokenGraphDirection("dependencies"), "dependencies");
  assert.equal(normalizeTokenGraphDirection("dependents"), "dependents");
  assert.equal(normalizeTokenGraphDirection("both"), "both");
  assert.equal(normalizeTokenGraphDirection("invalid"), "both");
});

test("token-graph-service: normalizeTokenGraphDepth clamps and defaults values", () => {
  assert.equal(normalizeTokenGraphDepth(undefined), 3);
  assert.equal(normalizeTokenGraphDepth("2"), 2);
  assert.equal(normalizeTokenGraphDepth("-1"), 0);
  assert.equal(normalizeTokenGraphDepth("999"), 8);
});

test("token-graph-service: buildTokenGraphQueryPayload builds direct and transitive data", () => {
  const graph = {
    nodes: [
      { id: "a", path: "semantic.color.text.default", slashPath: "semantic/color/text/default", cssVar: "--text-default", displayKey: "text/default", type: "color", collection: "semantic", isCycleMember: false },
      { id: "b", path: "semantic.color.text.hover", slashPath: "semantic/color/text/hover", cssVar: "--text-hover", displayKey: "text/hover", type: "color", collection: "semantic", isCycleMember: false },
      { id: "c", path: "primitives.gray.900", slashPath: "primitives/gray/900", cssVar: "--gray-900", displayKey: "gray/900", type: "color", collection: "primitives", isCycleMember: false },
    ],
    edges: [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
    ],
  };

  const payload = buildTokenGraphQueryPayload({
    graph,
    token: "semantic/color/text/default",
    direction: "both",
    depth: 3,
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.query.resolved_id, "a");
  assert.equal(payload.summary.direct_dependencies, 1);
  assert.equal(payload.summary.transitive_dependencies, 2);
  assert.equal(payload.direct.dependencies[0].id, "b");
});

test("token-graph-service: buildTokenGraphQueryPayload returns null when token does not exist", () => {
  const payload = buildTokenGraphQueryPayload({
    graph: { nodes: [], edges: [] },
    token: "missing/token",
    direction: "both",
    depth: 2,
  });
  assert.equal(payload, null);
});
