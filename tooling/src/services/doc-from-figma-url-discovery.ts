/**
 * Doc from Figma URL Discovery
 *
 * Handles discovery mode for file-level Figma URLs (URLs without node-id).
 * Generates a component map JSON and prints next steps.
 */

import * as path from 'node:path';

import { logger } from '../utils/logger.js';
import { isPlainObject } from '../utils/is-plain-object.js';
import { fetchFigmaFile } from '../utils/figma-api.js';
import type { FigmaNode } from '../utils/figma.js';
import type { ParsedFigmaFileUrl } from './figma-component-map.js';
import {
  buildFigmaComponentMap,
  buildFigmaComponentMapSummary,
  renderComponentUrlSuggestions,
} from './figma-component-map.js';
import { writeJsonFileAtomic } from './capture-visual-proof-io.js';

/**
 * Handle discovery mode for file-level Figma URLs.
 *
 * Fetches the Figma file, builds a component map, writes JSON, and prints summary.
 * Throws Error instead of calling process.exit() for testability.
 */
export async function handleDiscoveryMode(
  figmaFileDescriptor: ParsedFigmaFileUrl,
  figmaUrl: string,
  figmaToken: string,
  componentMapOutPath: string,
  docsRootDir: string,
): Promise<void> {
  const fileMapDefaultPath = path.join(
    docsRootDir,
    '_generated',
    'figma-component-map',
    `${figmaFileDescriptor.fileKey}.json`,
  );
  const figmaMapOutPath = componentMapOutPath || fileMapDefaultPath;

  const filePayload = await fetchFigmaFile({
    fileKey: figmaFileDescriptor.fileKey,
    token: figmaToken,
  });

  // Validate filePayload structure before casting
  if (!isPlainObject(filePayload)) {
    throw new Error(
      'Figma API returned an invalid payload structure.\n' +
      'Expected an object with nodes, components, and componentSets properties.',
    );
  }

  const componentMap = buildFigmaComponentMap(
    figmaFileDescriptor,
    isPlainObject(filePayload.document) ? (filePayload.document as FigmaNode) : { id: '', type: 'DOCUMENT', name: '', children: [] },
    isPlainObject(filePayload.components) ? (filePayload.components as Record<string, unknown>) : {},
    isPlainObject(filePayload.componentSets) ? (filePayload.componentSets as Record<string, unknown>) : {},
    true
  );
  const writtenPath = writeJsonFileAtomic(figmaMapOutPath, componentMap);
  const summary = buildFigmaComponentMapSummary(componentMap);
  const suggestions = renderComponentUrlSuggestions(componentMap, 20);

  console.log(
    'Figma file URL processed in discovery mode.\n' +
      `Component map: ${writtenPath}\n` +
      `Components found: ${summary.stats.component_nodes_total} (${summary.stats.component_sets} sets, ${summary.stats.components} components)\n` +
      `Pages: ${summary.stats.pages}\n` +
      'Next step: pick one component URL and rerun ds:doc-from-figma-url with --component-name.\n' +
      `${suggestions ? `Sample component URLs:\n${suggestions}\n` : ''}`,
  );
}
