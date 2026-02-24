import assert from "node:assert/strict";
import test from "node:test";

import { injectExtractedSpecSectionsIntoMarkdown } from "./capture-markdown-sections.mjs";

const BASE_MARKDOWN = `# Button

## Anatomy

Old anatomy.

## Component API

Old api.

## Visual Specifications

Old visual.

## Accessibility

Keep this section.
`;

test("capture-markdown-sections: returns original markdown when spec is invalid", () => {
  const result = injectExtractedSpecSectionsIntoMarkdown(BASE_MARKDOWN, null);
  assert.equal(result.changed, false);
  assert.equal(result.content, BASE_MARKDOWN);
});

test("capture-markdown-sections: replaces canonical sections and keeps unrelated sections", () => {
  const spec = {
    anatomy: [{ item: "Container", description: "Outer wrapper" }],
    properties: [
      { name: "size", type: "enum", required: false, default: "md", description: "Size" },
    ],
    visual_specifications: {
      layout: { spacing: "8px" },
      typography: { font_size: "14px" },
      colors: { background: "`color.surface.default`" },
      dimensions: { min_height: "32px" },
      border_radius: "4px",
      border: "none",
      shadows: "none",
      opacity: "1",
      states: [{ name: "default", details: "Base" }],
    },
  };

  const result = injectExtractedSpecSectionsIntoMarkdown(BASE_MARKDOWN, spec, {
    anatomy: { imageUrl: "https://img/anatomy.png", nodeId: "10:1" },
  });

  assert.equal(result.changed, true);
  assert.doesNotMatch(result.content, /Old anatomy\./);
  assert.match(result.content, /### Anatomy exhibit/);
  assert.match(result.content, /Source node: `10:1`/);
  assert.match(result.content, /## Component API/);
  assert.doesNotMatch(result.content, /Old api\./);
  assert.match(result.content, /## Visual Specifications/);
  assert.doesNotMatch(result.content, /Old visual\./);
  assert.match(result.content, /## Accessibility\n\nKeep this section\./);
});
