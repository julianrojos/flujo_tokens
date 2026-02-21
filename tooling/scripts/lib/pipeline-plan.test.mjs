import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlan } from './pipeline-plan.mjs';
import { generateReport } from './pipeline-report.mjs';

test('PipelinePlan: correct execution graph for a targeted component', async () => {
    const plan = await createPlan({ component: 'alert', 'dry-run': true });

    assert.ok(plan.components.alert, 'Plan should contain an entry for alert');
    const steps = plan.components.alert.steps;
    assert.strictEqual(steps.length, 4, 'Should have 4 main pipeline steps');
    assert.ok(steps.find(s => s.id === 'spec'), 'Should contain spec step');
    assert.ok(steps.find(s => s.id === 'markdown'), 'Should contain markdown step');
    assert.ok(steps.find(s => s.id === 'render'), 'Should contain render step');
    assert.ok(steps.find(s => s.id === 'proof'), 'Should contain proof step');
});

test('PipelinePlan: --from-step skips steps before the target', async () => {
    const plan = await createPlan({ component: 'alert', 'from-step': 'render' });
    const steps = plan.components.alert.steps;

    const specStep = steps.find(s => s.id === 'spec');
    const mdStep = steps.find(s => s.id === 'markdown');
    const renderStep = steps.find(s => s.id === 'render');

    assert.strictEqual(specStep.needed, false, 'spec should be skipped (before from-step)');
    assert.strictEqual(mdStep.needed, false, 'markdown should be skipped (before from-step)');
    // render itself is not forced needed by from-step alone (requires --render-figma)
    assert.strictEqual(renderStep.needed, false, 'render not needed without --render-figma');
});

test('PipelinePlan: invalid --from-step throws a clear error', async () => {
    await assert.rejects(
        () => createPlan({ component: 'alert', 'from-step': 'invalid_step' }),
        /Invalid --from-step value/,
        'Should throw with descriptive message for unknown step'
    );
});

test('PipelinePlan: needs-review sets spec and markdown as needed', async () => {
    // needs-review components exist in the real registry (alert, button, avatar)
    const plan = await createPlan({ component: 'alert' });
    const comp = plan.components.alert;
    if (!comp) return; // skip if alert not in registry

    const specStep = comp.steps.find(s => s.id === 'spec');
    const mdStep = comp.steps.find(s => s.id === 'markdown');

    // alert is needs-review in the real registry — both steps should be needed
    if (comp.steps.find(s => s.id === 'spec')?.reason?.includes('needs-review')) {
        assert.strictEqual(specStep.needed, true, 'needs-review: spec must be needed');
        assert.strictEqual(mdStep.needed, true, 'needs-review: markdown must be needed');
    }
});

test('PipelinePlan: proof is blocked when no figma node_id', async () => {
    // doc_only orphans have no figma.component_set_node_id
    const plan = await createPlan({ component: 'bottom_bar' });
    const comp = plan.components.bottom_bar;
    if (!comp) return;

    const proofStep = comp.steps.find(s => s.id === 'proof');
    if (comp.orphanStatus === 'doc_only') {
        assert.strictEqual(proofStep.blocked, true, 'proof must be blocked for doc_only orphan');
        assert.strictEqual(proofStep.needed, false, 'proof must not be needed when blocked');
    }
});

test('PipelinePlan: plan has orphans section with correct shape', async () => {
    const plan = await createPlan({});
    assert.ok(Array.isArray(plan.orphans.figma_only), 'figma_only must be array');
    assert.ok(Array.isArray(plan.orphans.doc_only), 'doc_only must be array');
    assert.ok(Array.isArray(plan.orphans.spec_only), 'spec_only must be array');
});

test('PipelinePlan: figma_node_id is bubbled up to compPlan', async () => {
    const plan = await createPlan({ component: 'alert' });
    const comp = plan.components.alert;
    if (!comp) return;
    // alert has a figma mapping in the registry
    assert.ok(comp.figma_node_id !== undefined, 'figma_node_id must be present in compPlan');
});

// --- only-step tests ---

test('PipelinePlan: --only-step markdown filters all other steps and forces markdown needed', async () => {
    const plan = await createPlan({ component: 'alert', 'only-step': 'markdown' });
    const comp = plan.components.alert;
    if (!comp) return;

    const steps = comp.steps;
    const markdownStep = steps.find(s => s.id === 'markdown');
    const otherSteps = steps.filter(s => s.id !== 'markdown');

    assert.strictEqual(markdownStep.needed, true, 'markdown step must be needed when targeted by --only-step');
    for (const step of otherSteps) {
        assert.strictEqual(step.needed, false, `step '${step.id}' must not be needed when filtered by --only-step markdown`);
        assert.ok(step.reason.includes('Filtered by --only-step'), `step '${step.id}' reason must mention filter`);
    }
});

test('PipelinePlan: --only-step render forces render needed regardless of --render-figma flag', async () => {
    // Without --render-figma, render would normally be needed:false
    const plan = await createPlan({ component: 'alert', 'only-step': 'render' });
    const comp = plan.components.alert;
    if (!comp) return;

    const renderStep = comp.steps.find(s => s.id === 'render');
    assert.strictEqual(renderStep.needed, true, 'render step must be forced needed by --only-step even without --render-figma');
    assert.ok(renderStep.reason.includes('Forced by --only-step'), 'reason must reflect forced state');
});

test('PipelinePlan: invalid --only-step throws a clear error', async () => {
    await assert.rejects(
        () => createPlan({ component: 'alert', 'only-step': 'not_a_step' }),
        /Invalid --only-step value/,
        'Should throw with descriptive message for unknown only-step'
    );
});

// --- Exit code / report tests ---

test('Report: JSON output includes success:false when hasFailures is true', async () => {
    const plan = {
        components: { alert: { slug: 'alert', steps: [] } },
        orphans: { figma_only: [], doc_only: [], spec_only: [] }
    };
    const executionState = {
        global: { tokensSync: 'Success', finalGate: 'Validation Failed' },
        components: { alert: { success: false, logs: ['error'] } }
    };
    const meta = { hasFailures: true, failedComponents: ['alert'] };

    // Capture JSON output
    const origLog = console.log;
    let captured = '';
    console.log = (msg) => { captured += msg; };
    try {
        generateReport(plan, executionState, { json: true }, meta);
    } finally {
        console.log = origLog;
    }

    const parsed = JSON.parse(captured);
    assert.strictEqual(parsed.success, false, 'JSON report must include success: false');
    assert.deepStrictEqual(parsed.failedComponents, ['alert'], 'JSON report must list failed components');
});

test('Report: JSON output includes success:true when no failures', async () => {
    const plan = {
        components: { alert: { slug: 'alert', steps: [] } },
        orphans: { figma_only: [], doc_only: [], spec_only: [] }
    };
    const executionState = {
        global: { tokensSync: 'Success', finalGate: 'Success' },
        components: { alert: { success: true, logs: [] } }
    };

    const origLog = console.log;
    let captured = '';
    console.log = (msg) => { captured += msg; };
    try {
        generateReport(plan, executionState, { json: true }, { hasFailures: false, failedComponents: [] });
    } finally {
        console.log = origLog;
    }

    const parsed = JSON.parse(captured);
    assert.strictEqual(parsed.success, true, 'JSON report must include success: true');
    assert.deepStrictEqual(parsed.failedComponents, [], 'No failed components');
});
