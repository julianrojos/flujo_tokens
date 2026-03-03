/**
 * Component Spec Loader
 *
 * Utilities for reading and parsing component specification YAML files.
 * Extracted from figma.ts to enable sharing with qa-audit.ts and other modules.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseYamlDocument } from '../utils/parse-frontmatter.js';
import { isPlainObject } from '../utils/is-plain-object.js';
import { normalizeNodeId } from '../utils/figma-node-id.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Parsed component specification from YAML.
 */
export interface ComponentSpec {
  /** Absolute path to the spec file */
  specPath: string;
  /** Whether the spec file exists */
  exists: boolean;
  /** Spec status field (e.g., "ready", "draft") */
  status: string;
  /** Raw component_set_node_id from spec */
  componentSetNodeIdRaw: string;
  /** Normalized component_set_node_id (colon-separated) */
  componentSetNodeId: string;
  /** Parsed YAML content */
  parsed: Record<string, unknown> | null;
  /** Parse error message if parsing failed */
  parseError: string | null;
}

/**
 * Optional resolution context for spec loading.
 */
export interface SpecResolution {
  /** Explicit spec file path (overrides default derivation) */
  specFilePath?: string;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Read component specification by documentation path.
 *
 * Derives spec path from doc filename or uses explicit path if provided.
 * Returns spec data with existence and parse status.
 *
 * @param componentDocPath - Path to the component markdown file
 * @param specRoot - Root directory for spec files
 * @param options - Optional resolution context
 * @returns Component spec data with existence and parse status
 */
export function readComponentSpecByDocPath(
  componentDocPath: string,
  specRoot: string,
  options: SpecResolution = {}
): ComponentSpec {
  const explicitSpecFilePath = options.specFilePath
    ? path.resolve(String(options.specFilePath))
    : '';
  const fileBase = path.basename(componentDocPath, path.extname(componentDocPath));
  const specPath = explicitSpecFilePath || path.join(specRoot, `${fileBase}.yml`);

  if (!fs.existsSync(specPath)) {
    return {
      specPath,
      exists: false,
      status: '',
      componentSetNodeIdRaw: '',
      componentSetNodeId: '',
      parsed: null,
      parseError: null,
    };
  }

  try {
    const parsed = parseYamlDocument<Record<string, unknown>>(
      fs.readFileSync(specPath, 'utf8'),
      `spec YAML (${path.basename(specPath)})`
    );
    const status = String(parsed.status || '').trim().toLowerCase();
    const figma = isPlainObject(parsed.figma) ? (parsed.figma as Record<string, unknown>) : {};
    const componentSetNodeIdRaw = String(figma.component_set_node_id || '').trim();
    return {
      specPath,
      exists: true,
      status,
      componentSetNodeIdRaw,
      componentSetNodeId: normalizeNodeId(componentSetNodeIdRaw),
      parsed,
      parseError: null,
    };
  } catch (error) {
    return {
      specPath,
      exists: true,
      status: '',
      componentSetNodeIdRaw: '',
      componentSetNodeId: '',
      parsed: null,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}
