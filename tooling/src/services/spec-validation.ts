/**
 * Spec Validation Service
 *
 * Specialized validation logic for generated component specs.
 */

import * as path from 'node:path';
import { validateDocs, PROJECT_ROOT } from '../utils/index.js';
import type { DocsValidationReport, DocsValidatorIssue } from './docs-validator-types.js';

export interface SpecValidationResult {
    ok: boolean;
    report: DocsValidationReport;
    errors: DocsValidatorIssue[];
}

/**
 * Validates a single generated spec file.
 */
export function validateGeneratedSpec(outputPath: string, registryPath: string): SpecValidationResult {
    const report = validateDocs({
        // Stub the docs root as we are only validating the spec file
        docsRoot: path.join(PROJECT_ROOT, '__docs_validation_stub__'),
        registryPath,
        checkOverview: false,
        checkSpecs: true,
        checkPairing: false,
        specFilePath: outputPath,
    });

    // Filter errors that are specifically about the generated spec file
    const relevantErrors = report.errors.filter(
        (error) => path.resolve(error.file || '') === path.resolve(outputPath),
    );

    return {
        ok: report.ok,
        report,
        // If we have relevant errors, prioritize them; otherwise return all report errors
        errors: relevantErrors.length > 0 ? relevantErrors : report.errors,
    };
}
