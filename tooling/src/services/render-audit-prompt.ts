/**
 * Render Audit Prompt
 *
 * Builds audit prompts for render validation.
 */

export interface BuildRenderAuditPromptOptions {
  figmaUrl?: string;
  targetSectionId: string;
  targetSectionName: string;
  expectedSectionName: string;
  expectedCardCount: number;
  expectedTableCount: number;
}

/**
 * Build audit prompt for render validation.
 */
export function buildRenderAuditPrompt(options: BuildRenderAuditPromptOptions): string {
  const {
    figmaUrl,
    targetSectionId,
    targetSectionName,
    expectedSectionName,
    expectedCardCount,
    expectedTableCount,
  } = options;

  return [
    'Context',
    '- Validate that the Figma documentation section was rendered by the themed markdown renderer (not a fallback renderer).',
    '',
    'Sources',
    figmaUrl ? `- Figma URL (if connection needed): ${figmaUrl}` : '',
    `- Target section id: ${targetSectionId}`,
    `- Target section name from render report: ${targetSectionName}`,
    `- Expected section name: ${expectedSectionName}`,
    `- Expected H2 card count: ${expectedCardCount}`,
    `- Expected table count: ${expectedTableCount}`,
    '',
    'Constraints',
    '- Read-only audit: do not modify any node.',
    '- Use figma_execute to inspect only descendants of the target section id.',
    '- has_doc_canvas: true only if a direct child FRAME named "Doc Canvas" exists.',
    '- card_count: number of descendant FRAME nodes with names starting with "Card/".',
    '- table_container_count: number of descendant FRAME nodes named exactly "Table".',
    '- header_row_count: number of descendant FRAME nodes named exactly "Header Row".',
    '- body_row_count: number of descendant FRAME nodes named exactly "Body Row".',
    "- pass must be true only when the structure is consistent with the expected themed renderer output.",
    '- Return exactly one JSON object and no prose.',
    '',
    'Expected Output',
    '- JSON keys: ok, pass, target_section_id, target_section_name, has_doc_canvas, card_count, table_container_count, header_row_count, body_row_count, reasons.',
  ]
    .filter(Boolean)
    .join('\n');
}
