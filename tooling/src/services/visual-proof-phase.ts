/**
 * Visual Proof Phase
 *
 * Handles visual proof capture after a successful render.
 * Executes capture script with proper error handling and strict mode policy.
 */

import { runOrThrow } from '../utils/exec.js';

export interface VisualProofCaptureOptions {
  markdownPath: string;
  specPath: string;
  componentSetId: string;
  agent: 'codex' | 'claude' | 'gemini' | 'auto';
  system?: string;
  figmaUrl?: string;
  captureProofStrict: boolean;
}

export interface VisualProofCaptureResult {
  ok: boolean;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
}

/**
 * Build visual proof capture command arguments.
 */
function buildProofArgs(options: {
  markdownPath: string;
  specPath: string;
  componentSetId: string;
  agent: string;
  system?: string;
  figmaUrl?: string;
}): string[] {
  const {
    markdownPath,
    specPath,
    componentSetId,
    agent,
    system,
    figmaUrl,
  } = options;

  const args: string[] = [
    'tooling/scripts/ds-capture-visual-proof.mjs',
    '--markdown',
    markdownPath,
    '--spec-file',
    specPath,
    '--component-set-id',
    componentSetId,
    '--agent',
    agent,
  ];

  if (system) {
    args.push('--system', system);
  }
  if (figmaUrl) {
    args.push('--url', figmaUrl);
  }

  return args;
}

/**
 * Execute visual proof capture.
 */
function executeProofCapture(args: string[]): void {
  runOrThrow('node', args);
}

/**
 * Handle visual proof capture error.
 */
function handleProofCaptureError(
  error: unknown,
  captureProofStrict: boolean
): string {
  const message = `Visual proof capture failed: ${error instanceof Error ? error.message : String(error)}`;
  
  if (captureProofStrict) {
    throw new Error(message);
  }
  
  return message;
}

/**
 * Execute visual proof capture phase.
 */
export function executeVisualProofPhase(options: VisualProofCaptureOptions): VisualProofCaptureResult {
  const {
    markdownPath,
    specPath,
    componentSetId,
    agent,
    system,
    figmaUrl,
    captureProofStrict,
  } = options;

  // Check if component set ID is available
  if (!componentSetId) {
    const message = 'Visual proof capture skipped: no deterministic component_set_node_id available.';
    if (captureProofStrict) {
      throw new Error(message);
    }
    return {
      ok: true,
      skipped: true,
      skipReason: message,
    };
  }

  // Build proof arguments
  const proofArgs = buildProofArgs({
    markdownPath,
    specPath,
    componentSetId,
    agent,
    system: system || undefined,
    figmaUrl: figmaUrl || undefined,
  });

  // Execute capture
  try {
    executeProofCapture(proofArgs);
    return {
      ok: true,
    };
  } catch (error) {
    const errorMessage = handleProofCaptureError(error, captureProofStrict);
    return {
      ok: false,
      error: errorMessage,
    };
  }
}
