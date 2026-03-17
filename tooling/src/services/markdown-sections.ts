/**
 * Markdown Section Extraction Utilities
 *
 * Extract section bodies from markdown documents by heading.
 */

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(source: string): string {
  return String(source || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the body content under a specific H2 heading.
 * Returns all content from after the heading until the next H2 or end of document.
 *
 * @param rawMarkdown - The full markdown content
 * @param headingTitle - The H2 heading text to find (without the ## prefix)
 * @returns The section body text (trimmed), or empty string if heading not found
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
  const end = nextHeadingMatch ? contentStart + nextHeadingMatch.index : markdown.length;

  return markdown.slice(contentStart, end).trim();
}
