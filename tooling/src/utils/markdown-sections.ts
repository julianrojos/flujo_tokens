/**
 * Markdown Sections Utilities
 *
 * Utilities for extracting sections from markdown content.
 * Migrated from tooling/scripts/lib/markdown-sections.mjs
 */

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(source: string): string {
  return String(source || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the body content of a specific H2 section from markdown.
 *
 * @param rawMarkdown - Raw markdown content
 * @param headingTitle - H2 heading title to extract (without ##)
 * @returns Section body content (trimmed)
 */
export function extractSectionBody(rawMarkdown: string, headingTitle: string): string {
  const markdown = String(rawMarkdown || '');
  const escaped = escapeRegex(headingTitle);
  const headingRegex = new RegExp(`^##\\s+${escaped}\\s*$`, 'm');
  const headingMatch = headingRegex.exec(markdown);
  if (!headingMatch) return '';

  const start = headingMatch.index;
  const headingEnd = markdown.indexOf('\n', start);
  const contentStart = headingEnd === -1 ? markdown.length : headingEnd + 1;
  const rest = markdown.slice(contentStart);
  const nextHeadingMatch = /^##\s+/m.exec(rest);
  const end = nextHeadingMatch
    ? contentStart + nextHeadingMatch.index
    : markdown.length;
  return markdown.slice(contentStart, end).trim();
}
