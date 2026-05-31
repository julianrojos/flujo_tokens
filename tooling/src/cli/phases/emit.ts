import fs from 'fs';
import path from 'path';

import { flattenTokens } from '../../core/emit.js';
import { readCssVariablesFromFile, extractCssVariables, formatCssSectionHeader } from '../../core/css.js';
import type { PipelinePhase } from '../../runtime/pipeline-cache.js';
import { loadCheckpoint, saveCheckpoint, sha256FromObject, sha256FromFile, sha256FromString } from '../../runtime/pipeline-cache.js';
import { logChangeDetection } from '../../utils/reporting.js';
import { formatModeLabel } from '../../utils/modes.js';

type EmitCheckpointPayload = {
    analyzeHash: string;
    emitHash: string;
    outputs: Array<{ label: string; filePath: string; contentHash: string }>;
    summary: any;
    detectedModes: string[];
    emittedModes: string[];
};

type EmitPhaseOptions = {
    fromPhase?: PipelinePhase;
    forcePhases: PipelinePhase[];
    splitOutput: boolean;
    preferredMode?: string;
    modeStrictPreferred: boolean;
};

type EmitPhaseState = {
    checkpointsEnabled: boolean;
    analyzeDependencyHash: string;
    emitManifestPath: string;
    emitDependencyHash: string;
    outputs: Array<{ label: string; filePath: string; emitEntries: Array<{ originalName: string; content: any }> }>;
    analyzedScopes: any[];
    summary: any;
    detectedModeSet: Set<string>;
    emittedModeSet: Set<string>;
    combinedTokens: Record<string, any>;
    cssVarNameOwners: Map<string, any>;
    cssVarNameCollisionMap: Map<string, any>;
    fileEntries: Array<{ originalName: string; content: any }>;
};

type EmitPhaseContext = {
    options: EmitPhaseOptions;
    pipelineSchemaVersion: number;
    toolVersion: string;
    shouldBypassCheckpoint: (
        phase: PipelinePhase,
        fromPhase: PipelinePhase | undefined,
        forcePhases: PipelinePhase[]
    ) => boolean;
    toSummarySnapshot: (summary: any) => any;
    fromSummarySnapshot: (snapshot: any) => any;
    getOutputTargets: (
        fileEntries: Array<{ originalName: string; content: any }>
    ) => Array<{ label: string; filePath: string; emitEntries: Array<{ originalName: string; content: any }> }>;
    getEmitManifestPath: (outputs: Array<{ label: string; filePath: string; emitEntries: any[] }>) => string;
    isEmitCheckpointUsable: (
        payload: EmitCheckpointPayload,
        outputs: Array<{ label: string; filePath: string; emitEntries: any[] }>
    ) => boolean;
    buildScopeProcessingContexts: (
        analyzedScopes: any[],
        summary: any,
        combinedTokens: Record<string, any>,
        cssVarNameOwners: Map<string, any>,
        cssVarNameCollisionMap: Map<string, any>
    ) => Array<{ scope: { selector: string; mode?: string; skipBaseWhenMode: boolean; modeOverridesOnly: boolean; allowModeBranches: boolean }; processingCtx: any }>;
};

export function runEmitPhase(
    state: EmitPhaseState,
    context: EmitPhaseContext
): void {
    state.outputs = context.getOutputTargets(state.fileEntries);
    state.emitManifestPath = context.getEmitManifestPath(state.outputs);
    state.emitDependencyHash = sha256FromObject({
        phase: 'emit',
        analyzeHash: state.analyzeDependencyHash,
        split: context.options.splitOutput,
        outputs: state.outputs.map(output => ({ label: output.label, filePath: output.filePath }))
    });

    const bypassEmit = context.shouldBypassCheckpoint(
        'emit',
        context.options.fromPhase,
        context.options.forcePhases
    );

    if (state.checkpointsEnabled && !bypassEmit) {
        const emitCheckpoint = loadCheckpoint<EmitCheckpointPayload>(
            state.emitManifestPath,
            'emit',
            state.emitDependencyHash,
            context.pipelineSchemaVersion,
            context.toolVersion
        );

        if (emitCheckpoint && context.isEmitCheckpointUsable(
            emitCheckpoint.payload,
            state.outputs
        )) {
            state.summary = context.fromSummarySnapshot(emitCheckpoint.payload.summary);
            state.detectedModeSet = new Set<string>(emitCheckpoint.payload.detectedModes);
            state.emittedModeSet = new Set<string>(emitCheckpoint.payload.emittedModes);
            console.log('⚡ Phase EMIT: checkpoint hit (outputs unchanged)');
            return;
        }

        if (!emitCheckpoint) {
            console.log('🧩 Phase EMIT: checkpoint miss');
        } else {
            console.log('🧩 Phase EMIT: checkpoint invalidated (output drift detected)');
        }
    } else if (!state.checkpointsEnabled) {
        console.log('⏭️  Phase EMIT: checkpoints disabled');
    } else {
        console.log('⏭️  Phase EMIT: forced re-run');
    }

    const scopeProcessingContexts = context.buildScopeProcessingContexts(
        state.analyzedScopes,
        state.summary,
        state.combinedTokens,
        state.cssVarNameOwners,
        state.cssVarNameCollisionMap
    );

    if (context.options.splitOutput) {
        const primitiveEntries = state.fileEntries.filter(entry => entry.originalName.startsWith('_')).length;
        const tokenEntries = state.fileEntries.filter(entry => !entry.originalName.startsWith('_')).length;
        console.log(`🧩 Split mode enabled: ${primitiveEntries} primitive file(s), ${tokenEntries} token file(s)`);
    }

    const emitOutputSnapshots: Array<{ label: string; filePath: string; contentHash: string }> = [];

    for (const output of state.outputs) {
        if (output.emitEntries.length === 0) {
            console.warn(`⚠️  No files matched for ${output.label}; writing empty output.`);
        }

        let previousVariables = new Map<string, string>();
        let previousContent: string | null = null;

        if (fs.existsSync(output.filePath)) {
            try {
                previousVariables = readCssVariablesFromFile(output.filePath);
                previousContent = fs.readFileSync(output.filePath, 'utf8');
                console.log(`📄 Previous ${output.label} CSS found with ${previousVariables.size} variables`);
            } catch {
                console.warn(`⚠️  Could not read previous ${output.label} CSS file (creating a new one)`);
            }
        }

        const cssBlocks: string[] = [];
        for (const { scope, processingCtx } of scopeProcessingContexts) {
            const scopedPrimitives: string[] = [];
            const scopedAliases: string[] = [];

            for (const { originalName, content } of output.emitEntries) {
                const { primitives, aliases } = flattenTokens(
                    processingCtx,
                    content,
                    [],
                    [originalName],
                    scope.mode,
                    false,
                    scope.skipBaseWhenMode,
                    scope.modeOverridesOnly,
                    scope.allowModeBranches
                );

                if (primitives.length > 0) {
                    if (scopedPrimitives.length > 0) scopedPrimitives.push('');
                    scopedPrimitives.push(formatCssSectionHeader(originalName));
                    scopedPrimitives.push(...primitives);
                }

                if (aliases.length > 0) {
                    if (scopedAliases.length > 0) scopedAliases.push('');
                    scopedAliases.push(formatCssSectionHeader(originalName));
                    scopedAliases.push(...aliases);
                }
            }

            const scopedLines: string[] = [];
            scopedLines.push(...scopedPrimitives);
            if (scopedPrimitives.length > 0 && scopedAliases.length > 0) scopedLines.push('');
            scopedLines.push(...scopedAliases);
            if (scopedLines.length === 0) continue;

            const modeLabel = scope.mode ? `/* ========== MODE ${formatModeLabel(scope.mode)} ========== */\n` : '';
            cssBlocks.push(`${modeLabel}${scope.selector} {\n${scopedLines.join('\n')}\n}`);
        }

        const finalCss = `${cssBlocks.join('\n\n')}\n`;
        const destDir = path.dirname(output.filePath);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        if (previousContent !== finalCss) {
            console.log(`📝 Writing ${output.label} CSS file...`);
            try {
                fs.writeFileSync(output.filePath, finalCss, 'utf-8');
                const outputLabel = path.relative(process.cwd(), output.filePath) || output.filePath;
                console.log(`\n✅ ${outputLabel} updated`);
            } catch (err) {
                console.error(`❌ Could not write ${output.filePath}:`, err);
                process.exit(1);
            }
        } else {
            const outputLabel = path.relative(process.cwd(), output.filePath) || output.filePath;
            console.log(`⏭️  ${outputLabel} unchanged (skip write)`);
        }

        if (previousVariables.size > 0) {
            const newVariables = extractCssVariables(finalCss);
            logChangeDetection(previousVariables, newVariables, {
                preferredMode: context.options.preferredMode,
                detectedModes: state.detectedModeSet,
                emittedModes: state.emittedModeSet,
                modeStrict: context.options.modeStrictPreferred
            });
        }

        console.log(`\n📝 File ready at: ${output.filePath}`);
        emitOutputSnapshots.push({
            label: output.label,
            filePath: output.filePath,
            contentHash: sha256FromString(finalCss)
        });
    }

    if (state.checkpointsEnabled) {
        const emitPayload: EmitCheckpointPayload = {
            analyzeHash: state.analyzeDependencyHash,
            emitHash: state.emitDependencyHash,
            outputs: emitOutputSnapshots,
            summary: context.toSummarySnapshot(state.summary),
            detectedModes: Array.from(state.detectedModeSet),
            emittedModes: Array.from(state.emittedModeSet)
        };

        saveCheckpoint(
            state.emitManifestPath,
            'emit',
            state.emitDependencyHash,
            emitPayload,
            context.pipelineSchemaVersion,
            context.toolVersion
        );
    }
}
