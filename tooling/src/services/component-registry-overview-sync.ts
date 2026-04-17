/**
 * Component Registry Overview Sync
 *
 * Syncs component list in overview.md from registry.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { normalizeSortKey } from './component-registry-utils.js';
import type {
  ComponentOverviewListState,
  ComponentRegistry,
  SyncOverviewResult,
} from '../types/component-registry.js';

export const OVERVIEW_EMPTY_STATE_LINE =
  '_No component docs are registered yet for this design system._';
export const OVERVIEW_NOT_IMPORTED_STATE_LINE =
  '_No design system has been imported yet. Import one to populate this list._';

/**
 * Build markdown list lines from component entries.
 */
export function buildComponentListLines(
  components: unknown[],
): string[] {
  const entries = (Array.isArray(components) ? components : [])
    .filter((component): component is Record<string, unknown> => {
      const comp = component as Record<string, unknown>;
      const doc = comp?.doc;
      const existsValue = (doc as Record<string, unknown>).exists;
      return doc && typeof doc === 'object' && (existsValue === true || existsValue === 'true') ? true : false;
    })
    .map((component) => ({
      displayName: String((component as Record<string, unknown>).display_name || '').trim(),
      target: `${(component as Record<string, unknown>).slug || ''}.md`,
    }))
    .sort((a, b) => {
      const keyA = normalizeSortKey(a.displayName);
      const keyB = normalizeSortKey(b.displayName);
      const byName = keyA.localeCompare(keyB, 'en', { sensitivity: 'base' });
      if (byName !== 0) return byName;
      return a.target.localeCompare(b.target, 'en', { sensitivity: 'base' });
    });

  return entries.map((entry) => `- [${entry.displayName}](${entry.target})`);
}

function buildComponentListSectionLines(
  componentListLines: string[],
  listState: ComponentOverviewListState,
): string[] {
  if (componentListLines.length > 0) {
    return componentListLines;
  }
  if (listState === 'not-imported') {
    return [OVERVIEW_NOT_IMPORTED_STATE_LINE];
  }
  return [OVERVIEW_EMPTY_STATE_LINE];
}

/**
 * Insert or update component list section in markdown.
 */
export function upsertComponentList(markdown: string, componentListLines: string[]): string {
  const source = String(markdown || '').replace(/\r\n/g, '\n');
  const sectionHeading = /^##\s+Component list\s*$/im;
  const headingMatch = sectionHeading.exec(source);

  const sectionBody = componentListLines.length > 0
    ? `${componentListLines.join('\n')}\n`
    : '';

  if (!headingMatch) {
    const trimmed = source.replace(/\s+$/, '');
    const separator = trimmed ? '\n\n' : '';
    return `${trimmed}${separator}## Component list\n\n${sectionBody}`;
  }

  const headingStart = headingMatch.index;
  const headingLineEnd = source.indexOf('\n', headingStart);
  const bodyStart = headingLineEnd === -1 ? source.length : headingLineEnd + 1;
  const remaining = source.slice(bodyStart);
  const nextH2Match = /^##\s+/m.exec(remaining);
  const bodyEnd = nextH2Match ? bodyStart + nextH2Match.index : source.length;

  const before = source.slice(0, bodyStart).replace(/\s*$/, '\n\n');
  const after = source.slice(bodyEnd).replace(/^\n*/, '\n');
  return `${before}${sectionBody}${after}`;
}

/**
 * Sync component list in overview.md from registry.
 */
export function syncComponentOverview(
  options: {
    overviewPath?: string;
    dryRun?: boolean;
    registry: ComponentRegistry;
    listState?: ComponentOverviewListState;
  },
): SyncOverviewResult {
  const {
    dryRun = false,
  } = options;
  const overviewPath = String(options.overviewPath || '').trim();
  if (!overviewPath) {
    throw new Error('overviewPath is required. Resolve it from the active design system context.');
  }

  const resolvedOverviewPath = path.resolve(overviewPath);

  if (!fs.existsSync(resolvedOverviewPath)) {
    throw new Error(`Overview file not found: ${resolvedOverviewPath}`);
  }

  const registryPayload = options.registry;
      
  const componentListLines = buildComponentListLines(
    registryPayload.components || [],
  );
  const resolvedListState = options.listState || (componentListLines.length > 0 ? 'ready' : 'empty');
  const componentListSectionLines = buildComponentListSectionLines(componentListLines, resolvedListState);

  const currentMarkdown = fs.readFileSync(resolvedOverviewPath, 'utf8');
  const nextMarkdown = upsertComponentList(currentMarkdown, componentListSectionLines);
  const changed = nextMarkdown !== currentMarkdown;

  if (changed && !dryRun) {
    fs.writeFileSync(resolvedOverviewPath, nextMarkdown, 'utf8');
  }

  return {
    ok: true,
    dryRun,
    changed,
    written: changed && !dryRun,
    overviewPath: resolvedOverviewPath,
    databaseUrl: 'db://component-registry',
    componentCount: componentListLines.length,
    listState: resolvedListState,
  };
}
