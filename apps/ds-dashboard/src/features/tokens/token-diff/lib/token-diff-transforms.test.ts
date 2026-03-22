/**
 * Tests for token-diff-transforms pure functions
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseTokenPathFromIdentity,
  tokenNodeIdForPath,
  formatImpactCount,
  buildUnresolvedImpact,
  buildGraphImpact,
  summarizeOwners,
  badgeForChange,
  rowTone,
  isRiskyResolvedValueChange,
} from "./token-diff-transforms";

describe("parseTokenPathFromIdentity", () => {
  it("parses valid path identity", () => {
    assert.equal(parseTokenPathFromIdentity("path:color/blue"), "color/blue");
  });

  it("returns null for empty string", () => {
    assert.equal(parseTokenPathFromIdentity(""), null);
  });

  it("returns null for non-path identity", () => {
    assert.equal(parseTokenPathFromIdentity("other:x"), null);
  });

  it("returns null for whitespace only", () => {
    assert.equal(parseTokenPathFromIdentity("   "), null);
  });
});

describe("tokenNodeIdForPath", () => {
  it("prepends path: prefix", () => {
    assert.equal(tokenNodeIdForPath("color/blue"), "path:color/blue");
  });

  it("handles empty path", () => {
    assert.equal(tokenNodeIdForPath(""), "path:");
  });
});

describe("formatImpactCount", () => {
  it("formats number as string", () => {
    assert.equal(formatImpactCount(5), "5");
  });

  it("returns em dash for null", () => {
    assert.equal(formatImpactCount(null), "—");
  });
});

describe("buildGraphImpact", () => {
  it("returns empty arrays for null graph", () => {
    const result = buildGraphImpact(null, "color/blue");
    assert.deepEqual(result, { dependents: [], dependencies: [] });
  });

  it("extracts dependents (edges where target matches)", () => {
    const graph = {
      ok: true,
      source: { registry_path: "" },
      summary: { nodes: 0, edges: 0, cycles: 0, cycle_nodes: 0, unresolved_css_var_refs_total: 0, ambiguous_css_vars_total: 0, graph_collisions: 0 },
      nodes: [],
      edges: [
        { source: "path:color/red", target: "path:color/blue" },
        { source: "path:color/green", target: "path:color/blue" },
      ],
      cycles: [],
      cycle_node_ids: [],
      fingerprint: "",
    };
    const result = buildGraphImpact(graph as any, "color/blue");
    // Results are sorted alphabetically
    assert.deepEqual(result.dependents, ["color/green", "color/red"]);
  });

  it("extracts dependencies (edges where source matches)", () => {
    const graph = {
      ok: true,
      source: { registry_path: "" },
      summary: { nodes: 0, edges: 0, cycles: 0, cycle_nodes: 0, unresolved_css_var_refs_total: 0, ambiguous_css_vars_total: 0, graph_collisions: 0 },
      nodes: [],
      edges: [
        { source: "path:color/blue", target: "path:color/red" },
        { source: "path:color/blue", target: "path:color/green" },
      ],
      cycles: [],
      cycle_node_ids: [],
      fingerprint: "",
    };
    const result = buildGraphImpact(graph as any, "color/blue");
    // Results are sorted alphabetically
    assert.deepEqual(result.dependencies, ["color/green", "color/red"]);
  });

  it("normalizes path: prefix from results", () => {
    const graph = {
      ok: true,
      source: { registry_path: "" },
      summary: { nodes: 0, edges: 0, cycles: 0, cycle_nodes: 0, unresolved_css_var_refs_total: 0, ambiguous_css_vars_total: 0, graph_collisions: 0 },
      nodes: [],
      edges: [{ source: "path:color/red", target: "path:color/blue" }],
      cycles: [],
      cycle_node_ids: [],
      fingerprint: "",
    };
    const result = buildGraphImpact(graph as any, "color/blue");
    assert.ok(!result.dependents[0].startsWith("path:"));
  });
});

describe("buildUnresolvedImpact", () => {
  it("returns empty array for null unresolved", () => {
    const result = buildUnresolvedImpact(null as any, "color/blue");
    assert.deepEqual(result, []);
  });

  it("returns empty array for non-array unresolved", () => {
    const result = buildUnresolvedImpact({} as any, "color/blue");
    assert.deepEqual(result, []);
  });

  it("matches hits by tokenPath", () => {
    const unresolved = [
      { tokenPath: "color/blue", kind: "component", source: "button.tsx", owner: "Button", keyPath: "styles.bg", reason: "token deleted", suggested: null },
      { tokenPath: "color/red", kind: "component", source: "alert.tsx", owner: "Alert", keyPath: "styles.border", reason: "token deleted", suggested: null },
    ];
    const result = buildUnresolvedImpact(unresolved as any, "color/blue");
    assert.equal(result.length, 1);
    assert.equal(result[0].tokenPath, "color/blue");
  });

  it("matches hits by cssVar fallback", () => {
    const unresolved = [
      { tokenPath: "--color-blue", kind: "css", source: "styles.css", owner: "Global", keyPath: "background", reason: "variable undefined", suggested: null },
    ];
    const result = buildUnresolvedImpact(unresolved as any, "color/blue", "--color-blue");
    assert.equal(result.length, 1);
  });

  it("sorts hits by kind|source|owner|keyPath", () => {
    const unresolved = [
      { tokenPath: "color/blue", kind: "b", source: "b", owner: "b", keyPath: "b", reason: "", suggested: null },
      { tokenPath: "color/blue", kind: "a", source: "a", owner: "a", keyPath: "a", reason: "", suggested: null },
    ];
    const result = buildUnresolvedImpact(unresolved as any, "color/blue");
    assert.equal(result[0].kind, "a");
  });
});

describe("summarizeOwners", () => {
  it("counts occurrences per owner", () => {
    const occurrences = [
      { owner: "Button", source: "", detail: "", kind: "" },
      { owner: "Button", source: "", detail: "", kind: "" },
      { owner: "Card", source: "", detail: "", kind: "" },
    ];
    const result = summarizeOwners(occurrences as any, 10);
    assert.equal(result.length, 2);
    assert.equal(result[0].owner, "Button");
    assert.equal(result[0].count, 2);
  });

  it("respects limit", () => {
    const occurrences = [
      { owner: "A", source: "", detail: "", kind: "" },
      { owner: "B", source: "", detail: "", kind: "" },
      { owner: "C", source: "", detail: "", kind: "" },
    ];
    const result = summarizeOwners(occurrences as any, 2);
    assert.equal(result.length, 2);
  });

  it("sorts by count descending, then owner ascending", () => {
    const occurrences = [
      { owner: "B", source: "", detail: "", kind: "" },
      { owner: "A", source: "", detail: "", kind: "" },
      { owner: "A", source: "", detail: "", kind: "" },
    ];
    const result = summarizeOwners(occurrences as any, 10);
    assert.equal(result[0].owner, "A");
    assert.equal(result[1].owner, "B");
  });

  it("ignores empty owner", () => {
    const occurrences = [
      { owner: "", source: "", detail: "", kind: "" },
      { owner: "Button", source: "", detail: "", kind: "" },
    ];
    const result = summarizeOwners(occurrences as any, 10);
    assert.equal(result.length, 1);
  });
});

describe("badgeForChange", () => {
  it("returns warning for breaking changes", () => {
    assert.equal(badgeForChange("added", "breaking"), "warning");
    assert.equal(badgeForChange("removed", "breaking"), "warning");
    assert.equal(badgeForChange("modified", "breaking"), "warning");
  });

  it("returns success for non-breaking added", () => {
    assert.equal(badgeForChange("added", "non-breaking"), "success");
  });

  it("returns warning for non-breaking removed", () => {
    assert.equal(badgeForChange("removed", "non-breaking"), "warning");
  });

  it("returns neutral for non-breaking modified", () => {
    assert.equal(badgeForChange("modified", "non-breaking"), "neutral");
  });
});

describe("rowTone", () => {
  it("returns error bg for removed", () => {
    assert.equal(rowTone("removed", "non-breaking"), "bg-status-error-bg/5");
  });

  it("returns success bg for added", () => {
    assert.equal(rowTone("added", "non-breaking"), "bg-status-success-bg/5");
  });

  it("returns warning bg for breaking", () => {
    assert.equal(rowTone("modified", "breaking"), "bg-status-warning-bg/10");
  });

  it("returns empty string for non-breaking modified", () => {
    assert.equal(rowTone("modified", "non-breaking"), "");
  });
});

describe("isRiskyResolvedValueChange", () => {
  it("returns true if resolvedValue in fields and usage > 0", () => {
    const change = { fields_changed: ["resolvedValue", "description"] };
    assert.equal(isRiskyResolvedValueChange(change, 5), true);
  });

  it("returns false if resolvedValue not in fields", () => {
    const change = { fields_changed: ["description"] };
    assert.equal(isRiskyResolvedValueChange(change, 5), false);
  });

  it("returns false if usage is 0", () => {
    const change = { fields_changed: ["resolvedValue"] };
    assert.equal(isRiskyResolvedValueChange(change, 0), false);
  });

  it("returns false if usage is null", () => {
    const change = { fields_changed: ["resolvedValue"] };
    assert.equal(isRiskyResolvedValueChange(change, null), false);
  });

  it("returns false if fields_changed is undefined", () => {
    const change = {};
    assert.equal(isRiskyResolvedValueChange(change, 5), false);
  });
});
