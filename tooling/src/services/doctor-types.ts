/**
 * Type definitions for the Design System Doctor service
 *
 * This module defines the core types used by the doctor validation service.
 * The doctor performs health checks on the Design System documentation pipeline.
 */

/**
 * Valid check status values
 */
export type CheckStatus = 'pass' | 'fail' | 'warn';

/**
 * Represents a single health check result
 */
export interface DoctorCheck {
  /** Unique identifier for the check (e.g., 'PATH_DOCS', 'TOKEN_REGISTRY') */
  id: string;
  /** Status of the check */
  status: CheckStatus;
  /** Human-readable message describing the result */
  message: string;
  /** Additional details about the check */
  details: Record<string, unknown>;
}

/**
 * Summary of all check results
 */
export interface DoctorSummary {
  /** Number of checks that passed */
  passes: number;
  /** Number of checks with warnings */
  warnings: number;
  /** Number of checks that failed */
  fails: number;
}

/**
 * Complete doctor report
 */
export interface DoctorReport {
  /** Whether all checks passed (no failures) */
  ok: boolean;
  /** ISO 8601 timestamp when the report was generated */
  generatedAt: string;
  /** Summary of check results */
  summary: DoctorSummary;
  /** Individual check results */
  checks: DoctorCheck[];
}

/**
 * Options for creating a doctor check
 */
export interface CreateCheckOptions {
  id: string;
  status: CheckStatus;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Manifest rule entry from _manifest.yml
 */
export interface ManifestRuleEntry {
  id?: string;
  file?: string;
  deprecated?: boolean;
  superseded_by?: string;
  [key: string]: unknown;
}

/**
 * Parsed manifest structure
 */
export interface ManifestDocument {
  rules?: ManifestRuleEntry[];
  matrix?: {
    by_doc_type?: Record<string, unknown>;
    by_stage?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

/**
 * Skill frontmatter structure
 */
export interface SkillFrontmatter {
  version?: string;
  context?: {
    doc_type?: string;
    stage?: string;
  };
  compatible_agents?: string[];
  requires_rules?: Array<string | Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * Result of skill versioning validation
 */
export interface SkillVersioningResult {
  /** Number of skills checked */
  checked: number;
  /** List of issues found */
  issues: SkillVersioningIssue[];
}

/**
 * Issue found during skill versioning validation
 */
export interface SkillVersioningIssue {
  /** Path to the skill file */
  file: string;
  /** Missing required fields */
  missing?: string[];
  /** Invalid context values */
  invalid_context?: string[];
  /** Error message if parsing failed */
  error?: string;
  /** Deprecated rule references */
  deprecated_requires_rules?: Array<{
    rule_id: string;
    superseded_by: string | null;
  }>;
}

/**
 * Options for validating skill versioning
 */
export interface ValidateSkillVersioningOptions {
  /** Allowed doc_type values from manifest */
  allowedDocTypes?: Set<string>;
  /** Allowed stage values from manifest */
  allowedStages?: Set<string>;
}

/**
 * Allowed context values extracted from manifest
 */
export interface AllowedContextValues {
  /** Valid doc_type values */
  docTypes: Set<string>;
  /** Valid stage values */
  stages: Set<string>;
}

/**
 * Deprecated rules map (rule_id -> superseded_by)
 */
export type DeprecatedRulesMap = Map<string, string | null>;

/**
 * Configuration for doctor validation
 */
export interface DoctorConfig {
  /** Root directory for component docs */
  docsRoot: string;
  /** Root directory for component specs */
  specRoot: string;
  /** Path to token registry JSON */
  registryPath: string;
  /** PostgreSQL connection URL for component registry checks */
  componentRegistryPath: string;
  /** Path to rules manifest YAML */
  manifestPath: string;
  /** Directory for visual proof files */
  visualProofDir: string;
  /** Optional: specific component to check */
  componentName?: string;
  /** Whether to skip validate:docs check */
  skipValidate: boolean;
  /** Optional: system identifier */
  system?: string;
}

/**
 * Component registry comparison result
 */
export interface ComponentRegistryComparison {
  /** Whether the registry file exists */
  exists: boolean;
  /** Whether the registry matches source artifacts */
  matches: boolean;
  /** Expected registry state */
  expected: {
    fingerprint_sha256: string;
    summary: {
      total_components: number;
    };
  };
}

/**
 * Docs validation result
 */
export interface DocsValidationResult {
  /** Whether validation passed */
  ok: boolean;
  /** Summary of validation results */
  summary: {
    errors: number;
    warnings: number;
  };
  /** List of validation errors */
  errors: string[];
}

/**
 * Available agent information
 */
export interface AgentInfo {
  /** List of available agent CLIs */
  availableAgents: string[];
  /** List of supported agents */
  supportedAgents: string[];
}
