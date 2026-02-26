/**
 * Capture Doc Scaffold
 *
 * Utilities for creating documentation scaffold (markdown seeds, atomic writes).
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { componentNameToDisplayName } from '../utils/component-name.js';

/**
 * Write text to file atomically using temp file + rename.
 *
 * Uses crypto random bytes to prevent race conditions when multiple processes
 * write to the same file concurrently.
 *
 * @param filePath - Target file path.
 * @param content - Content to write.
 */
export function writeTextAtomic(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${randomSuffix}.tmp`;
  fs.writeFileSync(tempPath, content, 'utf8');
  fs.renameSync(tempPath, filePath);
}

/**
 * Build overview markdown seed.
 *
 * @returns Overview markdown content.
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
 * Ensure system docs scaffold exists.
 *
 * @param params - Scaffold parameters.
 * @returns Created directories and files.
 */
export function ensureSystemDocsScaffold(params: {
  docsRootDir: string;
  componentDocsDir: string;
}): {
  specsDir: string;
  generatedDir: string;
  overviewPath: string;
} {
  const { docsRootDir, componentDocsDir } = params;

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
 * Build markdown seed for a component.
 *
 * @param params - Seed parameters.
 * @returns Markdown content.
 */
export function buildMarkdownSeed(params: {
  slug: string;
  candidateName: string;
  nodeUrl: string;
  nodeId: string;
}): string {
  const { slug, candidateName, nodeUrl, nodeId } = params;

  const displayName =
    componentNameToDisplayName(candidateName || slug) || 'Component';

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
