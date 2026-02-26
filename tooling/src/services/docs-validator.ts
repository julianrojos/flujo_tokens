/**
 * Documentation Validator Service
 *
 * Provides typed access to the documentation validation logic.
 * Currently wraps the existing JS implementation for gradual migration.
 */

import * as path from 'node:path';
// @ts-ignore - Importing .mjs from .ts is allowed by config but might confuse TS
import { validateDocs as validateDocsJs } from '../../scripts/lib/docs-validator.mjs';

export interface DocsValidatorIssue {
    code: string;
    file: string;
    line?: number;
    message: string;
    severity?: 'error' | 'warning' | 'info';
}

export interface DocsValidationSummary {
    filesChecked: number;
    errors: number;
    warnings: number;
}

export interface DocsValidationReport {
    ok: boolean;
    summary: DocsValidationSummary;
    errors: DocsValidatorIssue[];
    warnings: DocsValidatorIssue[];
    governance: {
        manifestPath: string;
        manifestLoaded: boolean;
    };
}

export interface DocsValidatorOptions {
    docsRoot?: string;
    specRoot?: string;
    specFilePath?: string;
    registryPath?: string;
    filePath?: string;
    allowExtraH2?: boolean;
    checkPairing?: boolean;
    checkOverview?: boolean;
    checkSpecs?: boolean;
    manifestPath?: string;
}

/**
 * Validates documentation integrity, structure, and token references.
 */
export function validateDocs(options: DocsValidatorOptions = {}): DocsValidationReport {
    // Delegate to the established JS implementation
    return validateDocsJs(options);
}
