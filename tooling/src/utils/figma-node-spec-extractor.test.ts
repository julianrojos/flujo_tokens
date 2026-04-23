import { describe, it } from "node:test";
import assert from "node:assert";
import {
  extractComponentSpec,
  type FigmaNode,
} from "./figma-node-spec-extractor.js";

// Helper para crear nodos mock tipados correctamente
function createMockFigmaNode(overrides: Partial<FigmaNode> = {}): FigmaNode {
  return {
    id: "1:1",
    name: "TestComponent",
    type: "FRAME",
    children: [],
    componentPropertyDefinitions: {},
    ...overrides,
  };
}

describe("figma-node-spec-extractor utils", () => {
  const mockFigmaNode = createMockFigmaNode({
    name: "Button",
    children: [
      {
        id: "1:3",
        name: "Background",
        type: "RECTANGLE",
        fills: [{ type: "SOLID", color: { r: 0, g: 0.5, b: 1, a: 1 }, visible: true }],
        absoluteBoundingBox: { width: 100, height: 40 },
      },
      {
        id: "1:4",
        name: "Label",
        type: "TEXT",
        style: { fontFamily: "Inter", fontWeight: 500, fontSize: 14 },
        absoluteBoundingBox: { width: 60, height: 20 },
      },
    ],
    componentPropertyDefinitions: {
      "Variant Type": { type: "ENUM", variant: true, defaultValue: "Primary" },
      "Is Disabled": { type: "BOOLEAN", variant: false, defaultValue: false },
    },
  });

  describe("color helpers", () => {
    it("converts Figma color to hex", () => {
      const spec = extractComponentSpec(mockFigmaNode);
      const background = spec.anatomy.find((a) => a.name === "Background");
      assert.equal(background?.fill, "#0080FF");
    });

    it("handles alpha channel in extracted spec", () => {
      const nodeWithAlpha = createMockFigmaNode({
        children: [{
          id: "2",
          name: "Child",
          type: "RECTANGLE",
          fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 0.5 }, visible: true }],
        }],
      });
      const spec = extractComponentSpec(nodeWithAlpha);
      // Alpha 0.5 = 128 = 0x80, so #FF000080
      assert.ok(spec.anatomy[0]?.fill?.includes("80"));
    });

    it("prefers semantic token path when fill is bound to variable alias", () => {
      const nodeWithBoundVariable = createMockFigmaNode({
        children: [{
          id: "2",
          name: "Child",
          type: "RECTANGLE",
          boundVariables: {
            fills: [
              {
                type: "VARIABLE_ALIAS",
                id: "VariableID:semantic-bg-default",
              },
            ],
          },
          fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 }, visible: true }],
        }],
      });
      const spec = extractComponentSpec(nodeWithBoundVariable, {
        resolveTokenTraceByVariableId: (variableId) =>
          variableId === "VariableID:semantic-bg-default"
            ? {
                path: "semanticos.color.background.default",
                aliasChain: [
                  "component.button.background.default",
                  "semanticos.color.background.default",
                  "primitivos.color.blanco",
                ],
                resolved: "#FFFFFF",
              }
            : { path: null, aliasChain: [], resolved: null },
      });
      assert.equal(spec.anatomy[0]?.fill, "semanticos.color.background.default");
      assert.deepEqual(spec.anatomy[0]?.fill_alias_chain, [
        "component.button.background.default",
        "semanticos.color.background.default",
        "primitivos.color.blanco",
      ]);
      assert.equal(spec.anatomy[0]?.fill_resolved, "#FFFFFF");
    });

    it("does not use non-fill bound variables as fill token source", () => {
      const nodeWithStrokeAliasOnly = createMockFigmaNode({
        children: [{
          id: "3",
          name: "Child",
          type: "RECTANGLE",
          boundVariables: {
            strokes: [
              {
                type: "VARIABLE_ALIAS",
                id: "VariableID:stroke-token",
              },
            ],
          },
        }],
      });
      const spec = extractComponentSpec(nodeWithStrokeAliasOnly, {
        resolveTokenTraceByVariableId: () => ({
          path: "semanticos.color.border.default",
          aliasChain: ["semanticos.color.border.default"],
          resolved: "#000000",
        }),
      });
      assert.equal(spec.anatomy[0]?.fill, undefined);
      assert.equal(spec.anatomy[0]?.fill_alias_chain, undefined);
      assert.equal(spec.anatomy[0]?.fill_resolved, undefined);
    });
  });

  describe("extractComponentSpec", () => {
    it("extracts anatomy items", () => {
      const spec = extractComponentSpec(mockFigmaNode);
      assert.equal(spec.anatomy.length, 2);
      assert.equal(spec.anatomy[0].name, "Background");
      assert.equal(spec.anatomy[0].type, "RECTANGLE");
      assert.equal(spec.anatomy[0].width, 100);
      assert.equal(spec.anatomy[0].height, 40);
    });

    it("extracts properties", () => {
      const spec = extractComponentSpec(mockFigmaNode);
      assert.equal(spec.properties.length, 2);
      const variantProp = spec.properties.find((p) => p.name === "Variant Type");
      assert.ok(variantProp);
      assert.equal(variantProp?.type, "ENUM");
      assert.equal(variantProp?.variant, true);
    });

    it("extracts variant properties", () => {
      const spec = extractComponentSpec(mockFigmaNode);
      assert.equal(spec.variantProperties.length, 1);
      assert.equal(spec.variantProperties[0], "Variant Type");
    });

    it("builds layout tree", () => {
      const spec = extractComponentSpec(mockFigmaNode);
      assert.ok(spec.layoutTree);
      assert.equal(spec.layoutTree.name, "Button");
      assert.equal(spec.layoutTree.type, "FRAME");
    });

    it("handles empty node", () => {
      const spec = extractComponentSpec(createMockFigmaNode({ name: "Empty" }));
      assert.equal(spec.anatomy.length, 0);
      assert.equal(spec.properties.length, 0);
      assert.equal(spec.variantProperties.length, 0);
    });
  });
});
