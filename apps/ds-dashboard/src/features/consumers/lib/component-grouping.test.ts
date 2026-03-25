/**
 * Unit tests for component grouping utilities
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupByParentComponent } from "./component-grouping.js";
import type { ImpactLevel } from "@/types/consumers";

describe("component-grouping", () => {
  describe("groupByParentComponent", () => {
    const createComponent = (
      name: string,
      instances: number,
      impactLevel: ImpactLevel = "LOW",
      sampleLinks: string[] = [],
    ) => ({
      componentKey: `key-${name}`,
      componentName: name,
      instances,
      impactLevel: { level: impactLevel, description: "" },
      sampleLinks,
    });

    it("returns empty array for empty input", () => {
      const result = groupByParentComponent([]);
      assert.deepStrictEqual(result, []);
    });

    it("groups atomic component (no slash) as single group", () => {
      const components = [createComponent("Button", 5)];
      const result = groupByParentComponent(components);
      
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].parentName, "Button");
      assert.strictEqual(result[0].variants.length, 1);
      assert.strictEqual(result[0].variants[0].variantLabel, "");
      assert.strictEqual(result[0].totalInstances, 5);
    });

    it("groups multiple variants under same parent", () => {
      const components = [
        createComponent("Button/Size=Large", 10),
        createComponent("Button/Size=Small", 5),
      ];
      const result = groupByParentComponent(components);
      
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].parentName, "Button");
      assert.strictEqual(result[0].variants.length, 2);
      assert.strictEqual(result[0].totalInstances, 15);
    });

    it("extracts variantLabel correctly (only first slash is separator)", () => {
      const components = [createComponent("Icon/Arrow/Filled", 3)];
      const result = groupByParentComponent(components);
      
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].parentName, "Icon");
      assert.strictEqual(result[0].variants[0].variantLabel, "Arrow/Filled");
    });

    it("extracts parent from comma-separated variant naming", () => {
      const components = [
        createComponent("Button, Size=Large, State=Hover", 4),
        createComponent("Button, Size=Small, State=Default", 6),
      ];
      const result = groupByParentComponent(components);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].parentName, "Button");
      assert.strictEqual(result[0].variants.length, 2);
      assert.strictEqual(result[0].variants[0].variantLabel.includes("Size="), true);
      assert.strictEqual(result[0].totalInstances, 10);
    });

    it("does not split comma-separated names when first segment is not key=value", () => {
      const components = [createComponent("Button, notes about=design", 2)];
      const result = groupByParentComponent(components);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].parentName, "Button, notes about=design");
      assert.strictEqual(result[0].variants[0].variantLabel, "");
    });

    it("keeps whitespace-only names as atomic groups", () => {
      const components = [createComponent("   ", 1)];
      const result = groupByParentComponent(components);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].parentName, "");
      assert.strictEqual(result[0].variants[0].variantLabel, "");
    });

    it("does not split comma names without variant assignment", () => {
      const components = [createComponent("Button, notes, copy", 3)];
      const result = groupByParentComponent(components);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].parentName, "Button, notes, copy");
      assert.strictEqual(result[0].variants[0].variantLabel, "");
    });

    it("handles name starting with slash (empty parentName)", () => {
      const components = [createComponent("/Button", 2)];
      const result = groupByParentComponent(components);
      
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].parentName, "");
      assert.strictEqual(result[0].variants[0].variantLabel, "Button");
    });

    it("creates separate groups for different component sets", () => {
      const components = [
        createComponent("Button/Primary", 10),
        createComponent("Input/Text", 5),
      ];
      const result = groupByParentComponent(components);
      
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].parentName, "Button");
      assert.strictEqual(result[1].parentName, "Input");
    });

    it("computes totalInstances as sum of all variants", () => {
      const components = [
        createComponent("Button/Large", 10),
        createComponent("Button/Small", 5),
        createComponent("Button/Medium", 3),
      ];
      const result = groupByParentComponent(components);
      
      assert.strictEqual(result[0].totalInstances, 18);
    });

    it("computes worstImpactLevel as most severe among variants", () => {
      const components = [
        createComponent("Button/Low", 5, "LOW"),
        createComponent("Button/Critical", 3, "CRITICAL"),
        createComponent("Button/High", 2, "HIGH"),
      ];
      const result = groupByParentComponent(components);
      
      assert.strictEqual(result[0].worstImpactLevel.level, "CRITICAL");
    });

    it("deduplicates sampleLinks across variants", () => {
      const sharedLink = "https://figma.com/file/123#node-1";
      const components = [
        createComponent("Button/Large", 5, "LOW", [sharedLink, "link-1"]),
        createComponent("Button/Small", 3, "LOW", [sharedLink, "link-2"]),
      ];
      const result = groupByParentComponent(components);
      
      assert.strictEqual(result[0].sampleLinks.length, 3);
      assert.ok(result[0].sampleLinks.includes(sharedLink));
      assert.ok(result[0].sampleLinks.includes("link-1"));
      assert.ok(result[0].sampleLinks.includes("link-2"));
    });

    it("sorts groups by worst impact (CRITICAL before HIGH before LOW)", () => {
      const components = [
        createComponent("Input/Low", 10, "LOW"),
        createComponent("Button/Critical", 5, "CRITICAL"),
        createComponent("Card/High", 8, "HIGH"),
      ];
      const result = groupByParentComponent(components);
      
      assert.strictEqual(result[0].parentName, "Button");
      assert.strictEqual(result[1].parentName, "Card");
      assert.strictEqual(result[2].parentName, "Input");
    });

    it("sorts groups by totalInstances when impact is equal", () => {
      const components = [
        createComponent("Button/Low", 5, "LOW"),
        createComponent("Input/Low", 10, "LOW"),
        createComponent("Card/Low", 3, "LOW"),
      ];
      const result = groupByParentComponent(components);
      
      assert.strictEqual(result[0].parentName, "Input");
      assert.strictEqual(result[1].parentName, "Button");
      assert.strictEqual(result[2].parentName, "Card");
    });

    it("sorts variants within group by impact then instances", () => {
      const components = [
        createComponent("Button/Low-More", 10, "LOW"),
        createComponent("Button/High-Less", 3, "HIGH"),
        createComponent("Button/High-More", 5, "HIGH"),
        createComponent("Button/Low-Less", 5, "LOW"),
      ];
      const result = groupByParentComponent(components);
      
      const variants = result[0].variants;
      // First by impact: HIGH before LOW
      // Then by instances: more before less
      assert.strictEqual(variants[0].componentName, "Button/High-More");
      assert.strictEqual(variants[1].componentName, "Button/High-Less");
      assert.strictEqual(variants[2].componentName, "Button/Low-More");
      assert.strictEqual(variants[3].componentName, "Button/Low-Less");
    });

    it("handles empty sampleLinks arrays", () => {
      const components = [
        createComponent("Button/Large", 5, "LOW", []),
        createComponent("Button/Small", 3, "LOW", []),
      ];
      const result = groupByParentComponent(components);
      
      assert.deepStrictEqual(result[0].sampleLinks, []);
    });

    it("handles component with empty variantLabel (single variant group)", () => {
      const components = [createComponent("AtomicComponent", 7)];
      const result = groupByParentComponent(components);
      
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].variants.length, 1);
      assert.strictEqual(result[0].variants[0].variantLabel, "");
    });
  });
});
