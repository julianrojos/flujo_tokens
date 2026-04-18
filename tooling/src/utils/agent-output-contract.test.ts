import { describe, it } from "node:test";
import assert from "node:assert";
import {
  validateAgentOutputContract,
  CANONICAL_H2_ORDER,
  REQUIRED_CANONICAL_H2,
  writeAgentOutputErrorReport,
} from "./agent-output-contract.js";

import * as fs from "node:fs";
import * as path from "node:path";

describe("agent-output-contract utils", () => {
  const VALID_REQUIRED_SECTIONS = `
## Overview
Content here.

## Anatomy
More content.

## Component API
Table properties here.

## Visual Specifications
Tokens.

## Variants
Variant mapping.

## States
State mapping.

## Usage Guidelines
Dos and don'ts.

## Content Guidelines
Text patterns.

## Accessibility
A11y nodes.
`;

  describe("constants", () => {
    it("exports CANONICAL_H2_ORDER", () => {
      assert.ok(Array.isArray(CANONICAL_H2_ORDER));
      assert.ok(CANONICAL_H2_ORDER.length > 0);
    });

    it("exports REQUIRED_CANONICAL_H2", () => {
      assert.ok(Array.isArray(REQUIRED_CANONICAL_H2));
      assert.ok(REQUIRED_CANONICAL_H2.includes("Overview"));
      assert.ok(REQUIRED_CANONICAL_H2.includes("Anatomy"));
      assert.ok(REQUIRED_CANONICAL_H2.includes("Component API"));
    });
  });

  describe("validateAgentOutputContract", () => {
    it("returns empty errors for valid markdown", () => {
      const markdown = `# Button
${VALID_REQUIRED_SECTIONS}
`;
      const result = validateAgentOutputContract({ markdown, expectedComponentName: "Button" });
      assert.deepStrictEqual(result.errors, []);
    });

    it("errors on missing H1", () => {
      const markdown = `## Overview only`;
      const result = validateAgentOutputContract({ markdown });
      assert.ok(result.errors.some(e => e.message.includes("H1")));
    });

    it("errors on missing required sections", () => {
      const markdown = `# Button

## Overview only
`;
      const result = validateAgentOutputContract({ markdown });
      assert.ok(result.errors.some(e => e.message.includes("Missing required section")));
    });

    it("accepts Usage Guidelines, Content Guidelines, and Accessibility as valid sections", () => {
      const markdown = `# Button
${VALID_REQUIRED_SECTIONS}
`;
      const result = validateAgentOutputContract({ markdown, expectedComponentName: "Button" });
      assert.deepStrictEqual(result.errors, []);
    });

    it("errors on any VariableID references", () => {
      const markdown = `# Button

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

    it("errors on unresolved gaps without Gaps section", () => {
      const markdown = `# Button
${VALID_REQUIRED_SECTIONS}
`;
      const result = validateAgentOutputContract({
        markdown,
        expectedComponentName: "Button",
        unresolvedGapCount: 3
      });
      assert.ok(result.errors.some(e => e.message.includes("Gaps / TBD section")));
    });

    it("accepts unresolved gaps with canonical ## Gaps / TBD section", () => {
      const markdown = `# Button
${VALID_REQUIRED_SECTIONS}

## Gaps / TBD

- [ ] [TOKEN_INVALID] Some token needs verification
`;
      const result = validateAgentOutputContract({
        markdown,
        expectedComponentName: "Button",
        unresolvedGapCount: 1
      });
      assert.deepStrictEqual(result.errors, []);
    });

    it("errors on empty Gaps / TBD section when unresolved gaps exist", () => {
      const markdown = `# Button
${VALID_REQUIRED_SECTIONS}

## Gaps / TBD
`;
      const result = validateAgentOutputContract({
        markdown,
        expectedComponentName: "Button",
        unresolvedGapCount: 1
      });
      assert.ok(result.errors.some(e => e.message.includes("section is empty")));
    });

    it("errors on non-checkbox Gaps / TBD items when unresolved gaps exist", () => {
      const markdown = `# Button
${VALID_REQUIRED_SECTIONS}

## Gaps / TBD

- TOKEN_INVALID: Missing checkbox prefix
`;
      const result = validateAgentOutputContract({
        markdown,
        expectedComponentName: "Button",
        unresolvedGapCount: 1
      });
      assert.ok(result.errors.some(e => e.message.includes("canonical checkbox format")));
    });

    it("errors on unauthorized H2 heading", () => {
      const markdown = `# Button

## Overview

## Anatomy

## Properties

## Secret Section
`;
      const result = validateAgentOutputContract({ markdown });
      assert.ok(result.errors.some(e => e.message.includes("Unauthorized H2 heading") && e.message.includes("Secret Section")));
    });

    it("errors on out of order H2 heading", () => {
      const markdown = `# Button

## Anatomy

## Overview

## Properties
`;
      const result = validateAgentOutputContract({ markdown });
      assert.ok(result.errors.some(e => e.message.includes("H2 headings out of order")));
    });

    it("errors on implementation code fences", () => {
      const markdown = `# Button

## Overview

## Anatomy

## Properties

\`\`\`tsx
export function Button() {}
\`\`\`
`;
      const result = validateAgentOutputContract({ markdown });
      assert.ok(result.errors.some(e => e.message.includes("Implementation code fences are not allowed")));
    });
  });

  describe("writeAgentOutputErrorReport", () => {
    const TEMP_DIR = path.join(process.cwd(), "docs/_generated/agent_output_errors_test");

    it("honors outputPath, markdownPath, and scriptName", () => {
      const outputPath = path.join(TEMP_DIR, "test.error.json");

      writeAgentOutputErrorReport({
        outputPath,
        componentSlug: "test-component",
        markdownPath: "design-systems/sys-01/docs/components/test-component.md",
        scriptName: "custom-script-name",
        errors: [{ code: "ERR1", message: "Test error" }],
        rawOutput: "raw content",
      });

      assert.ok(fs.existsSync(outputPath), "Error output report was not created");

      const content = fs.readFileSync(outputPath, "utf8");
      const report = JSON.parse(content);

      assert.strictEqual(report.componentSlug, "test-component");
      assert.strictEqual(report.markdownPath, "design-systems/sys-01/docs/components/test-component.md");
      assert.strictEqual(report.scriptName, "custom-script-name");
      assert.deepStrictEqual(report.errors, [{ code: "ERR1", message: "Test error" }]);

      // Cleanup
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    });
  });
});
