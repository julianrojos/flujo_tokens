/**
 * Tests for QA Audit Service
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Import functions to test
import { extractTokenPathsFromText, loadYamlFile } from './qa-audit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_FIXTURES_DIR = path.join(__dirname, '__fixtures__');

// Setup and cleanup fixtures directory
beforeEach(() => {
  fs.mkdirSync(TEST_FIXTURES_DIR, { recursive: true });
});

afterEach(() => {
  try {
    fs.rmSync(TEST_FIXTURES_DIR, { recursive: true, force: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`qa-audit.test: Failed to cleanup fixtures directory: ${message}`);
  }
});

describe('qa-audit', () => {
  describe('extractTokenPathsFromText', () => {
    it('should extract dotted token paths (3+ segments)', () => {
      const content = `
        token_mapping:
          container.background: Color/Background/Feedback/Default
          focus.inner: Semantic.Color.Focus-Outline.Inner
          a11y.hit_area: A11y.A11y.Dimension.Min-Hit-Area
      `;
      
      const tokens = extractTokenPathsFromText(content);
      
      assert.ok(tokens.includes('Semantic.Color.Focus-Outline.Inner'));
      assert.ok(tokens.includes('A11y.A11y.Dimension.Min-Hit-Area'));
    });

    it('should extract slash token paths (2+ segments)', () => {
      const content = `
        border: Color/Border/Feedback/Information
        icon: Color/Icon/Feedback/Danger
        background: Color/Background/Feedback/Default
      `;
      
      const tokens = extractTokenPathsFromText(content);
      
      assert.ok(tokens.includes('Color/Border/Feedback/Information'));
      assert.ok(tokens.includes('Color/Icon/Feedback/Danger'));
      assert.ok(tokens.includes('Color/Background/Feedback/Default'));
    });

    it('should exclude URLs from token extraction', () => {
      const content = `
        Source: https://www.figma.com/file/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2304-1892
        See: http://example.com/path/to/resource
      `;
      
      const tokens = extractTokenPathsFromText(content);
      
      assert.strictEqual(tokens.length, 0);
    });

    it('should exclude code blocks from token extraction', () => {
      const content = `
        Use the token \`Color/Border/Neutral\` in your code.
        Example: \`Semantic.Color.Focus\`
      `;
      
      const tokens = extractTokenPathsFromText(content);
      
      assert.strictEqual(tokens.length, 0);
    });

    it('should exclude generic terms (false positives)', () => {
      const content = `
        Font/Size: 16px
        Dimension/Spacing: 8px
        Color/Red: #FF0000
        Size/Large: 100px
        Radius/Small: 4px
        Width/Full: 100%
        Height/Auto: auto
        Padding/Default: 16px
        Margin/Zero: 0px
      `;
      
      const tokens = extractTokenPathsFromText(content);
      
      // All should be filtered out as they are generic 2-segment terms
      assert.strictEqual(tokens.length, 0);
    });

    it('should NOT exclude valid multi-segment token paths', () => {
      const content = `
        Color/Border/Feedback
        Font/Size/Large
        Dimension/Spacing/Small
      `;
      
      const tokens = extractTokenPathsFromText(content);
      
      // These are valid 3-segment paths, should NOT be filtered
      assert.ok(tokens.includes('Color/Border/Feedback'));
      assert.ok(tokens.includes('Font/Size/Large'));
      assert.ok(tokens.includes('Dimension/Spacing/Small'));
    });

    it('should include valid token paths that start with specific collections', () => {
      const content = `
        Primitives.Color.Blue.100
        Components.Button.Background
        Semantic.Color.Border
        A11y.Dimension.Min-Hit-Area
      `;
      
      const tokens = extractTokenPathsFromText(content);
      
      assert.ok(tokens.includes('Primitives.Color.Blue.100'));
      assert.ok(tokens.includes('Components.Button.Background'));
      assert.ok(tokens.includes('Semantic.Color.Border'));
      assert.ok(tokens.includes('A11y.Dimension.Min-Hit-Area'));
    });

    it('should remove duplicate tokens', () => {
      const content = `
        first: Color/Border/Feedback
        second: Color/Border/Feedback
        third: Semantic.Color.Focus
        fourth: Semantic.Color.Focus
      `;
      
      const tokens = extractTokenPathsFromText(content);
      
      const colorBorderCount = tokens.filter(t => t === 'Color/Border/Feedback').length;
      const semanticFocusCount = tokens.filter(t => t === 'Semantic.Color.Focus').length;
      
      assert.strictEqual(colorBorderCount, 1);
      assert.strictEqual(semanticFocusCount, 1);
    });

    it('should handle mixed content with valid and invalid tokens', () => {
      const content = `
        Valid token: Color/Border/Feedback/Information
        URL to ignore: https://figma.com/file/abc123
        Generic term: Font/Size
        Another valid: Semantic.Color.Focus-Outline.Inner
        Code block: \`Color/Icon/Feedback\`
      `;
      
      const tokens = extractTokenPathsFromText(content);
      
      assert.ok(tokens.includes('Color/Border/Feedback/Information'));
      assert.ok(tokens.includes('Semantic.Color.Focus-Outline.Inner'));
      assert.ok(!tokens.includes('Font/Size'));
      assert.ok(!tokens.some(t => t.includes('figma')));
      assert.ok(!tokens.includes('Color/Icon/Feedback'));
    });

    it('should handle empty or whitespace-only content', () => {
      assert.strictEqual(extractTokenPathsFromText('').length, 0);
      assert.strictEqual(extractTokenPathsFromText('   ').length, 0);
      assert.strictEqual(extractTokenPathsFromText('\n\n').length, 0);
    });

    it('should handle token paths with hyphens', () => {
      const content = `
        focus-outline: Semantic.Color.Focus-Outline.Inner
        min-hit-area: A11y.A11y.Dimension.Min-Hit-Area
        feedback-default: Color/Background/Feedback-Default
      `;

      const tokens = extractTokenPathsFromText(content);

      assert.ok(tokens.includes('Semantic.Color.Focus-Outline.Inner'));
      assert.ok(tokens.includes('A11y.A11y.Dimension.Min-Hit-Area'));
      assert.ok(tokens.includes('Color/Background/Feedback-Default'));
    });
  });

  describe('loadYamlFile', () => {
    it('should return null for non-existent file', () => {
      const result = loadYamlFile('/non/existent/file.yml');
      assert.strictEqual(result, null);
    });

    it('should return null for YAML array at root', () => {
      const fixturePath = path.join(TEST_FIXTURES_DIR, 'array-root.yml');
      fs.writeFileSync(fixturePath, '- item1\n- item2\n', 'utf8');

      const result = loadYamlFile(fixturePath);

      assert.strictEqual(result, null);
    });

    it('should return null for YAML primitive at root', () => {
      const fixturePath = path.join(TEST_FIXTURES_DIR, 'primitive-root.yml');
      fs.writeFileSync(fixturePath, 'just a string', 'utf8');

      const result = loadYamlFile(fixturePath);

      assert.strictEqual(result, null);
    });

    it('should return parsed object for valid YAML object', () => {
      const fixturePath = path.join(TEST_FIXTURES_DIR, 'valid-object.yml');
      fs.writeFileSync(fixturePath, 'name: Test\nstatus: draft\n', 'utf8');

      const result = loadYamlFile(fixturePath);

      assert.ok(result !== null);
      assert.strictEqual(result?.name, 'Test');
      assert.strictEqual(result?.status, 'draft');
    });

    it('should return null for invalid YAML syntax', () => {
      const fixturePath = path.join(TEST_FIXTURES_DIR, 'invalid-yaml.yml');
      // Truly invalid YAML: tab character at start causes parse error
      fs.writeFileSync(fixturePath, 'name: Test\n\tinvalid: tab indent\n', 'utf8');

      const result = loadYamlFile(fixturePath);

      assert.strictEqual(result, null);
    });

    it('should handle nested YAML objects', () => {
      const fixturePath = path.join(TEST_FIXTURES_DIR, 'nested-object.yml');
      fs.writeFileSync(fixturePath, 'figma:\n  file: abc123\n  page: Components\n', 'utf8');

      const result = loadYamlFile(fixturePath);

      assert.ok(result !== null);
      assert.ok(typeof result.figma === 'object');
      assert.strictEqual(result.figma?.file, 'abc123');
    });
  });
});
