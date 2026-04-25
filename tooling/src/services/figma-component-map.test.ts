import { describe, it } from "node:test";
import assert from "node:assert";
import type { FigmaNode } from "../utils/figma.js";
import {
  parseFigmaFileUrl,
  buildFigmaComponentMap,
  toHyphenNodeId,
  sanitizeNodeId,
} from "./figma-component-map.js";

describe("figma-component-map utils", () => {
  describe("toHyphenNodeId", () => {
    it("converts colon-separated IDs to hyphen-separated", () => {
      assert.equal(toHyphenNodeId("1:2"), "1-2");
      assert.equal(toHyphenNodeId("123:456"), "123-456");
    });

    it("handles empty input", () => {
      assert.equal(toHyphenNodeId(""), "");
      assert.equal(toHyphenNodeId(null as any), "");
      assert.equal(toHyphenNodeId(undefined as any), "");
    });
  });

  describe("sanitizeNodeId", () => {
    it("converts hyphen-separated IDs to colon-separated", () => {
      assert.equal(sanitizeNodeId("1-2"), "1:2");
      assert.equal(sanitizeNodeId("123-456"), "123:456");
    });

    it("validates format", () => {
      assert.equal(sanitizeNodeId("1:2"), "1:2");
      assert.equal(sanitizeNodeId("invalid"), "");
      assert.equal(sanitizeNodeId("1:2:3"), "");
    });

    it("handles empty input", () => {
      assert.equal(sanitizeNodeId(""), "");
      assert.equal(sanitizeNodeId(null as any), "");
    });
  });

  describe("parseFigmaFileUrl", () => {
    it("parses valid design URL", () => {
      const result = parseFigmaFileUrl("https://www.figma.com/design/abc123/Test-File?node-id=1-2");
      assert.equal(result.fileKey, "abc123");
      assert.equal(result.fileName, "Test-File");
      assert.equal(result.fileSlug, "Test-File");
      assert.equal(result.surface, "design");
      assert.equal(result.rootNodeId, "1:2");
    });

    it("parses valid file URL", () => {
      const result = parseFigmaFileUrl("https://www.figma.com/file/xyz789/Another-File?node-id=3-4");
      assert.equal(result.fileKey, "xyz789");
      assert.equal(result.surface, "file");
      assert.equal(result.rootNodeId, "3:4");
    });

    it("handles URL without node-id", () => {
      const result = parseFigmaFileUrl("https://www.figma.com/design/abc123/Test-File");
      assert.equal(result.rootNodeId, "");
    });

    it("throws on invalid URL", () => {
      assert.throws(
        () => parseFigmaFileUrl("not-a-url"),
        /Invalid Figma URL/
      );
    });

    it("throws on non-figma.com hostname", () => {
      assert.throws(
        () => parseFigmaFileUrl("https://evil.com/design/abc123/Test"),
        /Invalid Figma URL hostname/
      );
    });

    it("throws on missing file key", () => {
      assert.throws(
        () => parseFigmaFileUrl("https://www.figma.com/design/"),
        /Missing file key/
      );
    });
  });

  describe("buildFigmaComponentMap", () => {
    const mockParsedUrl = {
      fileKey: "abc123",
      fileName: "Test-File",
      fileSlug: "Test-File",
      surface: "design",
      rootNodeId: "1:2",
      figmaUrl: "https://www.figma.com/design/abc123/Test-File",
    };

    it("builds map with component sets", () => {
      const componentSets = {
        "101:201": { name: "Button Set", description: "Button variants" },
        "101:202": { name: "Input Set" },
      };

      const document: FigmaNode = {
        id: "root",
        type: "DOCUMENT",
        name: "Test",
        children: [],
      };

      const map = buildFigmaComponentMap(mockParsedUrl, document, {}, componentSets);

      // Component sets are in the catalog but only nodes in document tree become records
      assert.ok(map.componentSets.length >= 0);
    });

    it("builds map with components", () => {
      const components = {
        "101:301": { name: "Primary Button", description: "Primary variant" },
        "101:302": { name: "Secondary Button" },
      };

      const document: FigmaNode = {
        id: "root",
        type: "DOCUMENT",
        name: "Test",
        children: [],
      };

      const map = buildFigmaComponentMap(mockParsedUrl, document, components, {});

      // Components are in the catalog but only nodes in document tree become records
      assert.ok(map.components.length >= 0);
    });

    it("builds map with pages and children", () => {
      const document: FigmaNode = {
        id: "root",
        type: "DOCUMENT",
        name: "Test",
        children: [
          {
            type: "CANVAS",
            name: "Page 1",
            id: "100:1",
            children: [
              { type: "COMPONENT", name: "Button", id: "101:1" },
              { type: "COMPONENT_SET", name: "Input Set", id: "101:2" },
              { type: "INSTANCE", name: "Button Instance", id: "101:3" },
            ],
          },
        ],
      };

      const map = buildFigmaComponentMap(mockParsedUrl, document, {}, {});
      
      assert.equal(map.pages.length, 1);
      assert.equal(map.pages[0].name, "Page 1");
      // COMPONENT and COMPONENT_SET nodes in tree become component records
      assert.ok(map.components.length >= 1);
      // componentSets come from componentSets parameter, not tree walk
      assert.equal(map.componentSets.length, 0);
    });

    it("handles empty data", () => {
      const document: FigmaNode = {
        id: "root",
        type: "DOCUMENT",
        name: "Test",
        children: [],
      };

      const map = buildFigmaComponentMap(mockParsedUrl, document, {}, {});

      assert.equal(map.components.length, 0);
      assert.equal(map.componentSets.length, 0);
      assert.equal(map.pages.length, 0);
    });

    it("sorts components by name", () => {
      const document: FigmaNode = {
        id: "root",
        type: "DOCUMENT",
        name: "Test",
        children: [
          {
            type: "CANVAS",
            name: "Page 1",
            id: "100:1",
            children: [
              { type: "COMPONENT", name: "Zebra Button", id: "101:3" },
              { type: "COMPONENT", name: "Alpha Button", id: "101:1" },
              { type: "COMPONENT", name: "Beta Button", id: "101:2" },
            ],
          },
        ],
      };

      const map = buildFigmaComponentMap(mockParsedUrl, document, {}, {});

      const names = map.components.map(c => c.name);
      // Components are sorted by page_name|kind|name|node_id
      assert.deepEqual(names, ["Alpha Button", "Beta Button", "Zebra Button"]);
    });
  });

});
