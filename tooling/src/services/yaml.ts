/**
 * Spec YAML Validators
 *
 * Validate spec YAML file structure.
 * Minimal implementation matching original validateDocs behavior.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseYamlDocument } from '../utils/parse-frontmatter.js';
import { SPEC_REQUIRED_TOP_LEVEL_FIELDS } from './docs-config.js';
import { componentNameToSnakeCase, isSnakeCaseFileSlug } from '../utils/component-name.js';
import type { DocsValidationReport } from './docs-validator-types.js';

// ============================================================================
// Type Definitions
// ============================================================================

interface ValidateSpecYamlFilesOptions {
  specRoot: string;
  report: DocsValidationReport;
  explicitSpecFilePath: string | null;
  collectSpecFiles: (specRoot: string) => string[];
}

interface ValidateSpecYamlFileOptions {
  filePath: string;
  report: DocsValidationReport;
}

// ============================================================================
// Main Spec YAML File Validator
// ============================================================================

/**
 * Validate a single spec YAML file.
 * Parity with original validateDocs: existence, parse, required fields, status, filename snake_case.
 */
function validateSpecYamlFile(options: ValidateSpecYamlFileOptions): void {
  const { filePath, report } = options;

  let parsed: Record<string, unknown>;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    parsed = parseYamlDocument<Record<string, unknown>>(
      raw,
      `spec YAML (${path.basename(filePath)})`
    );
  } catch (error) {
    report.errors.push({
      code: 'SPEC01',
      file: filePath,
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  // Check required top-level fields
  for (const field of SPEC_REQUIRED_TOP_LEVEL_FIELDS) {
    if (!(field in parsed)) {
      report.errors.push({
        code: 'SPEC01',
        file: filePath,
        message: `Missing required top-level field: \`${field}\`.`,
      });
    }
  }

  // Validate status
  const status = String(parsed.status || '').trim();
  if (status !== 'draft' && status !== 'ready') {
    report.errors.push({
      code: 'SPEC01',
      file: filePath,
      message: 'Field `status` must be one of: draft, ready.',
    });
  }

  // Validate filename is snake_case
  const specBase = path.basename(filePath, path.extname(filePath));
  if (!isSnakeCaseFileSlug(specBase)) {
    const suggestedBase = componentNameToSnakeCase(specBase);
    const suggestedPath = suggestedBase
      ? path.join(path.dirname(filePath), `${suggestedBase}.yml`)
      : null;
    report.errors.push({
      code: 'NAME01',
      file: filePath,
      message: 'Component spec filename must be snake_case (example: `status_bar.yml`).',
      suggested: suggestedPath ? path.relative(process.cwd(), suggestedPath) : undefined,
    });
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Validate all spec YAML files in the given root.
 */
export function validateSpecYamlFiles(options: ValidateSpecYamlFilesOptions): void {
  const {
    specRoot,
    report,
    explicitSpecFilePath,
    collectSpecFiles,
  } = options;

  const files = explicitSpecFilePath
    ? [path.resolve(explicitSpecFilePath)]
    : collectSpecFiles(specRoot);

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) {
      report.errors.push({
        code: 'SPEC01',
        file: filePath,
        message: 'Spec YAML file not found.',
      });
      continue;
    }
    report.summary.specFilesChecked += 1;
    validateSpecYamlFile({
      filePath,
      report,
    });
  }
}
