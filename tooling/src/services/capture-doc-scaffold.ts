/**
 * Capture Doc Scaffold
 *
 * Creates initial documentation structure for components.
 * Handles atomic writes and seed content generation.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import crypto from 'node:crypto';

import { componentNameToDisplayName } from '../utils/component-name.js';

/**
 * Options for ensuring system docs scaffold.
 */
export interface EnsureSystemDocsScaffoldOptions {
  docsRootDir: string;
  componentDocsDir: string;
}

/**
 * Result of ensuring system docs scaffold.
 */
export interface EnsureSystemDocsScaffoldResult {
  specsDir: string;
  generatedDir: string;
  overviewPath: string;
}

/**
 * Write text to file atomically using temp file + rename.
 */
export function writeTextAtomic(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const uniqueId = crypto.randomBytes(4).toString('hex');
  const ts = Date.now();
  const pid = process.pid;
  const tempPath = `${filePath}.${pid}.${ts}.${uniqueId}.tmp`;
  fs.writeFileSync(tempPath, content, 'utf8');
  fs.renameSync(tempPath, filePath);
}

/**
 * Build seed content for overview.md.
 */
export function buildOverviewSeed(): string {
  return `---
doc_type: overview
doc_status: draft
---

# Components Overview

## Component list

`;
}

/**
 * Ensure system documentation scaffold exists.
 */
export function ensureSystemDocsScaffold(
  options: EnsureSystemDocsScaffoldOptions,
): EnsureSystemDocsScaffoldResult {
  const { docsRootDir, componentDocsDir } = options;
  
  const specsDir = path.join(docsRootDir, '_spec', 'components');
  const generatedDir = path.join(docsRootDir, '_generated');
  const overviewPath = path.join(componentDocsDir, 'overview.md');

  fs.mkdirSync(componentDocsDir, { recursive: true });
  fs.mkdirSync(specsDir, { recursive: true });
  fs.mkdirSync(generatedDir, { recursive: true });

  if (!fs.existsSync(overviewPath)) {
    writeTextAtomic(overviewPath, buildOverviewSeed());
  }

  return { specsDir, generatedDir, overviewPath };
}

/**
 * Build seed markdown for new component.
 */
export function buildMarkdownSeed(params: {
  slug: string;
  candidateName?: string;
  nodeUrl?: string;
  nodeId?: string;
}): string {
  const { slug, candidateName, nodeUrl, nodeId } = params;
  const displayName = componentNameToDisplayName(candidateName || slug) || 'Component';
  
  return `---
doc_type: component
doc_status: draft
figma:
  file_url: ${nodeUrl || 'TBD'}
  page: TBD
  component: ${displayName}
  component_set_node_id: ${nodeId || 'TBD'}
  last_verified: TBD
---

# ${displayName}

Auto-generated placeholder created during Figma capture workflow.

## Overview

- Purpose: TBD
- Figma component set: ${nodeId || 'TBD'}
- Variant properties: TBD
- Artwork source instance: Required hidden instance used to drive Anatomy, Properties, and Layout and spacing sections.

### Visual Proof

- Screenshot: TBD
- Source node: ${nodeId || 'TBD'}
- Artifact: TBD

## Anatomy

1. **Container**: TBD
2. **Primary element**: TBD
`;
}
