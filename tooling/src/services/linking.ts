/**
 * Linking Validators
 *
 * Validate overview links.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DocsValidationReport } from './docs-validator-types.js';
import { buildLineStarts, lineFromOffset, compareAlpha } from './runtime-utils.js';
import { normalizeHeadingText } from './markdown-quality.js';

const CANONICAL_COMPONENT_LIST_HEADING = 'component list';
const OVERVIEW_ENTRY_RE = /^-\s+\[([^\]]+)\]\(([^)]+)\)\s*$/;
const OVERVIEW_TARGET_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*\.md$/;

export interface ValidateOverviewLinksOptions {
  docsRoot: string;
  componentFiles: string[];
  report: DocsValidationReport;
}

interface OverviewEntry {
  displayName: string;
  target: string;
  absolutePath: string;
  line: number;
}

/**
 * Validate overview links (component list section).
 */
export function validateOverviewLinks(options: ValidateOverviewLinksOptions): void {
  const { docsRoot, componentFiles, report } = options;
  const overviewPath = path.join(docsRoot, 'overview.md');
  if (!fs.existsSync(overviewPath)) {
    report.errors.push({
      code: 'LINK01',
      file: overviewPath,
      message: 'Missing components overview page.',
    });
    return;
  }

  const overviewRaw = fs.readFileSync(overviewPath, 'utf8');
  const lineStarts = buildLineStarts(overviewRaw);
  const content = overviewRaw;
  const contentOffset = 0;

  const headingRegex = /^##\s+(.+?)\s*$/gim;
  let headingMatch: RegExpExecArray | null;
  let sectionStart = -1;
  let sectionEnd = content.length;

  while ((headingMatch = headingRegex.exec(content)) !== null) {
    const headingText = normalizeHeadingText(headingMatch[1]);
    if (sectionStart >= 0) {
      sectionEnd = headingMatch.index;
      break;
    }
    if (headingText === CANONICAL_COMPONENT_LIST_HEADING) {
      sectionStart = headingMatch.index + headingMatch[0].length;
    }
  }

  if (sectionStart < 0) {
    report.errors.push({
      code: 'LINK02',
      file: overviewPath,
      message: 'Missing `## Component list` section in overview.',
    });
    return;
  }

  const sectionText = content.slice(sectionStart, sectionEnd);
  const sectionBaseOffset = contentOffset + sectionStart;
  const sectionLines = sectionText.split('\n');
  const entries: OverviewEntry[] = [];

  for (let i = 0, offset = 0; i < sectionLines.length; i += 1) {
    const line = sectionLines[i];
    const trimmed = String(line || '').trim();
    const lineOffset = sectionBaseOffset + offset;
    offset += line.length + 1;

    if (!trimmed) continue;
    if (!trimmed.startsWith('-')) continue;

    const parsed = trimmed.match(OVERVIEW_ENTRY_RE);
    if (!parsed) {
      report.errors.push({
        code: 'LINK02',
        file: overviewPath,
        line: lineFromOffset(lineStarts, lineOffset),
        message: 'Component list entries must use `- [Display Name](snake_case.md)` format.',
      });
      continue;
    }

    const displayName = String(parsed[1] || '')
      .trim()
      .replace(/\s+/g, ' ');
    const target = String(parsed[2] || '').trim();

    if (!displayName) {
      report.errors.push({
        code: 'LINK02',
        file: overviewPath,
        line: lineFromOffset(lineStarts, lineOffset),
        message: 'Component list entry has an empty display name.',
      });
      continue;
    }

    if (!OVERVIEW_TARGET_RE.test(target)) {
      report.errors.push({
        code: 'LINK02',
        file: overviewPath,
        line: lineFromOffset(lineStarts, lineOffset),
        message: `Component list link target must be snake_case.md: \`${target}\`.`,
      });
      continue;
    }

    entries.push({
      displayName,
      target,
      absolutePath: path.resolve(path.dirname(overviewPath), target),
      line: lineFromOffset(lineStarts, lineOffset),
    });
  }

  if (entries.length === 0) {
    if (componentFiles.length === 0) return;
    report.errors.push({
      code: 'LINK02',
      file: overviewPath,
      message: 'Component list section has no valid entries.',
    });
    return;
  }

  const seenDisplay = new Map<string, number>();
  const seenTarget = new Map<string, number>();
  for (const entry of entries) {
    const displayKey = entry.displayName.toLowerCase();
    if (seenDisplay.has(displayKey)) {
      report.errors.push({
        code: 'LINK02',
        file: overviewPath,
        line: entry.line,
        message: `Duplicate display name in component list: \`${entry.displayName}\`.`,
      });
    } else {
      seenDisplay.set(displayKey, entry.line);
    }

    const targetKey = entry.target.toLowerCase();
    if (seenTarget.has(targetKey)) {
      report.errors.push({
        code: 'LINK02',
        file: overviewPath,
        line: entry.line,
        message: `Duplicate component link in component list: \`${entry.target}\`.`,
      });
    } else {
      seenTarget.set(targetKey, entry.line);
    }
  }

  const normalizedName = (value: string) =>
    String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  const sortedEntries = entries.slice().sort((a, b) => {
    const aName = normalizedName(a.displayName);
    const bName = normalizedName(b.displayName);
    if (aName !== bName) return compareAlpha(aName, bName);
    return compareAlpha(a.target.toLowerCase(), b.target.toLowerCase());
  });

  for (let i = 0; i < entries.length; i += 1) {
    const current = entries[i];
    const expected = sortedEntries[i];
    if (
      current.displayName === expected.displayName &&
      current.target === expected.target
    )
      continue;
    report.errors.push({
      code: 'LINK02',
      file: overviewPath,
      line: current.line,
      message:
        'Component list must be alphabetically sorted by display name (case-insensitive), ' +
        'with filename tie-breaker.',
    });
    break;
  }

  const linkedSet = new Set(entries.map((entry) => entry.absolutePath));
  const componentSet = new Set(componentFiles.map((f) => path.resolve(f)));

  for (const entry of entries) {
    if (!fs.existsSync(entry.absolutePath)) {
      report.errors.push({
        code: 'LINK01',
        file: overviewPath,
        line: entry.line,
        message: `Overview link points to missing file: ${path.relative(process.cwd(), entry.absolutePath)}.`,
      });
    }
  }

  for (const componentFile of componentSet) {
    if (!linkedSet.has(componentFile)) {
      report.errors.push({
        code: 'LINK01',
        file: overviewPath,
        message: `Orphan component doc not listed in overview: ${path.relative(process.cwd(), componentFile)}.`,
      });
    }
  }
}
