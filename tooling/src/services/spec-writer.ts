/**
 * Spec Writer Service
 *
 * Handles YAML serialization and prettier formatting for component specs.
 */

import * as fs from 'node:fs';
import yaml from 'js-yaml';
import { runOrThrow, captureFileSnapshot, restoreFileSnapshot } from '../utils/index.js';
import type { FileSnapshot } from '../utils/index.js';

/**
 * Formats a YAML file using Prettier.
 */
export function formatYamlFile(outputPath: string): void {
    runOrThrow('npx', ['prettier', '--write', outputPath]);
}

/**
 * Writes a normalized spec object to disk as YAML.
 */
export function writeNormalizedSpec(options: { outputPath: string; normalizedSpec: any }): void {
    const { outputPath, normalizedSpec } = options;
    fs.writeFileSync(
        outputPath,
        yaml.dump(normalizedSpec, {
            lineWidth: 120,
            noRefs: true,
            sortKeys: false,
        }),
        'utf8',
    );
    formatYamlFile(outputPath);
}

/**
 * Writes a spec with an automatic rollback snapshot if the write fails.
 */
export function writeSpecWithSnapshotGuard(options: {
    outputPath: string;
    normalizedSpec: any;
    applyWriteFn?: (opts: { outputPath: string; normalizedSpec: any }) => void;
}): void {
    const { outputPath, normalizedSpec, applyWriteFn } = options;
    const snapshot = captureFileSnapshot(outputPath);

    try {
        if (applyWriteFn) {
            applyWriteFn({ outputPath, normalizedSpec });
        } else {
            writeNormalizedSpec({ outputPath, normalizedSpec });
        }
    } catch (error) {
        restoreFileSnapshot(outputPath, snapshot);
        throw error;
    }
}
