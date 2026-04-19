import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getTopComponentTokenDebt } from "./component-token-debt";

describe("getTopComponentTokenDebt", () => {
  it("sorts components by unresolved layer count and limits results", () => {
    const rows = getTopComponentTokenDebt(
      {
        schema_version: 1,
        components: [
          {
            slug: "alpha",
            display_name: "Alpha",
            paths: { spec: "" },
            spec: { exists: true },
            figma: {
              file_url: null,
              component_set_node_id: null,
              token_bindings: [
                { node_id: "1", node_name: "A", field: "fills", variable_id: "v1", status: "unresolved" },
                { node_id: "2", node_name: "B", field: "strokes", variable_id: "v2", status: "resolved" },
              ],
            },
            fingerprint_sha256: "a",
          },
          {
            slug: "beta",
            display_name: "Beta",
            paths: { spec: "" },
            spec: { exists: false },
            figma: {
              file_url: null,
              component_set_node_id: null,
              token_bindings: [
                { node_id: "3", node_name: "C", field: "fills", variable_id: "v3", token_path: null },
                { node_id: "4", node_name: "D", field: "strokes", variable_id: "v4", token_path: "" },
              ],
            },
            fingerprint_sha256: "b",
          },
          {
            slug: "gamma",
            display_name: "Gamma",
            paths: { spec: "" },
            spec: { exists: false },
            figma: {
              file_url: null,
              component_set_node_id: null,
              token_bindings: [
                { node_id: "5", node_name: "E", field: "fills", variable_id: "v5", status: "resolved" },
              ],
            },
            fingerprint_sha256: "c",
          },
        ],
        summary: { total_components: 3, with_spec: 0, with_editorial: 0 },
        fingerprint_sha256: "summary",
      },
      2,
    );

    assert.deepEqual(rows, [
      { slug: "beta", displayName: "Beta", unresolvedCount: 2 },
      { slug: "alpha", displayName: "Alpha", unresolvedCount: 1 },
    ]);
  });
});
