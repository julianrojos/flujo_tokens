/**
 * Spec Write Adapter Service
 *
 * Handles file system operations and spec materialization (merging template, raw, and existing data).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    parseYamlDocument,
    normalizeSpec,
    extractUniqueRegistryEntries,
    pickComponentTokenCandidates,
    prefillTokenMapping,
    assertEvidenceGatedScalarChanges,
} from '../utils/index.js';

export function ensureSpecTemplateExists(templatePath: string): void {
    if (!fs.existsSync(templatePath)) {
        throw new Error(`Spec template not found: ${templatePath}`);
    }
}

export function ensureSpecOutputDirectory(outputPath: string): void {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
}

export interface SpecOutputSnapshot {
    exists: boolean;
    content: string;
}

export function parseExistingSpecFromSnapshot(outputSnapshot: SpecOutputSnapshot | null, outputPath: string): any {
    if (!outputSnapshot?.exists) return null;
    return parseYamlDocument(outputSnapshot.content, `existing spec (${outputPath})`);
}

export interface MaterializeSpecOptions {
    outputPath: string;
    templatePath: string;
    registryIndex: any;
    componentName?: string;
    nodeId?: string;
    fileKeyFromUrl?: string;
    existingSpec?: any;
    allowNonEvidenceUpdates?: boolean;
    evidenceGate?: typeof assertEvidenceGatedScalarChanges;
    evidenceBackedPrefixes?: string[];
}

/**
 * Materializes the final spec by merging template, generated, and existing data.
 */
export function materializeSpec(options: MaterializeSpecOptions): { normalizedSpec: any; prefilledCount: number } {
    const {
        outputPath,
        templatePath,
        registryIndex,
        componentName,
        nodeId,
        fileKeyFromUrl,
        existingSpec,
        allowNonEvidenceUpdates,
        evidenceGate = assertEvidenceGatedScalarChanges,
        evidenceBackedPrefixes = [],
    } = options;

    const templateSpec = parseYamlDocument(
        fs.readFileSync(templatePath, 'utf8'),
        `spec template (${templatePath})`,
    );

    const generatedSpecRaw = parseYamlDocument(
        fs.readFileSync(outputPath, 'utf8'),
        `generated spec (${outputPath})`,
    );

    const registryEntries = extractUniqueRegistryEntries(registryIndex);
    const tokenCandidates = pickComponentTokenCandidates(
        registryEntries,
        generatedSpecRaw.name || componentName || '',
    );

    const { normalizedSpec, prefilledCount } = normalizeSpec({
        templateSpec,
        generatedSpecRaw,
        componentName,
        nodeId,
        fileKeyFromUrl,
        tokenCandidates,
        prefillTokenMappingFn: prefillTokenMapping,
    });

    if (existingSpec && !allowNonEvidenceUpdates) {
        evidenceGate({
            before: existingSpec,
            after: normalizedSpec,
            allowedKnownToKnownPrefixes: evidenceBackedPrefixes,
            label: `${outputPath} spec`,
        });
    }

    return {
        normalizedSpec,
        prefilledCount,
    };
}
