#!/usr/bin/env node

/**
 * DS Sync Figma - Orchestrator Script
 *
 * Runs the complete Figma token sync pipeline:
 * 1. ds:tokens-from-figma - Import tokens from Figma
 * 2. generate:registry - Generate token registry
 * 3. ds:token-usage-index - Generate usage index
 *
 * This script properly propagates the --system argument to all subcommands.
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import * as fsSync from 'node:fs';

import { createDesignSystemRepository } from './lib/system-repository.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

interface CommandResult {
    ok: boolean;
    code: number;
}

interface ParsedArgs {
    system: string | null;
}

interface CheckpointState {
    jsonFiles: Array<{ path: string; backupPath: string; existedBefore: boolean }>;
}

/**
 * Create checkpoint of JSON files before modification
 */
function createCheckpoint(generatedDir: string): CheckpointState {
    // Checkpoint files that are modified by the pipeline
    // Note: All three JSON files are consumed by the DB rebuild in step 4
    const jsonFiles = [
        { path: path.join(generatedDir, 'token-registry.json'), backupPath: '', existedBefore: false },
        { path: path.join(generatedDir, 'token-usage-index.json'), backupPath: '', existedBefore: false },
        { path: path.join(generatedDir, 'figma-alias-graph.json'), backupPath: '', existedBefore: false },
    ];

    for (const file of jsonFiles) {
        file.existedBefore = fsSync.existsSync(file.path);
        if (file.existedBefore) {
            file.backupPath = `${file.path}.checkpoint-${Date.now()}`;
            fsSync.copyFileSync(file.path, file.backupPath);
        }
    }

    return { jsonFiles };
}

/**
 * Rollback to checkpoint if step fails
 */
function rollbackCheckpoint(checkpoint: CheckpointState): void {
    for (const file of checkpoint.jsonFiles) {
        // If file existed before, restore from backup
        if (file.existedBefore && file.backupPath && fsSync.existsSync(file.backupPath)) {
            try {
                fsSync.copyFileSync(file.backupPath, file.path);
                console.log(`  Restored: ${path.basename(file.path)}`);
            } catch (error) {
                console.warn(`  Failed to restore ${path.basename(file.path)}:`, error instanceof Error ? error.message : String(error));
            }
        } else if (!file.existedBefore && fsSync.existsSync(file.path)) {
            // If file didn't exist before but exists now, delete it
            try {
                fsSync.unlinkSync(file.path);
                console.log(`  Removed: ${path.basename(file.path)} (did not exist before checkpoint)`);
            } catch (error) {
                console.warn(`  Failed to remove ${path.basename(file.path)}:`, error instanceof Error ? error.message : String(error));
            }
        }
    }
}

/**
 * Clean up checkpoint files
 */
function cleanupCheckpoint(checkpoint: CheckpointState): void {
    for (const file of checkpoint.jsonFiles) {
        // Only cleanup backup files that were actually created (file existed before)
        if (file.existedBefore && file.backupPath && fsSync.existsSync(file.backupPath)) {
            try {
                fsSync.unlinkSync(file.backupPath);
            } catch {
                // Ignore cleanup errors
            }
        }
    }
}

/**
 * Parse CLI arguments
 */
function parseArgs(): ParsedArgs {
    const args = process.argv.slice(2);

    // Handle --help
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Usage: ds:sync-figma [options]

Options:
  --system <id>    Specify the design system ID to sync
  --help, -h       Show this help message

Example:
  ds:sync-figma --system my-system
`);
        process.exit(0);
    }

    const systemIndex = args.indexOf('--system');
    const system = systemIndex !== -1 && args[systemIndex + 1] ? args[systemIndex + 1] : null;

    return { system };
}

/**
 * Run a command with optional --system propagation
 */
function runCommand(command: string[], system: string | null): CommandResult {
    const cmdArgs = [...command];
    if (system) {
        const isNpmRun = cmdArgs[0] === 'npm' && cmdArgs[1] === 'run';
        if (isNpmRun) {
            cmdArgs.push('--', '--system', system);
        } else {
            cmdArgs.push('--system', system);
        }
    }

    console.log(`\n▶ Running: ${cmdArgs.join(' ')}\n`);

    const result = spawnSync(cmdArgs[0], cmdArgs.slice(1), {
        stdio: 'inherit',
        cwd: projectRoot,
    });

    const code = result.status ?? 1;
    return { ok: code === 0, code };
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
    const { system } = parseArgs();

    // Resolve generatedDir from canonical system config
    const designSystemRepository = createDesignSystemRepository({ repoRoot: projectRoot, watch: false });
    let generatedDir: string;
    try {
        if (system) {
            const sysCtx = designSystemRepository.resolveSystemContext(system);
            generatedDir = sysCtx.paths.generated;
        } else {
            const sysCtx = designSystemRepository.resolveDashboardSystemContext('');
            generatedDir = sysCtx.genDir;
        }
    } catch (error) {
        console.error('❌ Failed to resolve generated directory from design-systems.json:');
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }

    console.log('=== DS Sync Figma Pipeline ===');
    if (system) {
        console.log(`System: ${system}`);
    }
    console.log('');

    // Create checkpoint for transactional rollback
    console.log('Creating checkpoint of JSON files...');
    const checkpoint = createCheckpoint(generatedDir);
    let checkpointCleaned = false;

    try {
        // Step 1: Import tokens from Figma
        console.log('Step 1/4: Importing tokens from Figma...');
        const tokensResult = runCommand(['npm', 'run', 'ds:tokens-from-figma'], system);
        if (!tokensResult.ok) {
            throw new Error(`Failed at step 1 (ds:tokens-from-figma): exit code ${tokensResult.code}`);
        }
        console.log('✓ Tokens imported successfully');

        // Step 2: Generate registry
        console.log('\nStep 2/4: Generating token registry...');
        const registryResult = runCommand(['npm', 'run', 'generate:registry'], system);
        if (!registryResult.ok) {
            throw new Error(`Failed at step 2 (generate:registry): exit code ${registryResult.code}`);
        }
        console.log('✓ Registry generated successfully');

        // Step 3: Generate usage index
        console.log('\nStep 3/4: Generating token usage index...');
        const usageResult = runCommand(['npm', 'run', 'ds:token-usage-index'], system);
        if (!usageResult.ok) {
            throw new Error(`Failed at step 3 (ds:token-usage-index): exit code ${usageResult.code}`);
        }
        console.log('✓ Usage index generated successfully');

        // Step 4: Rebuild token cache in DB (transactional)
        console.log('\nStep 4/4: Rebuilding token cache in database...');
        const dbRebuildResult = runCommand(['npm', 'run', 'ds:rebuild-token-cache'], system);
        if (!dbRebuildResult.ok) {
            throw new Error(`Failed at step 4 (ds:rebuild-token-cache): exit code ${dbRebuildResult.code}`);
        }
        console.log('✓ Token cache rebuilt in database successfully');

        // Success - cleanup checkpoint
        cleanupCheckpoint(checkpoint);
        checkpointCleaned = true;

        console.log('\n=== ✅ Pipeline completed successfully ===');
        process.exit(0);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`\n❌ Pipeline failed: ${errorMessage}`);

        // Rollback if checkpoint exists and wasn't cleaned
        if (!checkpointCleaned) {
            console.error('\n🔄 Rolling back to checkpoint...');
            rollbackCheckpoint(checkpoint);
            console.error('✓ Rollback completed - JSON files restored to pre-sync state');
        } else {
            console.error('⚠️  Checkpoint already cleaned - JSON files may be partially updated');
        }

        console.error('\n=== ❌ Pipeline failed ===');
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
