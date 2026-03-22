/**
 * Spec Response Parser
 *
 * Parse YAML responses from AI agents, stripping markdown fences.
 */
import * as yaml from 'js-yaml';

/**
 * Result of parsing a YAML response.
 */
export interface YamlParseResult<T = unknown> {
  ok: boolean;
  data: T | null;
  error: string | null;
}

/**
 * Strip markdown YAML code fences from text.
 * Handles ```yaml, ```yml, or plain ``` blocks.
 * Tolerant of leading/trailing whitespace and text before/after the fence (LLM noise).
 * Uses indexOf for robust fence detection (works even if fence is inline with text).
 */
function stripMarkdownFences(text: string): string {
  const trimmed = String(text || '').trim();
  
  // Find opening and closing fences using indexOf (more robust than regex)
  const openFenceIndex = trimmed.indexOf('```');
  if (openFenceIndex === -1) return trimmed;  // No fences found, return as-is
  
  // Find the end of the opening fence line
  const fenceEndLine = trimmed.indexOf('\n', openFenceIndex);
  const contentStart = fenceEndLine === -1 ? openFenceIndex + 3 : fenceEndLine + 1;
  
  // Find closing fence (search from contentStart to avoid matching the same fence)
  const closeFenceIndex = trimmed.indexOf('```', contentStart);
  if (closeFenceIndex === -1) return trimmed;  // No closing fence found
  
  // Extract content between fences
  const content = trimmed.slice(contentStart, closeFenceIndex).trim();
  
  // Remove language identifier from the start if present (yaml, yml, etc.)
  const firstNewline = content.indexOf('\n');
  if (firstNewline === -1) {
    // Single line - check if it's just the language identifier
    if (/^(yaml|yml)?$/i.test(content)) return '';
    return content;
  }
  
  const maybeLang = content.slice(0, firstNewline).trim();
  if (/^(yaml|yml)?$/i.test(maybeLang)) {
    return content.slice(firstNewline + 1).trim();
  }
  
  return content;
}

/**
 * Parse a YAML response string, handling markdown fences.
 *
 * @param rawText - Raw response text (may include markdown fences)
 * @returns Parse result with data or error message
 */
export function parseYamlResponse<T = unknown>(rawText: string): YamlParseResult<T> {
  const cleanedText = stripMarkdownFences(rawText);
  try {
    const parsed = yaml.load(cleanedText) as T;
    return {
      ok: true,
      data: parsed,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
