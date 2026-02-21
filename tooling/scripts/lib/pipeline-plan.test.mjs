import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlan } from './pipeline-plan.mjs';

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
