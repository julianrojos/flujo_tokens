/**
 * Capture Markdown Sections
 *
 * Handles injection of extracted spec sections into markdown documentation.
 * Provides utilities for replacing H2 sections and appending spec exhibits.
 *
 * Note: This is a simplified version that works with basic section injection.
 * For full enriched markdown generation, use figma-node-spec-extractor.ts directly.
 */

/**
 * Spec exhibit data structure.
 */
export interface SpecExhibit {
  /** Image URL for the exhibit. */
  imageUrl?: string | null;
  /** Node ID for the exhibit. */
  nodeId?: string | null;
}

/**
 * Section injection result.
 */
export interface SectionInjectionResult {
  /** Whether the markdown was changed. */
  changed: boolean;
  /** The resulting markdown content. */
  content: string;
}

/**
 * Escape special regex characters in a string.
 *
 * @internal Utility helper for internal use or testing. Not a stable public API.
 * @param rawValue - String to escape.
 * @returns Escaped string safe for regex construction.
 */
export function escapeRegex(rawValue: string): string {
  return String(rawValue || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace content under an H2 heading in markdown.
 *
 * @internal Utility helper for internal use or testing. Not a stable public API.
 * @param markdown - Original markdown content.
 * @param heading - H2 heading text to find.
 * @param replacementBody - New body content for the section.
 * @returns Result with changed flag and new content.
 */
export function replaceH2Section(
  markdown: string,
  heading: string,
  replacementBody: string,
): SectionInjectionResult {
  const normalizedBody = String(replacementBody || '').trimEnd();
  const headingRegex = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`, 'm');
  const headingMatch = headingRegex.exec(markdown);

  if (!headingMatch) {
    return { changed: false, content: markdown };
  }

  const sectionStart = headingMatch.index;
  const headingLineEnd = markdown.indexOf('\n', sectionStart);
  const hasTrailingNewline = headingLineEnd >= 0;

  const headingLine = hasTrailingNewline
    ? markdown.slice(sectionStart, headingLineEnd + 1)
    : `${markdown.slice(sectionStart)}\n`;

  const bodyStart = hasTrailingNewline ? headingLineEnd + 1 : markdown.length;
  const tail = markdown.slice(bodyStart);
  const nextHeadingMatch = /^##\s+[^\n]+\s*$/m.exec(tail);

  const sectionEnd =
    nextHeadingMatch && Number.isFinite(nextHeadingMatch.index)
      ? bodyStart + nextHeadingMatch.index
      : markdown.length;

  const before = markdown.slice(0, sectionStart);
  const after = markdown.slice(sectionEnd).replace(/^\n*/, '\n');
  const replacement = `${headingLine}\n${normalizedBody}\n\n`;
  const next = `${before}${replacement}${after}`;

  return { changed: next !== markdown, content: next };
}

/**
 * Build markdown for a spec exhibit block.
 *
 * @internal Utility helper for internal use or testing. Not a stable public API.
 * @param label - Exhibit label (e.g., "Anatomy", "Properties").
 * @param exhibit - Exhibit data with image URL and node ID.
 * @returns Markdown string for the exhibit block.
 */
export function buildSpecExhibitMarkdown(label: string, exhibit: SpecExhibit | null): string {
  const imageUrl = String(exhibit?.imageUrl || '').trim();
  const nodeId = String(exhibit?.nodeId || '').trim();

  if (!imageUrl && !nodeId) {
    return '';
  }

  const lines = [`### ${label} exhibit`];

  if (imageUrl) {
    lines.push('', `![${label} exhibit](${imageUrl})`);
  }

  if (nodeId) {
    lines.push('', `- Source node: \`${nodeId}\``);
  }

  return lines.join('\n');
}

/**
 * Append a spec exhibit block to section body.
 *
 * @internal Utility helper for internal use or testing. Not a stable public API.
 * @param sectionBody - Current section body content.
 * @param label - Exhibit label.
 * @param exhibit - Exhibit data.
 * @returns Updated section body with exhibit appended.
 */
export function appendSpecExhibit(
  sectionBody: string,
  label: string,
  exhibit: SpecExhibit | null,
): string {
  const normalized = String(sectionBody || '').trimEnd();
  const exhibitBlock = buildSpecExhibitMarkdown(label, exhibit);

  if (!exhibitBlock) {
    return normalized;
  }

  if (!normalized) {
    return exhibitBlock;
  }

  return `${normalized}\n\n${exhibitBlock}`;
}

// Note: injectExtractedSpecSectionsIntoMarkdown has been removed.
// Use spec-to-markdown-injector.ts or figma-node-spec-extractor.ts for full section injection.
