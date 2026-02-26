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

/**
 * Spec sections content for injection.
 */
export interface SpecSectionsContent {
  anatomy: string;
  componentApi: string;
  visualSpecifications: string;
}

/**
 * Build spec sections content from extracted spec.
 *
 * @param spec - Extracted component spec.
 * @returns Spec sections content.
 */
export function buildSpecSectionsContent(spec: Record<string, unknown>): SpecSectionsContent {
  const anatomy = Array.isArray(spec.anatomy)
    ? (spec.anatomy as unknown[])
        .map((item) => {
          if (item && typeof item === 'object' && 'name' in item) {
            const it = item as { name: string; description?: string };
            return `- **${it.name}**: ${it.description || 'TBD'}`;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n')
    : 'TBD';

  const componentApi = Array.isArray(spec.properties)
    ? (spec.properties as unknown[])
        .map((item) => {
          if (item && typeof item === 'object' && 'name' in item) {
            const it = item as { name: string; type?: string; required?: boolean };
            return `- **${it.name}**: ${it.type || 'unknown'}${it.required ? ' (required)' : ''}`;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n')
    : 'TBD';

  const visualSpecifications =
    spec.layout && typeof spec.layout === 'object'
      ? `Layout: ${JSON.stringify(spec.layout, null, 2)}`
      : 'TBD';

  return {
    anatomy,
    componentApi,
    visualSpecifications,
  };
}

/**
 * Inject extracted spec sections into markdown documentation.
 *
 * Replaces Anatomy, Component API, and Visual Specifications sections
 * with content extracted from Figma spec, optionally including exhibits.
 *
 * @param markdown - Original markdown content.
 * @param spec - Spec object with anatomy, properties, layout, variants.
 * @param exhibits - Optional exhibits for anatomy, properties, and layout.
 * @returns Result with changed flag and updated markdown content.
 */
export function injectExtractedSpecSectionsIntoMarkdown(
  markdown: string,
  spec: Record<string, unknown> | null,
  exhibits: {
    anatomy?: SpecExhibit | null;
    properties?: SpecExhibit | null;
    layout?: SpecExhibit | null;
  } | null = {},
): SectionInjectionResult {
  if (!spec || typeof spec !== 'object') {
    return { changed: false, content: markdown };
  }

  const sections = buildSpecSectionsContent(spec);

  const anatomyBody = appendSpecExhibit(
    sections.anatomy,
    'Anatomy',
    exhibits?.anatomy ?? null,
  );

  const componentApiBody = appendSpecExhibit(
    sections.componentApi,
    'Properties',
    exhibits?.properties ?? null,
  );

  const visualSpecsBody = appendSpecExhibit(
    sections.visualSpecifications,
    'Layout and spacing',
    exhibits?.layout ?? null,
  );

  let current = markdown;
  let changed = false;

  const anatomyResult = replaceH2Section(current, 'Anatomy', anatomyBody);
  current = anatomyResult.content;
  changed = changed || anatomyResult.changed;

  const apiResult = replaceH2Section(current, 'Component API', componentApiBody);
  current = apiResult.content;
  changed = changed || apiResult.changed;

  const visualResult = replaceH2Section(
    current,
    'Visual Specifications',
    visualSpecsBody,
  );
  current = visualResult.content;
  changed = changed || visualResult.changed;

  return { changed, content: current };
}

// Note: For full enriched markdown generation, use figma-node-spec-extractor.ts directly.
