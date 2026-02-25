import { describe, it } from "node:test";
import assert from "node:assert";
import {
  validateAgentOutputContract,
  ALLOWED_DOC_STATUS,
  CANONICAL_H2_ORDER,
  REQUIRED_CANONICAL_H2,
} from "./agent-output-contract.js";

describe("agent-output-contract utils", () => {
  describe("constants", () => {
    it("exports ALLOWED_DOC_STATUS", () => {
      assert.ok(ALLOWED_DOC_STATUS.has("draft"));
      assert.ok(ALLOWED_DOC_STATUS.has("ready"));
      assert.ok(ALLOWED_DOC_STATUS.has("needs-review"));
    });

    it("exports CANONICAL_H2_ORDER", () => {
      assert.ok(Array.isArray(CANONICAL_H2_ORDER));
      assert.ok(CANONICAL_H2_ORDER.length > 0);
    });

    it("exports REQUIRED_CANONICAL_H2", () => {
      assert.ok(Array.isArray(REQUIRED_CANONICAL_H2));
      assert.ok(REQUIRED_CANONICAL_H2.includes("Overview"));
      assert.ok(REQUIRED_CANONICAL_H2.includes("Anatomy"));
      assert.ok(REQUIRED_CANONICAL_H2.includes("Properties"));
    });
  });

  describe("validateAgentOutputContract", () => {
    it("returns empty errors for valid markdown", () => {
      const markdown = `---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/file/abc123
  last_verified: 2024-01-15
---

# Button

## Overview

Content here.

## Anatomy

More content.

## Properties

Even more content.

\`\`\`tsx
export function Button() {}
\`\`\`
`;
      const result = validateAgentOutputContract({ markdown, expectedComponentName: "Button" });
      assert.equal(result.errors.length, 0);
    });

    it("errors on missing frontmatter", () => {
      const markdown = "# Button\n\nContent without frontmatter.";
      const result = validateAgentOutputContract({ markdown });
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors.some(e => e.code === "AOC01"));
    });

    it("errors on wrong doc_type", () => {
      const markdown = `---
doc_type: overview
doc_status: draft
figma:
  file_url: https://www.figma.com/file/abc
  last_verified: TBD
---

# Button
`;
      const result = validateAgentOutputContract({ markdown });
      assert.ok(result.errors.some(e => e.message.includes("doc_type")));
    });

    it("errors on invalid doc_status", () => {
      const markdown = `---
doc_type: component
doc_status: published
figma:
  file_url: https://www.figma.com/file/abc
  last_verified: TBD
---

# Button
`;
      const result = validateAgentOutputContract({ markdown });
      assert.ok(result.errors.some(e => e.message.includes("doc_status")));
    });

    it("errors on missing figma object", () => {
      const markdown = `---
doc_type: component
doc_status: draft
---

# Button
`;
      const result = validateAgentOutputContract({ markdown });
      assert.ok(result.errors.some(e => e.message.includes("figma")));
    });

    it("errors on invalid figma URL", () => {
      const markdown = `---
doc_type: component
doc_status: draft
figma:
  file_url: not-a-url
  last_verified: TBD
---

# Button
`;
      const result = validateAgentOutputContract({ markdown });
      assert.ok(result.errors.some(e => e.message.includes("file_url")));
    });

    it("errors on non-figma.com URL", () => {
      const markdown = `---
doc_type: component
doc_status: draft
figma:
  file_url: https://evil.figma.com.hacker.io/
  last_verified: TBD
---

# Button
`;
      const result = validateAgentOutputContract({ markdown });
      assert.ok(result.errors.some(e => e.message.includes("file_url")));
    });

    it("accepts subdomain.figma.com URLs", () => {
      const markdown = `---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/file/abc123
  last_verified: TBD
---

# Button
`;
      const result = validateAgentOutputContract({ markdown });
      assert.ok(!result.errors.some(e => e.message.includes("file_url")));
    });

    it("errors on missing H1", () => {
      const markdown = `---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/file/abc
  last_verified: TBD
---

## Overview only
`;
      const result = validateAgentOutputContract({ markdown });
      assert.ok(result.errors.some(e => e.message.includes("H1")));
    });

    it("errors on missing required sections", () => {
      const markdown = `---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/file/abc
  last_verified: TBD
---

# Button

## Overview only
`;
      const result = validateAgentOutputContract({ markdown });
      assert.ok(result.errors.some(e => e.message.includes("Missing required section")));
    });

    it("errors on too many VariableID references", () => {
      const markdown = `---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/file/abc
  last_verified: TBD
---

# Button

## Overview

VariableID:color-1
VariableID:color-2
VariableID:color-3
VariableID:color-4
VariableID:color-5
VariableID:color-6
`;
      const result = validateAgentOutputContract({ markdown });
      assert.ok(result.errors.some(e => e.message.includes("VariableID")));
    });

    it("errors on missing code examples", () => {
      const markdown = `---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/file/abc
  last_verified: TBD
---

# Button

## Overview

## Anatomy

## Properties

No code here.
`;
      const result = validateAgentOutputContract({ markdown, expectedComponentName: "Button" });
      assert.ok(result.errors.some(e => e.message.includes("code examples")));
    });

    it("errors on unresolved gaps without Gaps section", () => {
      const markdown = `---
doc_type: component
doc_status: draft
figma:
  file_url: https://www.figma.com/file/abc
  last_verified: TBD
---

# Button

## Overview

## Anatomy

## Properties

\`\`\`tsx
export function Button() {}
\`\`\`
`;
      const result = validateAgentOutputContract({ 
        markdown, 
        expectedComponentName: "Button",
        unresolvedGapCount: 3 
      });
      assert.ok(result.errors.some(e => e.message.includes("Gaps section")));
    });
  });
});
