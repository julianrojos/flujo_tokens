/**
 * Spec Registry Prompt Service
 *
 * Combines token registry data with spec generation prompts.
 */

import {
    buildSpecPrompt,
    buildTokenMenuLines,
    extractUniqueRegistryEntries,
} from '../utils/index.js';
import type { BuildSpecPromptOptions } from '../utils/index.js';

export interface LoadRegistryOptions {
    loadTokenRegistryFn: (path: string) => unknown;
    registryPath: string;
}

/**
 * @deprecated Use loadRegistryOrThrow from utils/registry-loader.js instead.
 */
export function loadRegistryOrThrow(options: LoadRegistryOptions): unknown {
    const { loadTokenRegistryFn, registryPath } = options;

    try {
        return loadTokenRegistryFn(registryPath);
    } catch (error) {
        throw new Error(
            `${error instanceof Error ? error.message : String(error)}. Run \`npm run generate:registry\` first.`,
        );
    }
}

export interface BuildSpecPromptWithRegistryOptions extends Omit<BuildSpecPromptOptions, 'tokenMenuLines'> {
    componentSlug: string;
    registryIndex: unknown;
}

/**
 * Build a spec prompt enriched with relevant token registry entries.
 */
export function buildSpecPromptWithRegistry(options: BuildSpecPromptWithRegistryOptions): string {
    const {
        figmaUrl,
        nodeId,
        componentName,
        componentSlug,
        outputPath,
        templatePath,
        registryPath,
        fileKeyFromUrl,
        registryIndex,
    } = options;

    return buildSpecPrompt({
        figmaUrl,
        nodeId,
        componentName,
        outputPath,
        templatePath,
        registryPath,
        fileKeyFromUrl,
        tokenMenuLines: buildTokenMenuLines(
            extractUniqueRegistryEntries(registryIndex),
            componentName || componentSlug,
        ),
    });
}
