/**
 * Pipeline Plan
 *
 * Create execution plan for documentation pipeline.
 */
import * as fs from 'node:fs';
import { componentNameToSnakeCase } from '../utils/component-name.js';
import { resolveSystemContextSafe } from '../utils/system-context.js';

/**
 * Minimal interface for registry entries.
 */
interface RegistryEntry {
  slug: string;
  spec?: { exists?: boolean };
  doc?: { exists?: boolean; status?: string };
  figma?: { component_set_node_id?: string };
  visual_proof?: { exists?: boolean };
  [key: string]: unknown;
}

/**
 * Registry contents structure.
 */
interface RegistryContents {
  components?: RegistryEntry[];
  [key: string]: unknown;
}

export interface PipelineStep {
  id: string;
  desc: string;
  needed: boolean;
  reason: string;
  preconditions: string[];
  blocked: boolean;
}

export interface PipelineComponent {
  slug: string;
  figma_node_id: string | null;
  orphanStatus: string | false;
  steps: PipelineStep[];
}

export interface PipelineOrphans {
  figma_only: string[];
  doc_only: string[];
  spec_only: string[];
}

export interface PipelinePlan {
  components: Record<string, PipelineComponent>;
  orphans: PipelineOrphans;
  summary: Record<string, unknown>;
}

export interface PipelinePlanOptions {
  'from-step'?: string;
  'only-step'?: string;
  'render-figma'?: boolean;
  component?: string;
  dsContext?: ReturnType<typeof resolveSystemContextSafe>;
  [key: string]: unknown;
}

const PIPELINE_STEPS: Array<{ id: string; role: string; desc: string }> = [
  { id: 'spec', role: 'metadata', desc: 'Generate/Update Spec YAML' },
  { id: 'markdown', role: 'documentation', desc: 'Generate component Markdown' },
  { id: 'render', role: 'sync', desc: 'Render Markdown to Figma' },
  { id: 'proof', role: 'visual', desc: 'Capture Visual Proof' },
];

const STEP_ALIASES: Record<string, string> = Object.freeze({
  spec: 'spec',
  markdown: 'markdown',
  figma: 'render',
  'visual-proof': 'proof',
  render: 'render',
  proof: 'proof',
});

/**
 * Normalize step argument to canonical step ID.
 */
function normalizeStepArg(rawStep: string): string {
  const normalized = String(rawStep || '').trim().toLowerCase();
  if (!normalized) return '';
  return STEP_ALIASES[normalized] || '';
}

/**
 * Create pipeline execution plan.
 * Note: This is a synchronous function (uses fs.readFileSync internally).
 */
export function createPlan(options: PipelinePlanOptions = {}): PipelinePlan {
  const rawFromStep = String(options['from-step'] || '').trim().toLowerCase();
  const rawOnlyStep = String(options['only-step'] || '').trim().toLowerCase();
  const fromStep = normalizeStepArg(rawFromStep);
  const onlyStep = normalizeStepArg(rawOnlyStep);

  // Validate --from-step early so callers get a clear error instead of silent -1 index
  if (rawFromStep && !fromStep) {
    throw new Error(
      `Invalid --from-step value: "${options['from-step']}". ` +
      'Must be one of: spec, markdown, figma, visual-proof (legacy aliases: render, proof).'
    );
  }
  if (rawOnlyStep && !onlyStep) {
    throw new Error(
      `Invalid --only-step value: "${options['only-step']}". ` +
      'Must be one of: spec, markdown, figma, visual-proof (legacy aliases: render, proof).'
    );
  }

  const plan: PipelinePlan = {
    components: {},
    orphans: {
      figma_only: [],
      doc_only: [],
      spec_only: [],
    },
    summary: {},
  };

  const ctx = options.dsContext || resolveSystemContextSafe({});
  const registryPath = ctx.paths.registry;
  let registryContents: RegistryContents;

  try {
    registryContents = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[Plan] Fatal: Cannot read component-registry at ${registryPath}: ${reason}`
    );
  }

  // Identify all possible components
  const allComponents = registryContents.components || [];

  let targetComponents = allComponents;
  if (options.component) {
    const targetSlug = componentNameToSnakeCase(options.component);
    targetComponents = allComponents.filter((c) => c.slug === targetSlug);
    // Fallback in case a completely new component not in registry is provided manually
    if (targetComponents.length === 0) {
      targetComponents = [
        {
          slug: targetSlug,
          spec: {},
          doc: {},
          figma: {},
        },
      ];
    }
  }

  for (const comp of targetComponents) {
    const slug = comp.slug as string;
    const hasSpec = comp.spec?.exists === true;
    const hasDoc = comp.doc?.exists === true;
    const inFigma = !!comp.figma?.component_set_node_id;
    const needsReview = comp.doc?.status === 'needs-review';

    // Orphan detection: strict conditions to avoid false positives
    if (inFigma && !hasSpec && !hasDoc) plan.orphans.figma_only.push(slug);
    if (hasDoc && !hasSpec && !inFigma) plan.orphans.doc_only.push(slug);
    if (hasSpec && !hasDoc) plan.orphans.spec_only.push(slug);

    const steps = PIPELINE_STEPS.map((stepObj) => {
      const stepPlan: PipelineStep = {
        id: stepObj.id,
        desc: stepObj.desc,
        needed: false,
        reason: 'Up to date or skipped',
        preconditions: [],
        blocked: false,
      };

      switch (stepObj.id) {
        case 'spec':
          stepPlan.preconditions = ['token-registry exists', 'figma.component_set_node_id set'];
          if (!inFigma) {
            // Cannot regenerate spec without a Figma source
            stepPlan.needed = false;
            stepPlan.blocked = true;
            stepPlan.reason = 'Missing figma.component_set_node_id';
          } else if (!hasSpec || needsReview) {
            stepPlan.needed = true;
            stepPlan.reason = needsReview ? 'Spec drifted (needs-review)' : 'Spec missing';
          }
          break;
        case 'markdown':
          stepPlan.preconditions = ['spec exists'];
          if (!hasDoc || needsReview) {
            stepPlan.needed = true;
            stepPlan.reason = needsReview ? 'Markdown drifted (needs-review)' : 'Markdown missing';
          }
          break;
        case 'render':
          stepPlan.preconditions = ['markdown exists'];
          if (!options['render-figma']) {
            stepPlan.needed = false;
            stepPlan.reason = 'render-figma not requested';
          } else {
            stepPlan.needed = true;
            stepPlan.reason = 'Figma render requested';
          }
          break;
        case 'proof':
          stepPlan.preconditions = ['figma.component_set_node_id set'];
          if (!(comp.visual_proof as { exists?: boolean })?.exists) {
            stepPlan.needed = true;
            stepPlan.reason = 'Visual proof missing';
          }
          if (!inFigma) {
            stepPlan.needed = false;
            stepPlan.blocked = true;
            stepPlan.reason = 'Missing figma.component_set_node_id';
          }
          break;
      }

      if (fromStep) {
        const currentIdx = PIPELINE_STEPS.findIndex((s) => s.id === stepObj.id);
        const fromIdx = PIPELINE_STEPS.findIndex((s) => s.id === fromStep);
        if (currentIdx < fromIdx) {
          stepPlan.needed = false;
          stepPlan.reason = `Skipped due to --from-step=${rawFromStep}`;
        }
      }

      if (onlyStep) {
        if (stepObj.id !== onlyStep) {
          stepPlan.needed = false;
          stepPlan.reason = `Filtered by --only-step=${rawOnlyStep}`;
        } else if (!stepPlan.blocked) {
          stepPlan.needed = true;
          if (
            stepPlan.reason === 'Up to date or skipped' ||
            stepPlan.reason.startsWith('render-figma not requested')
          ) {
            stepPlan.reason = `Forced by --only-step=${rawOnlyStep}`;
          }
        }
      }

      return stepPlan;
    });

    // Post-map: cascade block — if spec is not going to run and markdown is needed,
    // block markdown unless the user explicitly skipped spec via --from-step.
    const specStep = steps.find((s) => s.id === 'spec');
    const mdStep = steps.find((s) => s.id === 'markdown');
    if (specStep && mdStep && !hasSpec && !specStep.needed && !specStep.blocked && mdStep.needed) {
      const fromStepSkip =
        fromStep &&
        PIPELINE_STEPS.findIndex((s) => s.id === 'spec') < PIPELINE_STEPS.findIndex((s) => s.id === fromStep);
      const onlyStepSkip = onlyStep && onlyStep !== 'spec' && hasSpec;
      if (!fromStepSkip && !onlyStepSkip) {
        mdStep.blocked = true;
        mdStep.reason = 'Blocked: spec missing and spec step skipped';
      }
    }

    plan.components[slug] = {
      slug,
      figma_node_id: comp.figma?.component_set_node_id || null,
      orphanStatus: plan.orphans.figma_only.includes(slug)
        ? 'figma_only'
        : plan.orphans.doc_only.includes(slug)
          ? 'doc_only'
          : plan.orphans.spec_only.includes(slug)
            ? 'spec_only'
            : false,
      steps,
    };
  }

  return plan;
}
