import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createOpenRouterDefaultModelGate } from './openrouter-default-model-gate';

describe('createOpenRouterDefaultModelGate', () => {
  it('invalidates an in-flight default-model request after user interaction', () => {
    const gate = createOpenRouterDefaultModelGate();

    const requestSeq = gate.beginRequest();

    assert.equal(requestSeq, 1);
    assert.equal(gate.canApply(requestSeq), true);

    gate.markTouched();

    assert.equal(gate.canApply(requestSeq), false);
    assert.equal(gate.beginRequest(), null);
  });

  it('invalidates an in-flight default-model request when the provider changes', () => {
    const gate = createOpenRouterDefaultModelGate();

    const requestSeq = gate.beginRequest();

    assert.equal(requestSeq, 1);

    gate.cancelPendingRequest();

    assert.equal(gate.canApply(requestSeq), false);
  });

  it('invalidates a pending request when the initial model changes', () => {
    const gate = createOpenRouterDefaultModelGate();

    const requestSeq = gate.beginRequest();

    assert.equal(requestSeq, 1);

    gate.syncInitialModel('deepseek/deepseek-chat');

    assert.equal(gate.canApply(requestSeq), false);
    assert.equal(gate.beginRequest(), null);
  });
});
