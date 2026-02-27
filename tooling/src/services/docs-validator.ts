/**
 * Documentation Validator Service
 *
 * Provides typed access to the documentation validation logic.
 * 
 * @internal Temporary wrapper until docs-validator.mjs is fully migrated.
 * The underlying .mjs implementation has complex dependencies that require
 * a dedicated migration effort. For now, this wrapper provides type safety
 * for callers while delegating to the battle-tested JS implementation.
 */

import * as path from 'node:path';
// TODO: Migrate docs-validator.mjs to TypeScript (complex, ~320 lines with many dependencies)
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
