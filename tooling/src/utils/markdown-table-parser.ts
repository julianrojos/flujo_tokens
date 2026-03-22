/**
 * Markdown Table Parser
 *
 * Generic utilities for parsing markdown tables.
 * Domain-agnostic - can be reused across different validators.
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface MarkdownTable {
  headerCells: string[];
  headerOffset: number;
  rows: { cells: string[]; offset: number }[];
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize cell text by removing backticks.
 */
export function normalizeCellText(cell: string): string {
  return String(cell || '').replace(/`/g, '').trim();
}

/**
 * Check if a line is part of a markdown table.
 */
export function isTableLine(line: string): boolean {
  const trimmed = String(line || '').trim();
  if (!trimmed || /^```/.test(trimmed)) return false;
  const pipeCount = (trimmed.match(/\|/g) || []).length;
  return pipeCount >= 1;
}

/**
 * Parse table cells from a markdown table line.
 */
export function parseTableCells(line: string): string[] {
  let trimmed = String(line || '').trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  const cells: string[] = [];
  let current = '';
  let inCode = false;

  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];

    if (ch === '\\') {
      const next = trimmed[i + 1];
      if (next === '|' || next === '\\' || next === '`') {
        current += next;
        i += 1;
        continue;
      }
      current += ch;
      continue;
    }

    if (ch === '`') {
      inCode = !inCode;
      current += ch;
      continue;
    }

    if (ch === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  cells.push(current.trim());
  return cells;
}

/**
 * Check if cells form a separator row in a markdown table.
 */
export function isSeparatorRow(cells: string[]): boolean {
  if (!Array.isArray(cells) || cells.length === 0) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

/**
 * Collect all markdown tables from content.
 */
export function collectMarkdownTables(content: string): MarkdownTable[] {
  const lines = String(content || '').split('\n');
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

  const tables: MarkdownTable[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!isTableLine(lines[i])) {
      i += 1;
      continue;
    }

    let j = i;
    while (j < lines.length && isTableLine(lines[j])) j += 1;
    const blockLength = j - i;

    if (blockLength >= 2) {
      const headerCells = parseTableCells(lines[i]);
      const separatorCells = parseTableCells(lines[i + 1]);
      if (isSeparatorRow(separatorCells)) {
        const rows = [];
        for (let k = i + 2; k < j; k += 1) {
          rows.push({
            cells: parseTableCells(lines[k]),
            offset: lineOffsets[k],
          });
        }
        tables.push({
          headerCells,
          headerOffset: lineOffsets[i],
          rows,
        });
      }
    }

    i = j;
  }

  return tables;
}

/**
 * Find header index by needle text.
 */
export function findHeaderIndex(cells: string[], needle: string): number {
  const key = String(needle || '').trim().toLowerCase();
  return cells.findIndex((cell) => normalizeCellText(cell).toLowerCase().includes(key));
}
