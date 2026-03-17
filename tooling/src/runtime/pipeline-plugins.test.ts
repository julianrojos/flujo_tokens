import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPhaseExecutionPlan, runPipelinePlugins, type PipelinePluginLogEvent } from './pipeline-plugins.js';

test('PipelinePlugins: executes plugins in phase order (before -> core -> after)', async () => {
    const executed: string[] = [];

    const plan = buildPhaseExecutionPlan({
        phases: ['ingest'],
        plugins: [
            {
                name: 'before-ingest',
                phase: 'ingest',
                placement: 'before-core',
                transform: () => {
                    executed.push('before-ingest');
                }
            },
            {
                name: 'core-ingest',
                phase: 'ingest',
                placement: 'core',
                transform: () => {
                    executed.push('core-ingest');
                }
            },
            {
                name: 'after-ingest',
                phase: 'ingest',
                placement: 'after-core',
                transform: () => {
                    executed.push('after-ingest');
                }
            }
        ],
    });

    assert.deepStrictEqual(
        plan.map(plugin => plugin.name),
        ['before-ingest', 'core-ingest', 'after-ingest']
    );
});

test('PipelinePlugins: plugins can mutate shared pipeline state', async () => {
    const state = { count: 0 };

    await runPipelinePlugins({
        phases: ['ingest'],
        plugins: [
            {
                name: 'core-ingest',
                phase: 'ingest',
                placement: 'core',
                transform: ({ state: runState }) => {
                    runState.count += 1;
                }
            },
            {
                name: 'after-ingest',
                phase: 'ingest',
                transform: ({ state: runState }) => {
                    runState.count += 2;
                }
            }
        ],
        state,
        logger: () => {}
    });

    assert.strictEqual(state.count, 3);
});

test('PipelinePlugins: plugin failures are propagated', async () => {
    await assert.rejects(
        runPipelinePlugins({
            phases: ['ingest'],
            plugins: [
                {
                    name: 'core-ingest',
                    phase: 'ingest',
                    placement: 'core',
                    transform: () => {
                        throw new Error('Plugin failed');
                    }
                }
            ],
            state: {},
            logger: () => {}
        }),
        /Plugin failed/
    );
});

test('PipelinePlugins: plugin timeout fails execution', async () => {
    await assert.rejects(
        runPipelinePlugins({
            phases: ['ingest'],
            plugins: [
                {
                    name: 'core-ingest',
                    phase: 'ingest',
                    placement: 'core',
                    transform: () => new Promise<void>(() => {})
                }
            ],
            state: {},
            pluginTimeoutMs: 20,
            logger: () => {}
        }),
        /timed out/
    );
});

test('PipelinePlugins: emits structured lifecycle logs', async () => {
    const logs: PipelinePluginLogEvent[] = [];

    await runPipelinePlugins({
        phases: ['ingest'],
        plugins: [
            {
                name: 'core-ingest',
                phase: 'ingest',
                placement: 'core',
                transform: () => {}
            }
        ],
        state: {},
        logger: event => logs.push(event)
    });

    const events = logs.map(event => event.event);
    assert.deepStrictEqual(events, ['pipeline_start', 'plugin_start', 'plugin_finish', 'pipeline_complete']);
    assert.strictEqual(logs[1]?.event, 'plugin_start');
    if (logs[1]?.event === 'plugin_start') {
        assert.strictEqual(logs[1].plugin, 'core-ingest');
        assert.strictEqual(logs[1].phase, 'ingest');
    }
});
