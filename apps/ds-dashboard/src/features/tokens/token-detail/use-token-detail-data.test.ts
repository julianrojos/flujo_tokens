import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { VariableUsageReport } from "@/types/consumers";
import type { TokenEntry, TokenRegistry } from "@/types/token-registry";
import {
  buildFigmaConsumerUsageOccurrences,
  collectAliasDescendantPaths,
} from "./lib/token-detail-usage-derivation";

function makeToken(overrides: Partial<TokenEntry>): TokenEntry {
  return {
    path: "color.background.base",
    slashPath: "color/background/base",
    cssVar: "--color-background-base",
    type: "color",
    resolvedValue: "#000000",
    collection: "semantic",
    ...overrides,
  };
}

function buildRegistry(entries: TokenEntry[]): TokenRegistry {
  const byPath: Record<string, TokenEntry> = {};
  const bySlashPath: Record<string, TokenEntry> = {};
  const byVariableId: Record<string, TokenEntry> = {};
  for (const entry of entries) {
    byPath[entry.path] = entry;
    bySlashPath[entry.slashPath] = entry;
  }
  return { entries, byPath, bySlashPath, byVariableId };
}

function makeReport(variableName: string, nodeCount = 1): VariableUsageReport {
  return {
    variableKey: `key-${variableName}`,
    variableName,
    variableType: "COLOR",
    totalNodes: nodeCount,
    impactLevel: { level: "LOW", description: "test" },
    sampleLinks: [],
    consumers: [
      {
        consumerId: "parent:file",
        consumerName: "Parent file",
        consumerFileKey: "parent-key",
        nodeCount,
        sampleNodeIds: [],
        sampleLinks: [],
        lastSyncedAt: new Date(0).toISOString(),
      },
    ],
  };
}

describe("token detail alias traversal", () => {
  it("collects second-degree alias descendants in BFS order", () => {
    const base = makeToken({
      path: "color.background.accent",
      slashPath: "color/background/accent",
      cssVar: "--color-background-accent",
    });
    const alias1 = makeToken({
      path: "color.background.accent.soft",
      slashPath: "color/background/accent/soft",
      cssVar: "--color-background-accent-soft",
      aliasOf: base.path,
    });
    const alias2 = makeToken({
      path: "color.background.accent.soft.hover",
      slashPath: "color/background/accent/soft/hover",
      cssVar: "--color-background-accent-soft-hover",
      aliasOf: alias1.path,
    });
    const registry = buildRegistry([base, alias1, alias2]);

    const descendants = collectAliasDescendantPaths(registry, base.path);
    assert.deepEqual(descendants, [alias1.path, alias2.path]);
  });

  it("matches report through second-degree alias as via_alias", () => {
    const base = makeToken({
      path: "color.background.accent",
      slashPath: "color/background/accent",
      cssVar: "--color-background-accent",
    });
    const alias1 = makeToken({
      path: "color.background.accent.soft",
      slashPath: "color/background/accent/soft",
      cssVar: "--color-background-accent-soft",
      aliasOf: base.path,
    });
    const alias2 = makeToken({
      path: "color.background.accent.soft.hover",
      slashPath: "color/background/accent/soft/hover",
      cssVar: "--color-background-accent-soft-hover",
      aliasOf: alias1.path,
    });
    const registry = buildRegistry([base, alias1, alias2]);

    const usage = buildFigmaConsumerUsageOccurrences({
      tokenPath: base.path,
      registry,
      consumerVariableReports: [makeReport(alias2.slashPath, 3)],
    });

    assert.equal(usage.parentCount, 3);
    assert.equal(usage.parentOccurrences.length, 1);
    assert.match(usage.parentOccurrences[0].detail, /\bmode:via_alias\b/i);
    assert.match(usage.parentOccurrences[0].detail, new RegExp(`\\balias:${alias2.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
  });

  it("does not loop indefinitely on cyclic alias graph", () => {
    const a = makeToken({
      path: "color.background.a",
      slashPath: "color/background/a",
      cssVar: "--color-background-a",
      aliasOf: "color.background.c",
    });
    const b = makeToken({
      path: "color.background.b",
      slashPath: "color/background/b",
      cssVar: "--color-background-b",
      aliasOf: a.path,
    });
    const c = makeToken({
      path: "color.background.c",
      slashPath: "color/background/c",
      cssVar: "--color-background-c",
      aliasOf: b.path,
    });
    const registry = buildRegistry([a, b, c]);

    const descendants = collectAliasDescendantPaths(registry, a.path);
    const unique = new Set(descendants);
    assert.equal(descendants.length, unique.size);
    assert.ok(descendants.length > 0);
    assert.ok(descendants.length <= 3);
    assert.equal(descendants.includes(a.path), false);
  });
});
