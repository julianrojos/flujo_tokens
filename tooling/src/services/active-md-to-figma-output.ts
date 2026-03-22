/**
 * Active Markdown to Figma Output
 *
 * Handles CLI output formatting for pipeline results.
 */

import type { RenderPipelineResult } from './render-pipeline-phase.js';

/**
 * Pipeline skip output structure.
 */
export interface PipelineSkipOutput {
  ok: true;
  skipped: true;
  reason: string;
  markdownPath: string;
  componentName: string;
  outputs: RenderPipelineResult['paths'];
  hint: string;
}

/**
 * Format pipeline skip output as JSON.
 */
export function formatPipelineSkipOutput(
  skipReason: string,
  markdownPath: string,
  componentName: string,
  paths: RenderPipelineResult['paths'],
): string {
  const output: PipelineSkipOutput = {
    ok: true,
    skipped: true,
    reason: skipReason,
    markdownPath,
    componentName,
    outputs: paths,
    hint: 'Use --force true to regenerate and re-render in Figma.',
  };

  return `${JSON.stringify(output, null, 2)}\n`;
}
