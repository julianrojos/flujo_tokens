#!/usr/bin/env node

/**
 * Rebuild Token Cache
 *
 * Rebuilds the SQLite token cache from JSON artifacts.
 * Used by ds:sync-figma pipeline (step 4).
 *
 * Usage:
 *   npm run ds:rebuild-token-cache
 *   npm run ds:rebuild-token-cache -- --system my-system
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { bootstrapDatabase } from '../db/db-service.js';
import { TokenRepository } from '../db/token-repository.js';
import { createDesignSystemRepository } from '../system-repository.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../../..');

interface RebuildOptions {
    system?: string;
}

function parseArgs(): RebuildOptions {
    const args = process.argv.slice(2);
    const systemIndex = args.indexOf('--system');
    const system = systemIndex !== -1 && args[systemIndex + 1] ? args[systemIndex + 1] : undefined;
    return { system };
}

function getGeneratedDirFromSystemConfig(system?: string): string {
    const designSystemRepository = createDesignSystemRepository({ repoRoot: projectRoot, watch: false });

    try {
        if (system) {
            const sysCtx = designSystemRepository.resolveSystemContext(system);
            return sysCtx.paths.generated;
        } else {
            const sysCtx = designSystemRepository.resolveDashboardSystemContext('');
            return sysCtx.genDir;
        }
    } catch (error) {
        if (system) {
            throw new Error(`System "${system}" not found in design-systems.json`);
        } else {
            throw new Error('No default system configured in design-systems.json');
        }
    }
}

async function main(): Promise<void> {
    const { system } = parseArgs();

    let generatedDir: string;
    try {
        generatedDir = getGeneratedDirFromSystemConfig(system);
    } catch (error) {
        console.error('❌ Failed to resolve generated directory:');
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }

    console.log('=== Rebuild Token Cache ===');
    console.log(`Generated directory: ${generatedDir}`);
    if (system) {
        console.log(`System: ${system}`);
    }
    console.log('');

    // Check if JSON files exist
    const jsonPaths = {
        tokenRegistry: path.join(generatedDir, 'token-registry.json'),
        tokenUsageIndex: path.join(generatedDir, 'token-usage-index.json'),
        figmaAliasGraph: path.join(generatedDir, 'figma-alias-graph.json'),
    };

    const missingFiles: string[] = [];
    for (const [name, filePath] of Object.entries(jsonPaths)) {
        if (!fs.existsSync(filePath)) {
            missingFiles.push(`${name}: ${filePath}`);
        }
    }

    if (missingFiles.length > 0) {
        console.warn('⚠️  Warning: Some JSON files are missing:');
        for (const file of missingFiles) {
            console.warn(`   - ${file}`);
        }
        console.warn('\nContinuing with available files...\n');
    }

    // Initialize database
    const dbPath = path.join(__dirname, '../db/ds-dashboard.db');
    console.log(`Database path: ${dbPath}`);

    try {
        const db = bootstrapDatabase({ dbPath });
        const tokenRepo = new TokenRepository(db);

        console.log('\nRebuilding token cache from JSON files...\n');

        const result = tokenRepo.rebuildFromJsonFiles(jsonPaths);

        console.log('\n=== Rebuild Summary ===');
        console.log(`Tokens loaded: ${result.tokensLoaded}`);
        console.log(`Usage entries loaded: ${result.usageLoaded}`);
        console.log(`Aliases loaded: ${result.aliasesLoaded}`);

        if (result.warnings.length > 0) {
            console.log(`\nWarnings (${result.warnings.length}):`);
            for (const warning of result.warnings) {
                console.log(`  - ${warning}`);
            }
        }

        // Get rebuild metadata
        const metadata = tokenRepo.getLastRebuildMetadata();
        if (metadata) {
            console.log(`\nRebuild timestamp: ${new Date(metadata.timestamp!).toISOString()}`);
        }

        db.close();
        console.log('\n✅ Token cache rebuilt successfully');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Failed to rebuild token cache:');
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
