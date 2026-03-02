/**
 * Spec Validation Phase
 *
 * Handles spec and markdown validation before rendering to Figma.
 * Wraps validateDocs service with spec-specific error filtering and markdown validation.
 */

import * as path from 'node:path';

import { validateDocs } from './docs-validator.js';
import { PROJECT_ROOT } from '../utils/system-context.js';

export interface SpecValidationResult {
  ok: boolean;
  errors: Array<{ file?: string; message: string }>;
  skipped?: boolean;
}

export interface ValidateSpecPreflightOptions {
  specPath: string;
  tokenRegistryPath: string;
  markdownPath?: string;
  skipValidation?: boolean;
  force?: boolean;
}

export interface ValidateSkipValidationOptions {
  skipValidation: boolean;
  force: boolean;
}

/**
 * Validate skip-validation + force flags combination.
 */
export function validateSkipValidationFlags(options: ValidateSkipValidationOptions): void {
  const { skipValidation, force } = options;

  if (skipValidation && !force) {
    throw new Error(
      'Validation gate bypass requires explicit force.\n' +
      'Use `--skip-validation true --force true` only for exceptional cases.',
    );
  }
}

/**
 * Validate spec and markdown pre-flight.
 */
export function validateSpecPreflight(options: ValidateSpecPreflightOptions): SpecValidationResult {
  const { specPath, tokenRegistryPath, markdownPath, skipValidation = false, force = false } = options;

  // Validate skip-validation + force combination
  validateSkipValidationFlags({ skipValidation, force });

  // Skip validation if explicitly requested with force
  if (skipValidation && force) {
    return { ok: true, errors: [], skipped: true };
  }

  // Validate spec
  const specReport = validateDocs({
    docsRoot: path.join(PROJECT_ROOT, '__docs_validation_stub__'),
    registryPath: tokenRegistryPath,
    checkOverview: false,
    checkSpecs: true,
    checkPairing: false,
    specFilePath: specPath,
  });

  if (!specReport.ok) {
    // Filter to spec-specific errors for focused reporting
    const specErrors = specReport.errors.filter(
      (error) =>
        path.resolve(String(error.file || '')) === path.resolve(specPath),
    );
    const errors = specErrors.length > 0 ? specErrors : specReport.errors;
    return { ok: false, errors };
  }

  // Validate markdown if path provided
  if (markdownPath) {
    const markdownReport = validateDocs({
      filePath: markdownPath,
      specFilePath: specPath,
      checkOverview: false,
      registryPath: tokenRegistryPath,
    });

    if (!markdownReport.ok) {
      return { ok: false, errors: markdownReport.errors };
    }
  }

  return { ok: true, errors: [] };
}

/**
 * Ensure validation results pass or throw.
 */
export function ensureValidationResults(result: SpecValidationResult, specPath: string): void {
  if (result.ok) return;
  if (result.skipped) return;

  const payload = {
    file: specPath,
    errors: result.errors,
  };
  throw new Error(
    'Pre-flight validation failed. Rendering to Figma was blocked.\n' +
    `Run: npm run validate:docs -- --spec-file "${specPath}" --no-overview true\n` +
    `${JSON.stringify(payload, null, 2)}`,
  );
}
