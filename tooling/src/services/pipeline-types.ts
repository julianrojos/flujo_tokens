/**
 * Type definitions for the Design System Pipeline Service
 *
 * This module defines the core types used by the pipeline orchestration service.
 * The pipeline manages the sequence: spec → markdown
 */

/**
 * Canonical pipeline step identifiers
 */
export type PipelineStepId = 'spec' | 'markdown';

/**
 * Any valid step identifier
 */
export type StepId = PipelineStepId;

/**
 * Pipeline step definition
 */
export interface PipelineStep {
  /** Step identifier */
  id: PipelineStepId;
  /** Role in the pipeline (metadata, documentation, sync, visual) */
  role: string;
  /** Human-readable description */
  desc: string;
}

/**
 * Status of a single pipeline step for a component
 */
export interface StepPlan {
  /** Step identifier */
  id: PipelineStepId;
  /** Description */
  desc: string;
  /** Whether the step needs to be executed */
  needed: boolean;
  /** Reason for the status */
  reason: string;
  /** List of preconditions that must be met */
  preconditions: string[];
  /** Whether the step is blocked by a previous failure */
  blocked: boolean;
}

/**
 * Orphan status for a component
 */
export type OrphanStatus = 'figma_only' | 'doc_only' | 'spec_only' | null;

/**
 * Component pipeline plan
 */
export interface ComponentPlan {
  /** Component slug (snake_case) */
  slug: string;
  /** Whether component is orphaned */
  orphanStatus: OrphanStatus;
  /** Pipeline steps */
  steps: StepPlan[];
  /** Whether spec exists */
  hasSpec: boolean;
  /** Whether doc exists */
  hasDoc: boolean;
  /** Whether in Figma */
  inFigma: boolean;
  /** Whether needs review */
  needsReview: boolean;
}

/**
 * Orphan components grouped by type
 */
export interface OrphanComponents {
  /** Components only in Figma (need spec+doc) */
  figma_only: string[];
  /** Components only with doc (not in Figma/unmapped) */
  doc_only: string[];
  /** Components only with spec (need doc) */
  spec_only: string[];
}

/**
 * Complete pipeline plan
 */
export interface PipelinePlan {
  /** Component plans keyed by slug */
  components: Record<string, ComponentPlan>;
  /** Orphaned components */
  orphans: OrphanComponents;
  /** Plan summary */
  summary: {
    totalComponents: number;
    orphanCount: number;
  };
}

/**
 * Pipeline execution options
 */
export interface PipelineOptions {
  /** Target specific component slug */
  component?: string;
  /** Process all components */
  all?: boolean;
  /** Start from specific step */
  'from-step'?: string;
  /** Execute only a specific step */
  'only-step'?: string;
  /** Plan but do not execute */
  'dry-run'?: boolean;
  /** Only show plan and orphan status */
  'status-only'?: boolean;
  /** Fail on first error */
  strict?: boolean;
  /** Target design system */
  system?: string;
  /** Output as JSON */
  json?: boolean;
  /** Design system context */
  dsContext?: {
    paths: {
      docs: string;
      specs: string;
      registry: string;
      generated: string;
      tokenRegistry: string;
    };
  };
}

/**
 * Execution metrics for a component
 */
export interface ComponentExecutionMetrics {
  /** Whether execution was successful */
  success: boolean;
  /** Steps that were executed */
  executedSteps: PipelineStepId[];
  /** Steps that failed */
  failedSteps: PipelineStepId[];
  /** Execution duration in milliseconds */
  durationMs?: number;
}

/**
 * Global execution state
 */
export interface GlobalExecutionState {
  /** Token sync status */
  tokensSync: 'Success' | 'Failed' | null;
  /** Final validation gate status */
  finalGate: 'Success' | 'Validation Failed' | null;
}

/**
 * Complete pipeline execution state
 */
export interface PipelineExecutionState {
  /** Global state */
  global: GlobalExecutionState;
  /** Component-level state keyed by slug */
  components: Record<string, ComponentExecutionMetrics>;
}

/**
 * Pipeline report metadata
 */
export interface ReportMeta {
  /** Whether there were failures */
  hasFailures: boolean;
  /** List of failed component slugs */
  failedComponents: string[];
}

/**
 * Pipeline execution result
 */
export interface PipelineResult {
  /** Whether pipeline succeeded */
  success: boolean;
  /** Execution timestamp */
  timestamp: string;
  /** Options used */
  options: PipelineOptions;
  /** Orphaned components */
  orphans: OrphanComponents;
  /** Failed components */
  failedComponents: string[];
  /** Execution summary */
  executionSummary: PipelineExecutionState & {
    plan: Record<string, ComponentPlan>;
  };
}

/**
 * Statistics summary for pipeline execution
 */
export interface PipelineStats {
  /** Number of components processed successfully */
  processed: number;
  /** Number of components with errors */
  errors: number;
  /** Number of components skipped (cached/up to date) */
  skippedCached: number;
  /** Number of components skipped (--only-step filter) */
  skippedOnlyStep: number;
}
