import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "./paths.mjs";
import { componentNameToSnakeCase } from "./component-name.mjs";

const PIPELINE_STEPS = [
  { id: 'spec', role: 'metadata', desc: 'Generate/Update Spec YAML' },
  { id: 'markdown', role: 'documentation', desc: 'Generate component Markdown' },
  { id: 'render', role: 'sync', desc: 'Render Markdown to Figma' },
  { id: 'proof', role: 'visual', desc: 'Capture Visual Proof' }
];

const VALID_FROM_STEPS = new Set(PIPELINE_STEPS.map(s => s.id));

export async function createPlan(options = {}) {
  // Validate --from-step early so callers get a clear error instead of silent -1 index
  if (options['from-step'] && !VALID_FROM_STEPS.has(options['from-step'])) {
    throw new Error(
      `Invalid --from-step value: "${options['from-step']}". ` +
      `Must be one of: ${[...VALID_FROM_STEPS].join(', ')}.`
    );
  }
  if (options['only-step'] && !VALID_FROM_STEPS.has(options['only-step'])) {
    throw new Error(
      `Invalid --only-step value: "${options['only-step']}". ` +
      `Must be one of: ${[...VALID_FROM_STEPS].join(', ')}.`
    );
  }
  const plan = {
    components: {},
    orphans: {
      figma_only: [],
      doc_only: [],
      spec_only: []
    },
    summary: {}
  };

  const registryPath = path.resolve(PROJECT_ROOT, "docs/_generated/component-registry.json");
  let registryContents;
  try {
      registryContents = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  } catch (err) {
      console.warn(`[Plan] Warning: Cannot read component-registry at ${registryPath}`);
      return plan;
  }

  // Identify all possible components
  const allComponents = registryContents.components || [];
  
  let targetComponents = allComponents;
  if (options.component) {
      const targetSlug = componentNameToSnakeCase(options.component);
      targetComponents = allComponents.filter(c => c.slug === targetSlug);
      // Fallback in case a completely new component not in registry is provided manually
      if (targetComponents.length === 0) {
          targetComponents = [{
              slug: targetSlug, spec: {}, doc: {}, figma: {}
          }];
      }
  }

  for (const comp of targetComponents) {
    const slug = comp.slug;
    const hasSpec = comp.spec?.exists === true;
    const hasDoc = comp.doc?.exists === true;
    const inFigma = !!comp.figma?.component_set_node_id;
    const needsReview = comp.doc?.status === "needs-review";

    if (inFigma && !hasSpec && !hasDoc) plan.orphans.figma_only.push(slug);
    if (hasDoc && !inFigma) plan.orphans.doc_only.push(slug);
    if (hasSpec && !hasDoc) plan.orphans.spec_only.push(slug);
    
    const steps = PIPELINE_STEPS.map(stepObj => {
        const stepPlan = {
            id: stepObj.id,
            desc: stepObj.desc,
            needed: false,
            reason: 'Up to date or skipped',
            preconditions: [],
            blocked: false
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
                if (!comp.visual_proof?.exists) {
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

        if (options['from-step']) {
            const currentIdx = PIPELINE_STEPS.findIndex(s => s.id === stepObj.id);
            const fromIdx = PIPELINE_STEPS.findIndex(s => s.id === options['from-step']);
            if (currentIdx < fromIdx) {
                stepPlan.needed = false;
                stepPlan.reason = `Skipped due to --from-step=${options['from-step']}`;
            }
        }

        if (options['only-step']) {
            if (stepObj.id !== options['only-step']) {
                stepPlan.needed = false;
                stepPlan.reason = `Filtered by --only-step=${options['only-step']}`;
            } else if (!stepPlan.blocked) {
                stepPlan.needed = true;
                if (stepPlan.reason === 'Up to date or skipped' || stepPlan.reason.startsWith('render-figma not requested')) {
                    stepPlan.reason = `Forced by --only-step=${options['only-step']}`;
                }
            }
        }
        
        return stepPlan;
    });

    // Post-map: cascade block — if spec is not going to run and markdown is needed,
    // block markdown unless the user explicitly skipped spec via --from-step.
    const specStep = steps.find(s => s.id === 'spec');
    const mdStep = steps.find(s => s.id === 'markdown');
    if (specStep && mdStep && !hasSpec && !specStep.needed && !specStep.blocked && mdStep.needed) {
      const fromStepSkip = options['from-step'] &&
        PIPELINE_STEPS.findIndex(s => s.id === 'spec') < PIPELINE_STEPS.findIndex(s => s.id === options['from-step']);
      const onlyStepSkip = options['only-step'] && options['only-step'] !== 'spec' && hasSpec;
      if (!fromStepSkip && !onlyStepSkip) {
        mdStep.blocked = true;
        mdStep.reason = 'Blocked: spec missing and spec step skipped';
      }
    }

    plan.components[slug] = {
      slug,
      figma_node_id: comp.figma?.component_set_node_id || null,
      orphanStatus: plan.orphans.figma_only.includes(slug) ? 'figma_only' :
                    plan.orphans.doc_only.includes(slug) ? 'doc_only' :
                    plan.orphans.spec_only.includes(slug) ? 'spec_only' : false,
      steps,
    };
  }
    return plan;
}
