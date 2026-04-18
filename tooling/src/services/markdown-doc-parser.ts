/**
 * Markdown Document Parser
 *
 * Utilities for parsing markdown documentation structure.
 * Extracted from figma.ts to share parsing helpers with other modules.
 */

import { extractSectionBody } from './markdown-sections.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Visual Proof section data extracted from markdown.
 * Represents the presence and content of the Visual Proof section
 * under the Overview heading.
 */
export interface VisualProofSection {
  /** Whether the document has an Overview section */
  hasOverview: boolean;
  /** Whether the Overview contains a Visual Proof subsection */
  hasSection: boolean;
  /** Character offset of the Visual Proof heading in the document */
  headingOffset: number;
  /** Body content of the Visual Proof section (trimmed) */
  body: string;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Escape special regex characters in string.
 *
 * @param value - String to escape
 * @returns Escaped string safe for regex construction
 */
export function escapeRegex(value: string): string {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract H2 section range from markdown.
 *
 * Finds the section starting with `## <headingTitle>` and returns
 * the body content up to the next H2 heading.
 *
 * @param rawMarkdown - Full markdown content
 * @param headingTitle - H2 heading title to find (e.g., "Overview")
 * @returns Section range with offsets and body, or null if not found
 */
export function getH2SectionRange(
  rawMarkdown: string,
  headingTitle: string
): { headingOffset: number; bodyStart: number; end: number; body: string } | null {
  const raw = String(rawMarkdown || '');
  const headingRegex = new RegExp(`^##\\s+${escapeRegex(headingTitle)}\\s*$`, 'm');
  const headingMatch = headingRegex.exec(raw);
  if (!headingMatch) return null;

  const headingLineEnd = raw.indexOf('\n', headingMatch.index);
  const bodyStart = headingLineEnd === -1 ? raw.length : headingLineEnd + 1;
  const rest = raw.slice(bodyStart);
  const nextHeadingMatch = /^##\s+/m.exec(rest);
  const end = nextHeadingMatch ? bodyStart + nextHeadingMatch.index : raw.length;

  return {
    headingOffset: headingMatch.index,
    bodyStart,
    end,
    body: raw.slice(bodyStart, end),
  };
}

/**
 * Find discrepancy statuses in Design-Token Discrepancies section.
 *
 * Parses the table and extracts status values (open, accepted, resolved)
 * from the status column.
 *
 * @param rawMarkdown - Full markdown content
 * @returns Array of status values found (lowercase)
 */
export function findDiscrepancyStatuses(rawMarkdown: string): string[] {
  const body = extractSectionBody(rawMarkdown, 'Design–Token Discrepancies');
  if (!body) return [];
  const matches: string[] = [];
  const statusCellRegex = /\|\s*`?(open|accepted|resolved)`?\s*\|/gi;
  let match: RegExpExecArray | null;
  while ((match = statusCellRegex.exec(body)) !== null) {
    matches.push(String(match[1] || '').toLowerCase());
  }
  return matches;
}

/**
 * Extract Visual Proof section from markdown.
 *
 * Looks for `### Visual Proof` under `## Overview` and returns
 * the section body content.
 *
 * @param rawMarkdown - Full markdown content
 * @returns Visual proof section data with presence flags and body
 */
export function extractVisualProof(rawMarkdown: string): VisualProofSection {
  const overview = getH2SectionRange(rawMarkdown, 'Overview');
  if (!overview) {
    return {
      hasOverview: false,
      hasSection: false,
      headingOffset: -1,
      body: '',
    };
  }

  const visualHeadingRegex = /^###\s+Visual Proof\s*$/m;
  const headingMatch = visualHeadingRegex.exec(overview.body);
  if (!headingMatch) {
    return {
      hasOverview: true,
      hasSection: false,
      headingOffset: overview.headingOffset,
      body: '',
    };
  }

  const absoluteHeadingOffset = overview.bodyStart + headingMatch.index;
  const afterHeadingRaw = overview.body.slice(headingMatch.index + headingMatch[0].length);
  const afterHeading = afterHeadingRaw.replace(/^\n+/, '');
  const nextH3Match = /^###\s+/m.exec(afterHeading);
  const body = (nextH3Match
    ? afterHeading.slice(0, nextH3Match.index)
    : afterHeading
  ).trim();

  return {
    hasOverview: true,
    hasSection: true,
    headingOffset: absoluteHeadingOffset,
    body,
  };
}
