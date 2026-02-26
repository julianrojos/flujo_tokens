/**
 * Spec Run Guards and Resolvers
 *
 * Validates Figma source inputs and enforces bypass policies.
 */

import { parseFigmaUrl } from '../utils/figma-url-parser.js';

export interface BypassPolicyOptions {
    force: boolean;
    skipValidation: boolean;
    allowNonEvidenceUpdates: boolean;
}

/**
 * Assert that bypass flags are used correctly with --force.
 */
export function assertBypassPolicy(options: BypassPolicyOptions): void {
    const { force, skipValidation, allowNonEvidenceUpdates } = options;

    if (skipValidation && !force) {
        throw new Error(
            'Validation gate bypass requires explicit force.\n' +
            'Use `--skip-validation true --force true` only for exceptional cases.',
        );
    }

    if (allowNonEvidenceUpdates && !force) {
        throw new Error(
            'Evidence gate bypass requires explicit force.\n' +
            'Use `--allow-non-evidence-updates true --force true` only for exceptional cases.',
        );
    }
}

export interface FigmaSourceInputs {
    figmaUrl?: string;
    nodeId?: string;
    rawComponentName?: string;
}

/**
 * Assert that at least one Figma source is provided.
 */
export function assertFigmaSourceProvided(inputs: FigmaSourceInputs): void {
    const { figmaUrl, nodeId, rawComponentName } = inputs;
    if (!figmaUrl && !nodeId && !rawComponentName) {
        throw new Error(
            'Missing Figma source.\nUse one of:\n- --url <figma-url>\n- --component-set-node-id <node-id>\n- --component-name <name> (less deterministic)',
        );
    }
}

/**
 * Assert that an output path is available.
 */
export function assertOutputPath(outputPath?: string): void {
    if (!outputPath) {
        throw new Error('Missing output target.\nProvide --output or --component-name.');
    }
}

export interface ResolvedFigmaSource {
    fileKeyFromUrl: string;
    nodeId: string;
}

/**
 * Resolve Figma source from inputs (URL, explicit ID, or name).
 */
export function resolveFigmaSource(inputs: FigmaSourceInputs): ResolvedFigmaSource {
    assertFigmaSourceProvided(inputs);

    const parsedUrl = parseFigmaUrl(inputs.figmaUrl);
    const fileKeyFromUrl = parsedUrl.fileKey;
    const nodeId = inputs.nodeId || parsedUrl.nodeId;

    // Re-verify after parse in case URL didn't contain an ID and no explicit ID was provided
    assertFigmaSourceProvided({ ...inputs, nodeId });

    return {
        fileKeyFromUrl,
        nodeId: nodeId || '',
    };
}
