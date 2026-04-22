import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { VariableUsageReport } from "@/types/consumers";
import type { ComponentCatalogItem } from "@/types/component-catalog";
import type { TokenCatalogEntry, TokenCatalog } from "@/types/token-catalog";
import {
  buildComponentTokenUsageRows,
  buildFigmaConsumerUsageOccurrences,
  collectAliasDescendantPaths,
  buildTokenUsageInTokensRows,
} from "./lib/token-detail-usage-derivation";

function makeToken(overrides: Partial<TokenCatalogEntry>): TokenCatalogEntry {
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

function buildRegistry(entries: TokenCatalogEntry[]): TokenCatalog {
  const byPath: Record<string, TokenCatalogEntry> = {};
  const bySlashPath: Record<string, TokenCatalogEntry> = {};
  const byVariableId: Record<string, TokenCatalogEntry> = {};
  for (const entry of entries) {
    byPath[entry.path] = entry;
    bySlashPath[entry.slashPath] = entry;
  }
  return { entries, byPath, bySlashPath, byVariableId };
}

function makeComponent(
  slug: string,
  displayName: string,
  tokenBindings: NonNullable<ComponentCatalogItem["figma"]>["token_bindings"],
): ComponentCatalogItem {
  return {
    slug,
    display_name: displayName,
    paths: { spec: `db://component_editorial/${slug}` },
    spec: { exists: true },
    figma: {
      file_url: null,
      component_set_node_id: null,
      token_bindings: tokenBindings,
    },
    fingerprint_sha256: `fingerprint-${slug}`,
  };
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

  it("collects component properties for matching token usages", () => {
    const base = makeToken({
      path: "color.background.accent",
      slashPath: "color/background/accent",
      cssVar: "--color-background-accent",
    });
    const alias = makeToken({
      path: "color.background.accent.hover",
      slashPath: "color/background/accent/hover",
      cssVar: "--color-background-accent-hover",
      aliasOf: base.path,
    });
    const registry = buildRegistry([base, alias]);

    const rows = buildComponentTokenUsageRows({
      tokenPath: base.path,
      registry,
      components: [
        makeComponent("button", "Button", [
          {
            node_id: "1",
            node_name: "Button/Default",
            field: "fills",
            variable_id: "var:1",
            token_path: base.path,
            property_path: "fills",
            status: "resolved",
          },
          {
            node_id: "2",
            node_name: "Button/Hover",
            field: "strokes",
            variable_id: "var:2",
            token_path: alias.path,
            property_path: "strokes",
            status: "resolved",
          },
        ]),
      ],
    });

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].properties, ["fills", "strokes"]);
    assert.equal(rows[0].mode, "both");
    assert.equal(rows[0].directOccurrences, 1);
    assert.equal(rows[0].viaAliasOccurrences, 1);
  });

  it("builds token usage rows with depth and downstream consumer counts", () => {
    const base = makeToken({
      path: "color.background.base",
      slashPath: "color/background/base",
      cssVar: "--color-background-base",
    });
    const alias1 = makeToken({
      path: "color.background.base.soft",
      slashPath: "color/background/base/soft",
      cssVar: "--color-background-base-soft",
      aliasOf: base.path,
      resolvedValue: "#111111",
    });
    const alias2 = makeToken({
      path: "color.background.base.soft.hover",
      slashPath: "color/background/base/soft/hover",
      cssVar: "--color-background-base-soft-hover",
      aliasOf: alias1.path,
      resolvedValue: "#222222",
    });
    const registry = buildRegistry([base, alias1, alias2]);

    const rows = buildTokenUsageInTokensRows({
      tokenPath: base.path,
      registry,
    });

    assert.deepEqual(
      rows.map((row) => ({
        path: row.path,
        depth: row.depth,
        consumers: row.consumers,
      })),
      [
        {
          path: alias1.path,
          depth: 1,
          consumers: 1,
        },
        {
          path: alias2.path,
          depth: 2,
          consumers: 0,
        },
      ],
    );
  });

  it("collects component properties for downstream token usage rows", () => {
    const base = makeToken({
      path: "color.background.base",
      slashPath: "color/background/base",
      cssVar: "--color-background-base",
    });
    const child = makeToken({
      path: "color.background.base.soft",
      slashPath: "color/background/base/soft",
      cssVar: "--color-background-base-soft",
      aliasOf: base.path,
    });
    const registry = buildRegistry([base, child]);

    const rows = buildTokenUsageInTokensRows({
      tokenPath: base.path,
      registry,
      components: [
        makeComponent("button", "Button", [
          {
            node_id: "1",
            node_name: "Button/Default",
            field: "fills",
            variable_id: "var:1",
            token_path: child.path,
            property_path: "fills",
            status: "resolved",
          },
          {
            node_id: "2",
            node_name: "Button/Hover",
            field: "strokes",
            variable_id: "var:2",
            token_path: child.path,
            property_path: "strokes",
            status: "resolved",
          },
        ]),
      ],
    });

    assert.deepEqual(
      rows.map((row) => ({
        path: row.path,
        properties: row.properties,
      })),
      [
        {
          path: child.path,
          properties: ["fills", "strokes"],
        },
      ],
    );
  });

  it("propagates downstream component properties to ancestor token rows", () => {
    const base = makeToken({
      path: "color.background.base",
      slashPath: "color/background/base",
      cssVar: "--color-background-base",
    });
    const child = makeToken({
      path: "color.background.base.soft",
      slashPath: "color/background/base/soft",
      cssVar: "--color-background-base-soft",
      aliasOf: base.path,
    });
    const grandchild = makeToken({
      path: "color.background.base.soft.hover",
      slashPath: "color/background/base/soft/hover",
      cssVar: "--color-background-base-soft-hover",
      aliasOf: child.path,
    });
    const registry = buildRegistry([base, child, grandchild]);

    const rows = buildTokenUsageInTokensRows({
      tokenPath: base.path,
      registry,
      components: [
        makeComponent("button", "Button", [
          {
            node_id: "1",
            node_name: "Button/Hover",
            field: "fills",
            variable_id: "var:1",
            token_path: grandchild.path,
            property_path: "fills",
            status: "resolved",
          },
        ]),
      ],
    });

    assert.deepEqual(
      rows.map((row) => ({
        path: row.path,
        depth: row.depth,
        properties: row.properties,
      })),
      [
        {
          path: child.path,
          depth: 1,
          properties: ["fills"],
        },
        {
          path: grandchild.path,
          depth: 2,
          properties: ["fills"],
        },
      ],
    );
  });
});
