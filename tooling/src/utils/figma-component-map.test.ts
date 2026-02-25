import { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseFigmaFileUrl,
  buildFigmaComponentMap,
  formatFigmaComponentMap,
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
      
      const map = buildFigmaComponentMap(mockParsedUrl, {}, {}, componentSets);
      
      assert.equal(map.componentSets.length, 2);
      assert.equal(map.componentSets[0].name, "Button Set");
      assert.equal(map.componentSets[0].type, "component_set");
    });

    it("builds map with components", () => {
      const components = {
        "101:301": { name: "Primary Button", description: "Primary variant" },
        "101:302": { name: "Secondary Button" },
      };
      
      const map = buildFigmaComponentMap(mockParsedUrl, {}, components, {});
      
      assert.equal(map.components.length, 2);
      assert.equal(map.components[0].name, "Primary Button");
      assert.equal(map.components[0].type, "component");
    });

    it("builds map with pages and children", () => {
      const nodes = {
        "100:1": {
          type: "CANVAS",
          name: "Page 1",
          children: {
            "101:1": { type: "COMPONENT", name: "Button" },
            "101:2": { type: "COMPONENT_SET", name: "Input Set" },
            "101:3": { type: "INSTANCE", name: "Button Instance" },
          },
        },
      };
      
      const map = buildFigmaComponentMap(mockParsedUrl, nodes, {}, {});
      
      assert.equal(map.pages.length, 1);
      assert.equal(map.pages[0].name, "Page 1");
      assert.equal(map.pages[0].children?.length, 3);
    });

    it("handles empty data", () => {
      const map = buildFigmaComponentMap(mockParsedUrl);
      
      assert.equal(map.components.length, 0);
      assert.equal(map.componentSets.length, 0);
      assert.equal(map.pages.length, 0);
    });

    it("sorts components by name", () => {
      const components = {
        "101:303": { name: "Zebra Button" },
        "101:301": { name: "Alpha Button" },
        "101:302": { name: "Beta Button" },
      };
      
      const map = buildFigmaComponentMap(mockParsedUrl, {}, components, {});
      
      assert.equal(map.components[0].name, "Alpha Button");
      assert.equal(map.components[1].name, "Beta Button");
      assert.equal(map.components[2].name, "Zebra Button");
    });
  });

  describe("formatFigmaComponentMap", () => {
    it("formats map to markdown", () => {
      const map: ReturnType<typeof buildFigmaComponentMap> = {
        fileKey: "abc123",
        fileName: "Test-File",
        fileSlug: "Test-File",
        surface: "design",
        rootNodeId: "1:2",
        components: [{ id: "1", name: "Button", nodeId: "1-2", type: "component" }],
        componentSets: [{ id: "2", name: "Button Set", nodeId: "2-3", type: "component_set" }],
        pages: [{
          id: "3",
          name: "Page 1",
          nodeId: "3-4",
          type: "page",
          children: [{ id: "4", name: "Child", nodeId: "4-5", type: "component" }],
        }],
      };
      
      const markdown = formatFigmaComponentMap(map);
      
      assert.ok(markdown.includes("# Test-File"));
      assert.ok(markdown.includes("**File Key:** abc123"));
      assert.ok(markdown.includes("## Component Sets"));
      assert.ok(markdown.includes("## Components"));
      assert.ok(markdown.includes("## Pages"));
    });

    it("handles empty map", () => {
      const map: ReturnType<typeof buildFigmaComponentMap> = {
        fileKey: "abc123",
        fileName: "Empty",
        fileSlug: "Empty",
        surface: "design",
        rootNodeId: "",
        components: [],
        componentSets: [],
        pages: [],
      };
      
      const markdown = formatFigmaComponentMap(map);
      
      assert.ok(markdown.includes("# Empty"));
      assert.ok(!markdown.includes("## Component Sets"));
      assert.ok(!markdown.includes("## Components"));
    });
  });
});
