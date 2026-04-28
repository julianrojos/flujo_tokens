import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getTopTokenHotspots } from "./token-hotspots";

describe("getTopTokenHotspots", () => {
  it("sorts tokens by usage count, deduplicates component slugs, and limits results", () => {
    const rows = getTopTokenHotspots({
      usageIndex: {
        ok: true,
        summary: {
          tokens_total: 4,
          tokens_with_usage: 3,
          tokens_without_usage: 1,
          usage_links_total: 8,
          usage_links_by_kind: {},
          unresolved_total: 0,
        },
        warnings: [],
        unresolved: [],
        byPath: {},
        bySlashPath: {},
        byCssVar: {},
        entries: [
          {
            path: "color.background",
            slashPath: "color/background",
            cssVar: "--color-background",
            type: "color",
            collection: "core",
            usageCount: 3,
            usageByKind: {},
            usedIn: [
              { kind: "figma-applied", source: "figma", owner: "button", detail: "fills" },
              { kind: "figma-applied", source: "figma", owner: "button", detail: "strokes" },
              { kind: "figma-consumer-applied", source: "figma", owner: "consumer-card", detail: "fills" },
            ],
          },
          {
            path: "spacing.4",
            slashPath: "spacing/4",
            cssVar: "--spacing-4",
            type: "dimension",
            collection: "core",
            usageCount: 7,
            usageByKind: {},
            usedIn: [
              { kind: "figma-applied", source: "figma", owner: "input", detail: "gap" },
              { kind: "figma-consumer-applied", source: "figma", owner: "external-app", detail: "gap" },
            ],
          },
          {
            path: "radius.sm",
            slashPath: "radius/sm",
            cssVar: "--radius-sm",
            type: "dimension",
            collection: "core",
            usageCount: 0,
            usageByKind: {},
            usedIn: [],
          },
        ],
      },
      limit: 2,
    });

    assert.deepEqual(rows, [
      { path: "color.background", usageCount: 2, componentSlugs: ["button"] },
      { path: "spacing.4", usageCount: 1, componentSlugs: ["input"] },
    ]);
  });

  it("falls back to variable reports when the token usage index has no entries", () => {
    const rows = getTopTokenHotspots({
      usageIndex: {
        ok: true,
        summary: {
          tokens_total: 0,
          tokens_with_usage: 0,
          tokens_without_usage: 0,
          usage_links_total: 0,
          usage_links_by_kind: {},
          unresolved_total: 0,
        },
        warnings: [],
        unresolved: [],
        entries: [],
        byPath: {},
        bySlashPath: {},
        byCssVar: {},
      },
      tokenCatalog: {
        entries: [
          {
            path: "Color.Background.Decorative.100",
            slashPath: "Color/Background/Decorative/100",
            cssVar: "--Color-Background-Decorative-100",
            type: "color",
            resolvedValue: "#fff",
            aliasOf: null,
            collection: "core",
          },
          {
            path: "Spacing.4",
            slashPath: "Spacing/4",
            cssVar: "--Spacing-4",
            type: "dimension",
            resolvedValue: "16px",
            aliasOf: null,
            collection: "core",
          },
        ],
        byPath: {},
        bySlashPath: {},
        byVariableId: {},
      },
      variableReports: [
        {
          variableKey: "var-1",
          variableName: "Color/Background/Decorative/100",
          variableType: "COLOR",
          totalNodes: 5,
          consumers: [
            {
              consumerId: "parent:file",
              consumerName: "Parent file",
              consumerFileKey: "file-1",
              nodeCount: 2,
              sampleNodeIds: [],
              lastSyncedAt: "",
              sampleLinks: [],
            },
            {
              consumerId: "consumer-1",
              consumerName: "Button",
              consumerFileKey: "file-2",
              nodeCount: 3,
              sampleNodeIds: [],
              lastSyncedAt: "",
              sampleLinks: [],
            },
          ],
          impactLevel: { level: "LOW", description: "" },
          sampleLinks: [],
        },
      ],
      limit: 12,
    });

    assert.deepEqual(rows, [
      {
        path: "Color.Background.Decorative.100",
        usageCount: 2,
        componentSlugs: ["Parent file"],
      },
    ]);
  });

  it("prefers variable reports over token usage index rows to avoid double-counting parent usage", () => {
    const rows = getTopTokenHotspots({
      usageIndex: {
        ok: true,
        summary: {
          tokens_total: 1,
          tokens_with_usage: 1,
          tokens_without_usage: 0,
          usage_links_total: 2,
          usage_links_by_kind: {},
          unresolved_total: 0,
        },
        warnings: [],
        unresolved: [],
        byPath: {},
        bySlashPath: {},
        byCssVar: {},
        entries: [
          {
            path: "color.background",
            slashPath: "color/background",
            cssVar: "--color-background",
            type: "color",
            collection: "core",
            usageCount: 2,
            usageByKind: {},
            usedIn: [
              { kind: "figma-applied", source: "figma", owner: "button", detail: "fills" },
              { kind: "figma-applied", source: "figma", owner: "button", detail: "strokes" },
            ],
          },
        ],
      },
      tokenCatalog: {
        entries: [
          {
            path: "color.background",
            slashPath: "color/background",
            cssVar: "--color-background",
            type: "color",
            resolvedValue: "#fff",
            aliasOf: null,
            collection: "core",
          },
        ],
        byPath: {},
        bySlashPath: {},
        byVariableId: {},
      },
      variableReports: [
        {
          variableKey: "var-1",
          variableName: "color/background",
          variableType: "COLOR",
          totalNodes: 3,
          consumers: [
            {
              consumerId: "parent:file",
              consumerName: "Parent file",
              consumerFileKey: "file-1",
              nodeCount: 3,
              sampleNodeIds: [],
              lastSyncedAt: "",
              sampleLinks: [],
            },
          ],
          impactLevel: { level: "LOW", description: "" },
          sampleLinks: [],
        },
      ],
      limit: 12,
    });

    assert.deepEqual(rows, [
      {
        path: "color.background",
        usageCount: 3,
        componentSlugs: ["button", "Parent file"],
      },
    ]);
  });
});
