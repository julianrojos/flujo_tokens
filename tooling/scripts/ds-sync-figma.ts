#!/usr/bin/env node

/**
 * DS Sync Figma - Orchestrator Script (DB-Native)
 *
 * Runs the complete Figma token sync pipeline with staging+swap:
 * 1. ds:tokens-from-figma - Import fresh artifacts from Figma
 * 2. generate:registry - Generate token-registry artifact
 * 3. ds:token-usage-index - Generate token-usage artifact
 * 4. ds:token-graph - Generate token dependency graph artifact
 * 5. Stage artifacts into *_staging tables and swap to production
 *
 * SQLite is the single source of truth.
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const dbPath = process.env.DS_DB_PATH
    ? path.resolve(process.env.DS_DB_PATH)
    : path.join(projectRoot, 'apps/ds-dashboard/server/db/ds-dashboard.db');

interface CommandResult {
    ok: boolean;
    code: number;
}

interface ParsedArgs {
    system: string | null;
    preserveStaging: boolean;
}

interface StagingState {
    runId: string;
    dsId: string;
    lockKey: string;
}

interface GeneratedArtifactsPaths {
    tokenRegistryPath: string;
    tokenUsageIndexPath: string;
    figmaAliasGraphPath: string;
    tokenGraphPath: string;
}

interface TokenRegistryEntry {
    id?: string;
    path?: string;
    slashPath?: string;
    cssVar?: string;
    type?: string;
    collection?: string;
    $value?: unknown;
    resolvedValue?: unknown;
    modes?: Record<string, unknown>;
}

interface TokenRegistryFile {
    entries?: TokenRegistryEntry[];
}

interface TokenUsageOccurrence {
    kind?: string;
    source?: string;
    owner?: string;
    detail?: string;
}

interface TokenUsageEntry {
    path?: string;
    usedIn?: TokenUsageOccurrence[];
}

interface TokenUsageIndexFile {
    entries?: TokenUsageEntry[];
}

interface FigmaAliasItem {
    fromPath?: string;
    toPath?: string;
    modes?: string[];
}

interface FigmaAliasGraphFile {
    aliases?: FigmaAliasItem[];
}

interface TokenGraphFile extends Record<string, unknown> {}

interface StagedArtifactsResult {
    tokenCount: number;
    usageCount: number;
    aliasCount: number;
    tokenGraphJson: string;
}

/**
 * Parse CLI arguments
 */
function parseArgs(): ParsedArgs {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Usage: ds:sync-figma [options]

Options:
  --system <id>    Specify the design system ID to sync
  --preserve-staging  Keep staging rows on failure for debugging
  --help, -h       Show this help message

Example:
  ds:sync-figma --system sys-01
`);
        process.exit(0);
    }

    const systemIndex = args.indexOf('--system');
    const system = systemIndex !== -1 && args[systemIndex + 1] ? args[systemIndex + 1] : null;

    const preserveStaging = args.includes('--preserve-staging');
    return { system, preserveStaging };
}

/**
 * Run a command with optional --system propagation
 */
function runCommand(command: string[], system: string | null, envOverrides: Record<string, string> = {}): CommandResult {
    const cmdArgs = [...command];
    if (system) {
        const isNpmRun = cmdArgs[0] === 'npm' && cmdArgs[1] === 'run';
        if (isNpmRun) {
            const hasArgSeparator = cmdArgs.includes('--');
            if (!hasArgSeparator) {
                cmdArgs.push('--');
            }
            cmdArgs.push('--system', system);
        } else {
            cmdArgs.push('--system', system);
        }
    }

    console.log(`\n▶ Running: ${cmdArgs.join(' ')}\n`);

    const result = spawnSync(cmdArgs[0], cmdArgs.slice(1), {
        stdio: 'inherit',
        cwd: projectRoot,
        env: {
            ...process.env,
            ...envOverrides,
        },
    });

    const code = result.status ?? 1;
    return { ok: code === 0, code };
}

/**
 * Initialize staging area with run_id
 */
function initStaging(dsId: string): StagingState {
    const runId = randomUUID();
    const lockKey = `sync_lock:${dsId}`;
    const lockTtlMs = 6 * 60 * 60 * 1000;
    const now = Date.now();
    const staleThreshold = now - lockTtlMs;
    const lockPayload = JSON.stringify({ runId, dsId, createdAt: now });
    console.log(`Creating staging area with run_id: ${runId}`);

    // Verify DB connection
    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');

    try {
        // Verify design system exists
        const stmt = db.prepare('SELECT id, name FROM design_systems WHERE id = ?');
        const row = stmt.get(dsId) as { id: string; name: string } | undefined;

        if (!row) {
            throw new Error(`Design system "${dsId}" not found in database`);
        }

        const lockUpsertResult = db.prepare(`
            INSERT INTO app_settings (key, value, updated_at)
            VALUES (?, ?, strftime('%s', 'now'))
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updated_at = excluded.updated_at
            WHERE (
              CAST(json_extract(app_settings.value, '$.createdAt') AS INTEGER) < ?
              OR json_extract(app_settings.value, '$.createdAt') IS NULL
            )
        `).run(lockKey, lockPayload, staleThreshold);
        if (lockUpsertResult.changes === 0) {
            throw new Error(`Sync already in progress for system "${dsId}"`);
        }

        console.log(`✓ Design system verified: ${row.name} (${row.id})`);
        console.log(`✓ Acquired sync lock: ${lockKey}`);

        return { runId, dsId, lockKey };
    } finally {
        db.close();
    }
}

function cleanupRunStaging(db: Database.Database, runId: string, dsId: string): void {
    db.prepare('DELETE FROM tokens_staging WHERE run_id = ? AND ds_id = ?').run(runId, dsId);
    db.prepare('DELETE FROM token_mode_values_staging WHERE run_id = ? AND ds_id = ?').run(runId, dsId);
    db.prepare('DELETE FROM token_usage_occurrences_staging WHERE run_id = ? AND ds_id = ?').run(runId, dsId);
    db.prepare('DELETE FROM figma_aliases_staging WHERE run_id = ? AND ds_id = ?').run(runId, dsId);
}

function resolveGeneratedArtifactsPaths(dsId: string): GeneratedArtifactsPaths {
    const generatedDir = path.join(projectRoot, 'design-systems', dsId, 'docs', '_generated');
    return {
        tokenRegistryPath: path.join(generatedDir, 'token-registry.json'),
        tokenUsageIndexPath: path.join(generatedDir, 'token-usage-index.json'),
        figmaAliasGraphPath: path.join(generatedDir, 'figma-alias-graph.json'),
        tokenGraphPath: path.join(generatedDir, 'token-graph.json'),
    };
}

function loadRequiredJsonFile<T>(filePath: string): T {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Required artifact not found: ${path.relative(projectRoot, filePath)}`);
    }
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw) as T;
    } catch (error) {
        throw new Error(
            `Invalid JSON artifact at ${path.relative(projectRoot, filePath)}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

function loadOptionalJsonFile<T>(filePath: string): T | null {
    if (!fs.existsSync(filePath)) return null;
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw) as T;
    } catch (error) {
        throw new Error(
            `Invalid JSON artifact at ${path.relative(projectRoot, filePath)}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

function stageTokensFromRegistry(db: Database.Database, state: StagingState, registryPath: string): number {
    const registry = loadRequiredJsonFile<TokenRegistryFile>(registryPath);
    const entries = Array.isArray(registry.entries) ? registry.entries : [];
    if (entries.length === 0) {
        throw new Error(`Token registry is empty: ${path.relative(projectRoot, registryPath)}`);
    }

    const tokenStmt = db.prepare(`
        INSERT OR REPLACE INTO tokens_staging (
            id, run_id, ds_id, slash_path, css_var, type, collection, raw_value
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const modeStmt = db.prepare(`
        INSERT INTO token_mode_values_staging (run_id, ds_id, token_path, mode, resolved_value)
        VALUES (?, ?, ?, ?, ?)
    `);

    let insertedTokens = 0;
    for (const entry of entries) {
        const tokenPath = String(entry.path || entry.id || '').trim();
        if (!tokenPath) continue;
        const slashPath = String(entry.slashPath || tokenPath.replace(/\./g, '/')).trim();
        const cssVar = String(entry.cssVar || `--${slashPath.replace(/\//g, '-')}`).trim();
        const type = String(entry.type || 'unknown').trim() || 'unknown';
        const collection = String(entry.collection || 'unknown').trim() || 'unknown';
        const rawValueInput = entry.$value ?? entry.resolvedValue ?? '';
        const rawValue = typeof rawValueInput === 'string'
            ? JSON.stringify({ $value: rawValueInput })
            : JSON.stringify(rawValueInput);

        tokenStmt.run(
            tokenPath,
            state.runId,
            state.dsId,
            slashPath,
            cssVar,
            type,
            collection,
            rawValue,
        );

        const modes = entry.modes && typeof entry.modes === 'object'
            ? Object.entries(entry.modes)
            : [];
        if (modes.length > 0) {
            for (const [mode, value] of modes) {
                modeStmt.run(state.runId, state.dsId, tokenPath, String(mode || 'Default'), String(value ?? ''));
            }
        } else {
            const fallbackValue = entry.resolvedValue ?? entry.$value ?? '';
            modeStmt.run(state.runId, state.dsId, tokenPath, 'Default', String(fallbackValue ?? ''));
        }

        insertedTokens += 1;
    }

    if (insertedTokens === 0) {
        throw new Error(`Token registry has no valid entries: ${path.relative(projectRoot, registryPath)}`);
    }

    return insertedTokens;
}

function stageTokenUsageFromIndex(db: Database.Database, state: StagingState, usagePath: string): number {
    const usageIndex = loadRequiredJsonFile<TokenUsageIndexFile>(usagePath);
    const entries = Array.isArray(usageIndex.entries) ? usageIndex.entries : [];
    const usageStmt = db.prepare(`
        INSERT INTO token_usage_occurrences_staging (run_id, ds_id, token_id, kind, source, owner, detail)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let insertedUsage = 0;
    for (const entry of entries) {
        const tokenPath = String(entry.path || '').trim();
        if (!tokenPath) continue;
        const occurrences = Array.isArray(entry.usedIn) ? entry.usedIn : [];
        for (const occurrence of occurrences) {
            usageStmt.run(
                state.runId,
                state.dsId,
                tokenPath,
                String(occurrence.kind || 'unknown'),
                String(occurrence.source || 'unknown'),
                String(occurrence.owner || 'unknown'),
                String(occurrence.detail || ''),
            );
            insertedUsage += 1;
        }
    }

    return insertedUsage;
}

function stageFigmaAliases(db: Database.Database, state: StagingState, aliasPath: string): number {
    const aliasGraph = loadOptionalJsonFile<FigmaAliasGraphFile>(aliasPath);
    const aliases = Array.isArray(aliasGraph?.aliases) ? aliasGraph.aliases : [];
    if (aliases.length === 0) return 0;

    const aliasStmt = db.prepare(`
        INSERT OR REPLACE INTO figma_aliases_staging (run_id, ds_id, from_path, to_path, modes)
        VALUES (?, ?, ?, ?, ?)
    `);

    let insertedAliases = 0;
    for (const alias of aliases) {
        const fromPath = String(alias.fromPath || '').trim();
        const toPath = String(alias.toPath || '').trim();
        if (!fromPath || !toPath) continue;
        aliasStmt.run(
            state.runId,
            state.dsId,
            fromPath,
            toPath,
            JSON.stringify(Array.isArray(alias.modes) ? alias.modes : []),
        );
        insertedAliases += 1;
    }

    return insertedAliases;
}

function stageArtifactsToDatabase(state: StagingState): StagedArtifactsResult {
    const paths = resolveGeneratedArtifactsPaths(state.dsId);
    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');

    try {
        return db.transaction(() => {
            cleanupRunStaging(db, state.runId, state.dsId);
            const tokenCount = stageTokensFromRegistry(db, state, paths.tokenRegistryPath);
            const usageCount = stageTokenUsageFromIndex(db, state, paths.tokenUsageIndexPath);
            const aliasCount = stageFigmaAliases(db, state, paths.figmaAliasGraphPath);
            const tokenGraph = loadRequiredJsonFile<TokenGraphFile>(paths.tokenGraphPath);
            const tokenGraphJson = JSON.stringify(tokenGraph);
            console.log(`✓ Staged artifacts into DB: ${tokenCount} tokens, ${usageCount} usage rows, ${aliasCount} aliases`);
            return {
                tokenCount,
                usageCount,
                aliasCount,
                tokenGraphJson,
            };
        })();
    } finally {
        db.close();
    }
}

function releaseSyncLock(lockKey: string, runId: string): void {
    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    try {
        db.prepare(`
            DELETE FROM app_settings
            WHERE key = ?
              AND json_extract(value, '$.runId') = ?
        `).run(lockKey, runId);
    } finally {
        db.close();
    }
}

/**
 * Swap staging data to production (transactional)
 */
function swapStagingToProduction(
    state: StagingState,
    stagedArtifacts: Pick<StagedArtifactsResult, 'tokenGraphJson'>,
    preserveStagingOnFailure: boolean,
): void {
    const { runId, dsId } = state;

    console.log('Swapping staging data to production...');

    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');

    try {
        const tx = db.transaction(() => {
            // Count staging data
            const tokenCountStmt = db.prepare('SELECT COUNT(*) as count FROM tokens_staging WHERE run_id = ? AND ds_id = ?');
            const tokenCount = (tokenCountStmt.get(runId, dsId) as { count: number }).count;

            const modeCountStmt = db.prepare('SELECT COUNT(*) as count FROM token_mode_values_staging WHERE run_id = ? AND ds_id = ?');
            const modeCount = (modeCountStmt.get(runId, dsId) as { count: number }).count;

            const usageCountStmt = db.prepare('SELECT COUNT(*) as count FROM token_usage_occurrences_staging WHERE run_id = ? AND ds_id = ?');
            const usageCount = (usageCountStmt.get(runId, dsId) as { count: number }).count;

            const aliasCountStmt = db.prepare('SELECT COUNT(*) as count FROM figma_aliases_staging WHERE run_id = ? AND ds_id = ?');
            const aliasCount = (aliasCountStmt.get(runId, dsId) as { count: number }).count;

            console.log(`  Staging data: ${tokenCount} tokens, ${modeCount} mode values, ${usageCount} usage occurrences, ${aliasCount} aliases`);

            if (tokenCount === 0) {
                throw new Error('No tokens in staging - import may have failed');
            }

            const orphanUsageCountStmt = db.prepare(`
                SELECT COUNT(*) as count
                FROM token_usage_occurrences_staging su
                WHERE su.run_id = ?
                  AND su.ds_id = ?
                  AND NOT EXISTS (
                    SELECT 1
                    FROM tokens_staging st
                    WHERE st.run_id = su.run_id
                      AND st.ds_id = su.ds_id
                      AND st.id = su.token_id
                  )
            `);
            const orphanUsageCount = (orphanUsageCountStmt.get(runId, dsId) as { count: number }).count;
            if (orphanUsageCount > 0) {
                throw new Error(`Staging contains ${orphanUsageCount} usage rows that reference missing tokens`);
            }

            const orphanAliasCountStmt = db.prepare(`
                SELECT COUNT(*) as count
                FROM figma_aliases_staging sa
                WHERE sa.run_id = ?
                  AND sa.ds_id = ?
                  AND (
                    NOT EXISTS (
                      SELECT 1
                      FROM tokens_staging st_from
                      WHERE st_from.run_id = sa.run_id
                        AND st_from.ds_id = sa.ds_id
                        AND st_from.id = sa.from_path
                    )
                    OR NOT EXISTS (
                      SELECT 1
                      FROM tokens_staging st_to
                      WHERE st_to.run_id = sa.run_id
                        AND st_to.ds_id = sa.ds_id
                        AND st_to.id = sa.to_path
                    )
                  )
            `);
            const orphanAliasCount = (orphanAliasCountStmt.get(runId, dsId) as { count: number }).count;
            if (orphanAliasCount > 0) {
                throw new Error(`Staging contains ${orphanAliasCount} figma aliases with missing token endpoints`);
            }

            const orphanModeCountStmt = db.prepare(`
                SELECT COUNT(*) as count
                FROM token_mode_values_staging sm
                WHERE sm.run_id = ?
                  AND sm.ds_id = ?
                  AND NOT EXISTS (
                    SELECT 1
                    FROM tokens_staging st
                    WHERE st.run_id = sm.run_id
                      AND st.ds_id = sm.ds_id
                      AND st.id = sm.token_path
                  )
            `);
            const orphanModeCount = (orphanModeCountStmt.get(runId, dsId) as { count: number }).count;
            if (orphanModeCount > 0) {
                throw new Error(`Staging contains ${orphanModeCount} mode value rows that reference missing tokens`);
            }

            // Begin swap - delete existing data for this ds_id
            console.log('  Deleting existing production data...');
            db.prepare('DELETE FROM token_usage_occurrences WHERE ds_id = ?').run(dsId);
            db.prepare('DELETE FROM token_mode_values WHERE ds_id = ?').run(dsId);
            db.prepare('DELETE FROM tokens WHERE ds_id = ?').run(dsId);
            db.prepare('DELETE FROM figma_aliases WHERE ds_id = ?').run(dsId);
            // Insert from staging to production
            console.log('  Inserting staging data to production...');

            db.prepare(`
                INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
                SELECT id, ds_id, slash_path, css_var, type, collection, raw_value
                FROM tokens_staging
                WHERE run_id = ? AND ds_id = ?
            `).run(runId, dsId);

            // Token mode values
            db.prepare(`
                INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
                SELECT ds_id, token_path, mode, resolved_value
                FROM token_mode_values_staging
                WHERE run_id = ? AND ds_id = ?
            `).run(runId, dsId);

            // Token usage occurrences
            db.prepare(`
                INSERT OR IGNORE INTO token_usage_occurrences (ds_id, token_id, kind, source, owner, detail)
                SELECT ds_id, token_id, kind, source, owner, detail
                FROM token_usage_occurrences_staging
                WHERE run_id = ? AND ds_id = ?
            `).run(runId, dsId);

            // Figma aliases
            db.prepare(`
                INSERT INTO figma_aliases (ds_id, from_path, to_path, modes)
                SELECT ds_id, from_path, to_path, modes
                FROM figma_aliases_staging
                WHERE run_id = ? AND ds_id = ?
            `).run(runId, dsId);

            db.prepare(`
                INSERT OR REPLACE INTO token_graph (ds_id, graph_json, generated_at)
                VALUES (?, ?, strftime('%s', 'now'))
            `).run(dsId, stagedArtifacts.tokenGraphJson);

            // Clear staging for this run
            console.log('  Clearing staging area...');
            cleanupRunStaging(db, runId, dsId);

            // Update metadata
            const metaStmt = db.prepare(`
                INSERT OR REPLACE INTO db_meta (key, value)
                VALUES ('last_sync', ?)
            `);
            metaStmt.run(JSON.stringify({
                timestamp: Date.now(),
                runId,
                dsId,
                tokensLoaded: tokenCount,
                modeValuesLoaded: modeCount,
                usageLoaded: usageCount,
                aliasesLoaded: aliasCount,
            }));

            console.log(`✓ Swap completed successfully`);
        });

        tx();
    } catch (error) {
        console.error('Swap failed:', error instanceof Error ? error.message : String(error));
        if (preserveStagingOnFailure) {
            console.error('Preserving staging data for debugging (--preserve-staging enabled).');
        } else {
            console.error('Cleaning up staging data...');
            cleanupRunStaging(db, runId, dsId);
        }

        throw error;
    } finally {
        db.close();
    }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
    const { system, preserveStaging } = parseArgs();

    console.log('=== DS Sync Figma Pipeline (DB-Native) ===');
    if (system) {
        console.log(`System: ${system}`);
    }
    console.log('');

    // Initialize staging
    let stagingState: StagingState;
    try {
        if (!system) {
            throw new Error('--system is required for DB-native sync');
        }
        stagingState = initStaging(system);
    } catch (error) {
        console.error('❌ Failed to initialize staging:');
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
        return;
    }

    try {
        // Step 1: Import tokens from Figma
        console.log('Step 1/5: Importing tokens from Figma...');
        const tokensResult = runCommand(['npm', 'run', 'ds:tokens-from-figma', '--', '--force', 'true', '--source', 'auto'], system, {
            DS_SYNC_RUN_ID: stagingState.runId,
            DS_SYNC_DS_ID: stagingState.dsId,
        });
        if (!tokensResult.ok) {
            throw new Error(`Failed at step 1 (ds:tokens-from-figma): exit code ${tokensResult.code}`);
        }
        console.log('✓ Tokens imported successfully');

        // Step 2: Generate registry artifact
        console.log('\nStep 2/5: Generating token registry...');
        const registryResult = runCommand(['npm', 'run', 'generate:registry'], system, {
            DS_SYNC_RUN_ID: stagingState.runId,
            DS_SYNC_DS_ID: stagingState.dsId,
        });
        if (!registryResult.ok) {
            throw new Error(`Failed at step 2 (generate:registry): exit code ${registryResult.code}`);
        }
        console.log('✓ Token registry generated successfully');

        // Step 3: Generate usage index artifact
        console.log('\nStep 3/5: Generating token usage index...');
        const usageResult = runCommand(['npm', 'run', 'ds:token-usage-index'], system, {
            DS_SYNC_RUN_ID: stagingState.runId,
            DS_SYNC_DS_ID: stagingState.dsId,
        });
        if (!usageResult.ok) {
            throw new Error(`Failed at step 3 (ds:token-usage-index): exit code ${usageResult.code}`);
        }
        console.log('✓ Token usage index generated successfully');

        // Step 4: Generate token graph artifact
        console.log('\nStep 4/5: Generating token graph...');
        const tokenGraphResult = runCommand(['npm', 'run', 'ds:token-graph'], system, {
            DS_SYNC_RUN_ID: stagingState.runId,
            DS_SYNC_DS_ID: stagingState.dsId,
        });
        if (!tokenGraphResult.ok) {
            throw new Error(`Failed at step 4 (ds:token-graph): exit code ${tokenGraphResult.code}`);
        }
        console.log('✓ Token graph generated successfully');

        // Step 5: Stage artifacts and swap to production (transactional)
        console.log('\nStep 5/5: Staging artifacts and swapping to production...');
        const stagedArtifacts = stageArtifactsToDatabase(stagingState);
        swapStagingToProduction(stagingState, stagedArtifacts, preserveStaging);
        console.log('✓ Production data updated successfully');

        console.log('\n=== ✅ Pipeline completed successfully ===');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`\n❌ Pipeline failed: ${errorMessage}`);
        if (preserveStaging) {
            console.error('\n⚠️  Staging data preserved for debugging');
        } else {
            console.error('\n⚠️  Staging data has been cleaned up - no rollback needed');
        }
        console.error('\n=== ❌ Pipeline failed ===');
        process.exitCode = 1;
    } finally {
        try {
            releaseSyncLock(stagingState.lockKey, stagingState.runId);
        } catch (releaseError) {
            console.error('Failed to release sync lock:', releaseError instanceof Error ? releaseError.message : String(releaseError));
        }
    }
}

main().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
