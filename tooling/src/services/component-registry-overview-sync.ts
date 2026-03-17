/**
 * Component Registry Overview Sync
 *
 * Syncs component list in overview.md from registry.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  DEFAULT_COMPONENT_OVERVIEW_PATH,
  DEFAULT_COMPONENT_REGISTRY_PATH,
} from './component-registry-constants.js';
import { readComponentRegistry } from './component-registry-sync.js';
import { normalizeSortKey } from './component-registry-utils.js';
import type {
  ComponentRegistry,
  SyncOverviewResult,
} from '../types/component-registry.js';

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
    registryPath?: string;
    overviewPath?: string;
    dryRun?: boolean;
    registry?: ComponentRegistry | null;
  } = {},
): SyncOverviewResult {
  const {
    registryPath = DEFAULT_COMPONENT_REGISTRY_PATH,
    overviewPath = DEFAULT_COMPONENT_OVERVIEW_PATH,
    dryRun = false,
    registry = null,
  } = options;
  
  const resolvedRegistryPath = path.resolve(registryPath);
  const resolvedOverviewPath = path.resolve(overviewPath);

  if (!fs.existsSync(resolvedOverviewPath)) {
    throw new Error(`Overview file not found: ${resolvedOverviewPath}`);
  }

  const registryPayload =
    registry && typeof registry === 'object'
      ? registry
      : readComponentRegistry(resolvedRegistryPath).registry!;
      
  const componentListLines = buildComponentListLines(
    registryPayload.components || [],
  );

  const currentMarkdown = fs.readFileSync(resolvedOverviewPath, 'utf8');
  const nextMarkdown = upsertComponentList(currentMarkdown, componentListLines);
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
    registryPath: resolvedRegistryPath,
    componentCount: componentListLines.length,
  };
}
