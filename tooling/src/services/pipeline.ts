/**
 * Design System Pipeline Service
 *
 * Core logic for pipeline planning and reporting.
 * This module contains pure functions (no I/O) that can be tested in isolation.
 *
 * @see ./runners/pipeline-runner.ts for I/O operations
 */

import type {
  PipelinePlan,
  ComponentPlan,
  StepPlan,
  PipelineStep,
  OrphanComponents,
  PipelineOptions,
  OrphanStatus,
  PipelineStepId,
} from './pipeline-types.js';

const PIPELINE_STEPS: PipelineStep[] = [
  { id: 'spec', role: 'metadata', desc: 'Generate/Update Spec YAML' },
  { id: 'markdown', role: 'documentation', desc: 'Generate component Markdown' },
  { id: 'render', role: 'sync', desc: 'Render Markdown to Figma' },
  { id: 'proof', role: 'visual', desc: 'Capture Visual Proof' },
];

const STEP_ALIASES: Readonly<Record<string, PipelineStepId>> = Object.freeze({
  spec: 'spec',
  markdown: 'markdown',
  figma: 'render',
  'visual-proof': 'proof',
  render: 'render',
  proof: 'proof',
});

/**
 * Normalize a step identifier (handles legacy aliases)
 */
export function normalizeStepId(rawStep: string): PipelineStepId | '' {
  const normalized = String(rawStep || '').trim().toLowerCase();
  if (!normalized) return '';
  return STEP_ALIASES[normalized] || '';
}

/**
 * Validate a step identifier
 */
export function validateStepId(rawStep: string, optionName: string): asserts rawStep is PipelineStepId | '' {
  const normalized = normalizeStepId(rawStep);
  if (rawStep && !normalized) {
    throw new Error(
      `Invalid ${optionName} value: "${rawStep}". ` +
      `Must be one of: spec, markdown, figma, visual-proof (legacy aliases: render, proof).`,
    );
  }
}

/**
 * Determine step status for a component based on its current state
 */
export function determineStepStatus(
  step: PipelineStep,
  componentState: {
    hasSpec: boolean;
    hasDoc: boolean;
    inFigma: boolean;
    needsReview: boolean;
  },
  previousSteps: StepPlan[],
): StepPlan {
  const stepPlan: StepPlan = {
    id: step.id,
    desc: step.desc,
    needed: false,
    reason: 'Up to date or skipped',
    preconditions: [],
    blocked: false,
  };

  const { hasSpec, hasDoc, inFigma, needsReview } = componentState;

  // Check if any previous step is blocked or needed
  const hasBlockedPrecondition = previousSteps.some(s => s.blocked || s.needed);

  switch (step.id) {
    case 'spec':
      if (!hasSpec) {
        stepPlan.needed = true;
        stepPlan.reason = 'Spec YAML is missing';
      } else if (needsReview) {
        stepPlan.needed = true;
        stepPlan.reason = 'Spec needs review/update';
      }
      break;

    case 'markdown':
      stepPlan.preconditions = ['spec'];
      if (!hasDoc) {
        stepPlan.needed = true;
        stepPlan.reason = 'Markdown documentation is missing';
      } else if (needsReview) {
        stepPlan.needed = true;
        stepPlan.reason = 'Doc marked as needs-review';
      } else if (!hasSpec) {
        stepPlan.needed = true;
        stepPlan.reason = 'Spec exists but may be out of sync';
      }
      break;

    case 'render':
      stepPlan.preconditions = ['spec', 'markdown'];
      if (!inFigma) {
        stepPlan.needed = true;
        stepPlan.reason = 'Component not mapped in Figma';
      } else if (needsReview) {
        stepPlan.needed = true;
        stepPlan.reason = 'Figma section needs update';
      }
      break;

    case 'proof':
      stepPlan.preconditions = ['spec', 'markdown', 'render'];
      stepPlan.needed = needsReview || !inFigma;
      stepPlan.reason = needsReview
        ? 'Visual proof needs refresh'
        : inFigma
          ? 'Up to date'
          : 'Component not in Figma';
      break;
  }

  // Block step if preconditions are not met
  if (hasBlockedPrecondition) {
    stepPlan.blocked = true;
    stepPlan.reason = 'Blocked by previous step';
  }

  return stepPlan;
}

/**
 * Determine orphan status for a component
 */
export function determineOrphanStatus(component: {
  hasSpec: boolean;
  hasDoc: boolean;
  inFigma: boolean;
}): OrphanStatus {
  const { hasSpec, hasDoc, inFigma } = component;

  if (inFigma && !hasSpec && !hasDoc) {
    return 'figma_only';
  }
  // doc_only: has doc but no spec and not in Figma (true orphan)
  if (hasDoc && !hasSpec && !inFigma) {
    return 'doc_only';
  }
  // spec_only: has spec but no doc (needs doc generation)
  if (hasSpec && !hasDoc) {
    return 'spec_only';
  }

  return null;
}

/**
 * Create a component pipeline plan
 */
export function createComponentPlan(
  component: {
    slug: string;
    hasSpec: boolean;
    hasDoc: boolean;
    inFigma: boolean;
    needsReview: boolean;
  },
): ComponentPlan {
  const { slug, hasSpec, hasDoc, inFigma, needsReview } = component;
  const orphanStatus = determineOrphanStatus({ hasSpec, hasDoc, inFigma });

  const steps: StepPlan[] = [];
  for (const step of PIPELINE_STEPS) {
    const stepPlan = determineStepStatus(
      step,
      { hasSpec, hasDoc, inFigma, needsReview },
      steps,
    );
    steps.push(stepPlan);
  }

  return {
    slug,
    orphanStatus,
    steps,
    hasSpec,
    hasDoc,
    inFigma,
    needsReview,
  };
}

/**
 * Create a complete pipeline plan
 *
 * This is a pure function that creates a plan from registry data.
 * File reading is handled by the runner.
 *
 * @param options - Pipeline options
 * @param registryComponents - Component data from registry
 * @returns Pipeline plan
 */
export function createPlan(
  options: PipelineOptions,
  registryComponents: Array<{
    slug: string;
    spec?: { exists?: boolean };
    doc?: { exists?: boolean; status?: string };
    figma?: { component_set_node_id?: string };
  }>,
): PipelinePlan {
  const plan: PipelinePlan = {
    components: {},
    orphans: {
      figma_only: [],
      doc_only: [],
      spec_only: [],
    },
    summary: {
      totalComponents: 0,
      orphanCount: 0,
    },
  };

  // Validate step arguments early
  if (options['from-step']) {
    validateStepId(options['from-step'], '--from-step');
  }
  if (options['only-step']) {
    validateStepId(options['only-step'], '--only-step');
  }

  // Filter target components
  let targetComponents = registryComponents;
  if (options.component) {
    const targetSlug = normalizeComponentSlug(options.component);
    targetComponents = registryComponents.filter(c => c.slug === targetSlug);

    // Fallback for new components not in registry
    if (targetComponents.length === 0) {
      targetComponents = [{
        slug: targetSlug,
        spec: {},
        doc: {},
        figma: {},
      }];
    }
  }

  // Create plans for each component
  for (const comp of targetComponents) {
    const slug = comp.slug;
    const hasSpec = comp.spec?.exists === true;
    const hasDoc = comp.doc?.exists === true;
    const inFigma = !!comp.figma?.component_set_node_id;
    const needsReview = comp.doc?.status === 'needs-review';

    const componentPlan = createComponentPlan({
      slug,
      hasSpec,
      hasDoc,
      inFigma,
      needsReview,
    });

    plan.components[slug] = componentPlan;

    // Track orphans
    if (componentPlan.orphanStatus) {
      plan.orphans[componentPlan.orphanStatus].push(slug);
    }

    // Apply --from-step filter
    if (options['from-step']) {
      const fromStep = normalizeStepId(options['from-step']!);
      if (fromStep) {
        const fromIndex = PIPELINE_STEPS.findIndex(s => s.id === fromStep);
        for (const step of componentPlan.steps) {
          const stepIndex = PIPELINE_STEPS.findIndex(s => s.id === step.id);
          if (stepIndex < fromIndex) {
            step.needed = false;
            step.reason = `Filtered by --from-step ${options['from-step']}`;
          }
        }
      }
    }

    // Apply --only-step filter
    if (options['only-step']) {
      const onlyStep = normalizeStepId(options['only-step']!);
      if (onlyStep) {
        for (const step of componentPlan.steps) {
          if (step.id !== onlyStep) {
            step.needed = false;
            step.reason = `Filtered by --only-step ${options['only-step']}`;
          }
        }
      }
    }
  }

  // Update summary
  plan.summary.totalComponents = Object.keys(plan.components).length;
  plan.summary.orphanCount =
    plan.orphans.figma_only.length +
    plan.orphans.doc_only.length +
    plan.orphans.spec_only.length;

  return plan;
}

/**
 * Normalize a component name to snake_case slug
 */
export function normalizeComponentSlug(name: string): string {
  return name
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
    .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
}

/**
 * Calculate execution statistics from plan and state
 */
export function calculateStats(
  plan: PipelinePlan,
  executionState?: {
    components?: Record<string, { success: boolean }>;
  },
  options?: {
    dryRun?: boolean;
    statusOnly?: boolean;
  },
): {
  processed: number;
  errors: number;
  skippedCached: number;
  skippedOnlyStep: number;
} {
  const stats = {
    processed: 0,
    errors: 0,
    skippedCached: 0,
    skippedOnlyStep: 0,
  };

  const isDryRun = options?.dryRun || options?.statusOnly;

  for (const [slug, data] of Object.entries(plan.components)) {
    if (data.orphanStatus) {
      stats.skippedCached++;
      continue;
    }

    const neededSteps = data.steps.filter(s => s.needed);

    if (neededSteps.length === 0) {
      const skippedByOnlyStep = data.steps.some(
        s => s.reason && s.reason.includes('--only-step'),
      );
      if (skippedByOnlyStep) {
        stats.skippedOnlyStep++;
      } else {
        stats.skippedCached++;
      }
    } else {
      const execData = executionState?.components?.[slug];
      if (execData) {
        if (execData.success === false) {
          stats.errors++;
        } else {
          stats.processed++;
        }
      } else {
        // Planned but not executed (dry-run / status-only)
        stats.skippedCached++;
      }
    }
  }

  return stats;
}
