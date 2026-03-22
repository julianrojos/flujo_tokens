/**
 * Spec Response Parser Tests
 *
 * Tests for parseYamlResponse and stripMarkdownFences.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseYamlResponse } from './spec-response-parser.js';

describe('spec-response-parser', () => {
  describe('parseYamlResponse()', () => {
    it('should parse YAML from code fence without leading whitespace', () => {
      const rawText = '```yaml\nname: Test\n```\n';
      const result = parseYamlResponse(rawText);
      
      assert.ok(result.ok);
      assert.equal((result.data as any).name, 'Test');
    });

    it('should parse YAML from code fence with leading whitespace/newlines', () => {
      // LLMs often prefix responses with newlines or spaces
      const rawText = '\n\n  ```yaml\nname: Test\n```\n';
      const result = parseYamlResponse(rawText);
      
      assert.ok(result.ok, 'Should parse successfully with leading whitespace');
      assert.equal((result.data as any).name, 'Test');
    });

    it('should handle YAML with yml extension', () => {
      const rawText = '```yml\nname: Test\n```\n';
      const result = parseYamlResponse(rawText);
      
      assert.ok(result.ok);
      assert.equal((result.data as any).name, 'Test');
    });

    it('should handle plain code fence without language', () => {
      const rawText = '```\nname: Test\n```\n';
      const result = parseYamlResponse(rawText);
      
      assert.ok(result.ok);
      assert.equal((result.data as any).name, 'Test');
    });

    it('should return error for invalid YAML', () => {
      const rawText = '```yaml\nname: [unclosed\n```\n';
      const result = parseYamlResponse(rawText);
      
      // Invalid YAML should fail to parse
      assert.ok(!result.ok, 'Should return error for invalid YAML');
    });

    it('should parse plain YAML without code fences as-is', () => {
      const rawText = 'name: Test\n';
      const result = parseYamlResponse(rawText);
      
      // Should try to parse as-is (no fences to strip)
      assert.ok(result.ok);
      assert.equal((result.data as any).name, 'Test');
    });

    it('should parse YAML from code fence with text prefix (LLM noise)', () => {
      // LLMs often prefix with "Here is the YAML:" or similar
      const rawText = 'Here is the YAML:\n\n```yaml\nname: Test\n```\n';
      const result = parseYamlResponse(rawText);
      
      assert.ok(result.ok, 'Should parse successfully with text prefix');
      assert.equal((result.data as any).name, 'Test');
    });

    it('should parse YAML from inline fence (text before fence on same line)', () => {
      // Edge case: fence on same line as text (less common but possible)
      const rawText = 'Here: ```yaml\nname: Test\n```';
      const result = parseYamlResponse(rawText);
      
      assert.ok(result.ok, 'Should parse successfully with inline fence');
      assert.equal((result.data as any).name, 'Test');
    });
  });
});