/**
 * Render Expectations
 *
 * Parses render payload to extract structural expectations for validation.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { RenderExpectations } from '../types/render-report.js';
import { isPlainObject } from '../utils/is-plain-object.js';
import { getPathValue } from '../utils/object-path.js';

export interface ReadRenderExpectationsOptions {
  payloadPath: string;
  componentName: string;
}

/**
 * Read render expectations from payload file.
 */
export function readRenderExpectations(
  options: ReadRenderExpectationsOptions,
): RenderExpectations {
  const { payloadPath, componentName } = options;
  
  if (!fs.existsSync(payloadPath)) {
    throw new Error(
      'Missing render payload for structural checks.\n' +
      `Expected: ${path.resolve(payloadPath)}`,
    );
  }

  let parsed: unknown;
  try {
    const content = fs.readFileSync(payloadPath, 'utf8');
    parsed = JSON.parse(content);
  } catch (error) {
    const content = fs.readFileSync(payloadPath, 'utf8');
    const truncated = content.slice(0, 200).replace(/\n/g, '\\n');
    throw new Error(
      `Failed to parse render payload JSON at ${path.resolve(payloadPath)}.\n` +
      `Error: ${error instanceof Error ? error.message : String(error)}\n` +
      `Content (first 200 chars): ${truncated}...`
    );
  }

  if (!isPlainObject(parsed)) {
    throw new Error(
      `Invalid render payload structure at ${path.resolve(payloadPath)} (expected object).`
    );
  }

  const model = isPlainObject(parsed.model) ? parsed.model : {};
  const blocks = Array.isArray((model as Record<string, unknown>).blocks)
    ? ((model as Record<string, unknown>).blocks as Record<string, unknown>[])
    : [];
  
  const expectedCardCount = blocks.filter(
    (block) => block?.type === 'heading' && Number(block.level) === 2,
  ).length;
  
  const expectedTableCount = blocks.filter(
    (block) => block?.type === 'table',
  ).length;
  
  const sectionNamePattern = String(
    getPathValue(parsed, 'theme.layout.target.section_name_pattern', 'Doc/{component_name}'),
  ).trim();
  
  const expectedSectionName = sectionNamePattern.includes('{component_name}')
    ? sectionNamePattern.replace(new RegExp('{component_name}', 'g'), componentName)
    : sectionNamePattern || `Doc/${componentName}`;

  return {
    expectedCardCount,
    expectedTableCount,
    expectedSectionName,
  };
}
