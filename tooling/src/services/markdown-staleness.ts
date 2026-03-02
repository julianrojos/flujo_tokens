/**
 * Markdown Staleness Detection
 *
 * Detects when markdown documentation is stale relative to its source spec.
 * Uses fingerprint comparison with mtime fallback.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { computeFingerprint, loadSyncState } from '../utils/cache-utils.js';

export interface DetectMarkdownStalenessOptions {
  specPath: string;
  markdownPath: string;
  syncStatePath?: string;
}

export interface MarkdownStalenessResult {
  stale: boolean;
  reason: string;
  taskId?: string;
}

/**
 * Detect markdown staleness relative to source spec.
 */
export function detectMarkdownStaleness(options: DetectMarkdownStalenessOptions): MarkdownStalenessResult {
  const { specPath, markdownPath, syncStatePath } = options;
  
  const specPathResolved = path.resolve(specPath);
  const markdownPathResolved = path.resolve(markdownPath);
  const taskId = `ds-component-doc:${specPathResolved}->${markdownPathResolved}`;
  
  const state: { tasks?: Record<string, unknown> } = syncStatePath
    ? (loadSyncState(syncStatePath) || { tasks: {} })
    : { tasks: {} };
  
  const task = state.tasks?.[taskId] as Record<string, unknown> | undefined;
  const currentSpecHash = computeFingerprint({ files: [specPathResolved] });

  // Check if spec hash has changed since markdown generation
  if (task && typeof task === 'object' && 'metadata' in task && task.metadata && typeof task.metadata === 'object' && 'specHashAtGeneration' in task.metadata) {
    const specHashAtGeneration = String((task.metadata as Record<string, unknown>).specHashAtGeneration);
    if (specHashAtGeneration === currentSpecHash) {
      return {
        stale: false,
        reason: 'spec_unchanged_since_markdown_generation',
      };
    }
    return {
      stale: true,
      reason: 'spec_changed_since_markdown_generation',
      taskId,
    };
  }

  // Backward-compatible fallback for older sync state entries.
  const specMtime = fs.statSync(specPathResolved).mtimeMs;
  const markdownMtime = fs.statSync(markdownPathResolved).mtimeMs;
  if (specMtime > markdownMtime) {
    return {
      stale: true,
      reason: 'spec_newer_than_markdown',
      taskId,
    };
  }

  return { stale: false, reason: 'timestamp_fallback_allows_render' };
}
