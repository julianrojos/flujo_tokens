import type { PipelinePhase } from './pipeline-cache.js';

export type PipelinePluginPlacement = 'core' | 'before-core' | 'after-core';

export type PipelinePluginContext<State> = {
    phase: PipelinePhase;
    state: State;
};

export type PipelinePlugin<State> = {
    name: string;
    phase: PipelinePhase;
    placement?: PipelinePluginPlacement;
    transform: (ctx: PipelinePluginContext<State>) => Promise<void> | void;
};

export type PipelineHooks<State> = {
    onPluginStart?: (ctx: PipelinePluginContext<State> & { plugin: PipelinePlugin<State> }) => void;
    onPluginFinish?: (ctx: PipelinePluginContext<State> & { plugin: PipelinePlugin<State> }) => void;
};

export type PipelinePluginLogEvent =
    | {
          level: 'info';
          event: 'pipeline_start';
          pluginCount: number;
          phaseCount: number;
          timeoutMs: number;
      }
    | {
          level: 'info';
          event: 'plugin_start';
          plugin: string;
          phase: PipelinePhase;
      }
    | {
          level: 'info';
          event: 'plugin_finish';
          plugin: string;
          phase: PipelinePhase;
          durationMs: number;
      }
    | {
          level: 'error';
          event: 'plugin_error';
          plugin: string;
          phase: PipelinePhase;
          durationMs: number;
          message: string;
      }
    | {
          level: 'info';
          event: 'pipeline_complete';
          durationMs: number;
      }
    | {
          level: 'error';
          event: 'pipeline_failed';
          durationMs: number;
          message: string;
      };

export type PipelinePluginLogger = (event: PipelinePluginLogEvent) => void;

export const DEFAULT_PLUGIN_TIMEOUT_MS = 60_000;

function normalizePlacement<State>(plugin: PipelinePlugin<State>): PipelinePluginPlacement {
    return plugin.placement || 'after-core';
}

function normalizeTimeout(rawTimeoutMs: number | undefined): number {
    if (typeof rawTimeoutMs !== 'number' || !Number.isFinite(rawTimeoutMs) || rawTimeoutMs <= 0) {
        return DEFAULT_PLUGIN_TIMEOUT_MS;
    }
    return Math.floor(rawTimeoutMs);
}

function defaultLogger(event: PipelinePluginLogEvent): void {
    const sink = event.level === 'error' ? console.error : console.log;
    sink(JSON.stringify({ ts: Date.now(), ...event }));
}

export function buildPhaseExecutionPlan<State>(args: {
    phases: readonly PipelinePhase[];
    plugins: readonly PipelinePlugin<State>[];
}): PipelinePlugin<State>[] {
    const grouped = new Map<
        PipelinePhase,
        {
            before: PipelinePlugin<State>[];
            core: PipelinePlugin<State>[];
            after: PipelinePlugin<State>[];
        }
    >();

    for (const phase of args.phases) {
        grouped.set(phase, { before: [], core: [], after: [] });
    }

    for (const plugin of args.plugins) {
        const bucket = grouped.get(plugin.phase);
        if (!bucket) {
            throw new Error(`Plugin "${plugin.name}" references unknown phase "${plugin.phase}".`);
        }
        const placement = normalizePlacement(plugin);
        if (placement === 'before-core') bucket.before.push(plugin);
        if (placement === 'core') bucket.core.push(plugin);
        if (placement === 'after-core') bucket.after.push(plugin);
    }

    const plan: PipelinePlugin<State>[] = [];
    for (const phase of args.phases) {
        const bucket = grouped.get(phase);
        if (!bucket) continue;
        if (bucket.core.length !== 1) {
            const names = bucket.core.map(item => item.name).join(', ');
            throw new Error(
                `Phase "${phase}" must register exactly one core plugin. Received ${bucket.core.length}${names ? `: ${names}` : ''}.`
            );
        }
        plan.push(...bucket.before, ...bucket.core, ...bucket.after);
    }

    return plan;
}

export async function runPipelinePlugins<State>(args: {
    phases: readonly PipelinePhase[];
    plugins: readonly PipelinePlugin<State>[];
    state: State;
    hooks?: PipelineHooks<State>;
    pluginTimeoutMs?: number;
    logger?: PipelinePluginLogger;
}): Promise<void> {
    const plan = buildPhaseExecutionPlan({
        phases: args.phases,
        plugins: args.plugins
    });

    const timeoutMs = normalizeTimeout(args.pluginTimeoutMs);
    const logger = args.logger || defaultLogger;
    const pipelineStart = Date.now();

    logger({
        level: 'info',
        event: 'pipeline_start',
        pluginCount: plan.length,
        phaseCount: args.phases.length,
        timeoutMs
    });

    try {
        for (const plugin of plan) {
            const pluginStart = Date.now();
            const ctx: PipelinePluginContext<State> = {
                phase: plugin.phase,
                state: args.state
            };
            logger({
                level: 'info',
                event: 'plugin_start',
                plugin: plugin.name,
                phase: plugin.phase
            });
            args.hooks?.onPluginStart?.({ ...ctx, plugin });

            let timeoutHandle: NodeJS.Timeout | undefined;
            try {
                await Promise.race([
                    Promise.resolve(plugin.transform(ctx)),
                    new Promise<never>((_, reject) => {
                        timeoutHandle = setTimeout(() => {
                            reject(new Error(`Plugin "${plugin.name}" timed out after ${timeoutMs}ms.`));
                        }, timeoutMs);
                    })
                ]);
            } catch (error) {
                logger({
                    level: 'error',
                    event: 'plugin_error',
                    plugin: plugin.name,
                    phase: plugin.phase,
                    durationMs: Date.now() - pluginStart,
                    message: error instanceof Error ? error.message : String(error)
                });
                throw error;
            } finally {
                if (timeoutHandle) clearTimeout(timeoutHandle);
            }

            logger({
                level: 'info',
                event: 'plugin_finish',
                plugin: plugin.name,
                phase: plugin.phase,
                durationMs: Date.now() - pluginStart
            });
            args.hooks?.onPluginFinish?.({ ...ctx, plugin });
        }

        logger({
            level: 'info',
            event: 'pipeline_complete',
            durationMs: Date.now() - pipelineStart
        });
    } catch (error) {
        logger({
            level: 'error',
            event: 'pipeline_failed',
            durationMs: Date.now() - pipelineStart,
            message: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}
