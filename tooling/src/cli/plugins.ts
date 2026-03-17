import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

import type { PipelinePlugin } from '../runtime/pipeline-plugins.js';
import type { PipelinePhase } from '../runtime/pipeline-cache.js';

function isPipelinePhase(value: unknown): value is PipelinePhase {
    return value === 'ingest' || value === 'index' || value === 'analyze' || value === 'emit';
}

function isPluginPlacement(value: unknown): value is 'before-core' | 'after-core' {
    return value === 'before-core' || value === 'after-core';
}

function normalizePluginCandidates(raw: unknown): unknown[] {
    if (Array.isArray(raw)) return raw;
    if (raw == null) return [];
    return [raw];
}

function parseExternalPlugin<TState>(modulePath: string, candidate: unknown, index: number): PipelinePlugin<TState> {
    const suffix = `External plugin ${index + 1} in ${modulePath}`;
    if (!candidate || typeof candidate !== 'object') {
        throw new Error(`${suffix} must be an object.`);
    }

    const plugin = candidate as {
        name?: unknown;
        phase?: unknown;
        placement?: unknown;
        transform?: unknown;
    };

    if (typeof plugin.name !== 'string' || !plugin.name.trim()) {
        throw new Error(`${suffix} is missing a valid "name".`);
    }
    if (!isPipelinePhase(plugin.phase)) {
        throw new Error(`${suffix} must define phase as ingest|index|analyze|emit.`);
    }
    if (typeof plugin.transform !== 'function') {
        throw new Error(`${suffix} is missing a function "transform".`);
    }

    const placement = plugin.placement;
    if (placement != null && !isPluginPlacement(placement)) {
        throw new Error(`${suffix} has invalid placement "${String(placement)}". Use before-core|after-core.`);
    }

    return {
        name: plugin.name.trim(),
        phase: plugin.phase,
        placement: placement || 'after-core',
        transform: plugin.transform as PipelinePlugin<TState>['transform']
    };
}

export async function loadExternalPhasePlugins<TState>(pluginModules: string[]): Promise<PipelinePlugin<TState>[]> {
    const plugins: PipelinePlugin<TState>[] = [];
    for (const modulePath of pluginModules) {
        const resolvedPath = path.resolve(process.cwd(), modulePath);
        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`Plugin file not found: ${resolvedPath}`);
        }
        const pluginStats = fs.statSync(resolvedPath);
        if (!pluginStats.isFile()) {
            throw new Error(`Plugin path must point to a file: ${resolvedPath}`);
        }
        const moduleUrl = pathToFileURL(resolvedPath).href;
        const imported = (await import(moduleUrl)) as Record<string, unknown>;
        const candidates = [
            ...normalizePluginCandidates(imported.plugins),
            ...normalizePluginCandidates(imported.plugin),
            ...normalizePluginCandidates(imported.default)
        ];
        if (candidates.length === 0) {
            throw new Error(
                `Plugin module "${resolvedPath}" must export "plugin", "plugins", or "default" with plugin definitions.`
            );
        }
        candidates.forEach((candidate, idx) => {
            plugins.push(parseExternalPlugin<TState>(resolvedPath, candidate, idx));
        });
    }
    return plugins;
}
