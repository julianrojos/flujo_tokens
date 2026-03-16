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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

interface CommandResult {
    ok: boolean;
    code: number;
}

interface ParsedArgs {
    system: string | null;
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

    console.log('=== DS Sync Figma Pipeline ===');
    if (system) {
        console.log(`System: ${system}`);
    }
    console.log('');

    // Step 1: Import tokens from Figma
    console.log('Step 1/3: Importing tokens from Figma...');
    const tokensResult = runCommand(['npm', 'run', 'ds:tokens-from-figma'], system);
    if (!tokensResult.ok) {
        console.error(`\n❌ Failed at step 1 (ds:tokens-from-figma): exit code ${tokensResult.code}`);
        process.exit(tokensResult.code);
    }
    console.log('✓ Tokens imported successfully');

    // Step 2: Generate registry
    console.log('\nStep 2/3: Generating token registry...');
    const registryResult = runCommand(['npm', 'run', 'generate:registry'], system);
    if (!registryResult.ok) {
        console.error(`\n❌ Failed at step 2 (generate:registry): exit code ${registryResult.code}`);
        process.exit(registryResult.code);
    }
    console.log('✓ Registry generated successfully');

    // Step 3: Generate usage index
    console.log('\nStep 3/3: Generating token usage index...');
    const usageResult = runCommand(['npm', 'run', 'ds:token-usage-index'], system);
    if (!usageResult.ok) {
        console.error(`\n❌ Failed at step 3 (ds:token-usage-index): exit code ${usageResult.code}`);
        process.exit(usageResult.code);
    }
    console.log('✓ Usage index generated successfully');

    console.log('\n=== ✅ Pipeline completed successfully ===');
    process.exit(0);
}

main().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
