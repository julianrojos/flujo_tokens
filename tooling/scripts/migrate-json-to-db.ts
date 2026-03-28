#!/usr/bin/env node

/**
 * Migrate JSON to DB
 *
 * One-shot migration script to transfer data from JSON files to SQLite.
 * Idempotent - safe to run multiple times.
 *
 * Usage: npx tsx tooling/scripts/migrate-json-to-db.ts [--dry-run]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const dbPath = path.join(repoRoot, 'apps/ds-dashboard/server/db/ds-dashboard.db');

interface DryRunOptions {
    dryRun: boolean;
}

interface MigrationStats {
    designSystems: number;
    tokens: number;
    tokenModeValues: number;
    components: number;
    componentSpecs: number;
    tokenUsageOccurrences: number;
    figmaAliases: number;
    tokenGraphs: number;
    healthSnapshots: number;
    healthHistory: number;
}

interface MigrationAnomalies {
    skippedInvalidComponentEntries: number;
    missingComponentRowAfterUpsert: number;
    skippedSpecsMissingMarkdownPath: number;
}

/**
 * Load JSON file safely
 */
function loadJson<T = unknown>(filePath: string, allowMissing = false): T | null {
    if (!fs.existsSync(filePath)) {
        if (allowMissing) return null;
        throw new Error(`File not found: ${filePath}`);
    }
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content) as T;
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to parse JSON from ${filePath}: ${reason}`);
    }
}

/**
 * Count JSON entries
 */
function countJsonEntries(filePath: string): number {
    const data = loadJson(filePath, true);
    if (!data) return 0;
    
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.entries)) return record.entries.length;
    if (Array.isArray(record.systems)) return record.systems.length;
    if (Array.isArray(record.aliases)) return record.aliases.length;
    if (Array.isArray(record.usage)) return record.usage.length;
    
    return 1; // Single object
}

/**
 * Migrate design-systems.json
 */
function migrateDesignSystems(db: Database, designSystemsPath: string, { dryRun }: DryRunOptions): number {
    const config = loadJson<{ systems: Array<{ id: string; name: string; appName?: string; figmaFileId?: string; figmaApiToken?: string; collections?: string[]; compileVariablesOnCapture?: boolean }>; defaultSystem: string }>(designSystemsPath);
    if (!config || !config.systems) return 0;

    const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO design_systems (id, name, app_name, figma_file_id, figma_api_token, collections, compile_variables_on_capture, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
    `);

    const defaultStmt = db.prepare(`
        INSERT OR REPLACE INTO app_settings (key, value, updated_at)
        VALUES ('default_system_id', ?, strftime('%s', 'now'))
    `);

    let count = 0;
    for (const system of config.systems) {
        if (dryRun) {
            count++;
            continue;
        }

        insertStmt.run(
            system.id,
            system.name,
            system.appName || null,
            system.figmaFileId || null,
            system.figmaApiToken || null,
            system.collections ? JSON.stringify(system.collections) : null,
            system.compileVariablesOnCapture !== false ? 1 : 0
        );
        count++;
    }

    if (!dryRun && config.defaultSystem) {
        defaultStmt.run(config.defaultSystem);
    }

    return count;
}

/**
 * Migrate token-registry.json to tokens + token_mode_values
 */
function migrateTokenRegistry(db: Database, tokenRegistryPath: string, dsId: string, { dryRun }: DryRunOptions): { tokens: number; modeValues: number } {
    const registry = loadJson<{ entries?: Array<{ id?: string; path?: string; cssVar?: string; type?: string; collection?: string; $value?: string; modes?: Record<string, string> }> }>(tokenRegistryPath, true);
    if (!registry || !registry.entries) return { tokens: 0, modeValues: 0 };

    const tokenStmt = db.prepare(`
        INSERT OR REPLACE INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const modeStmt = db.prepare(`
        INSERT OR REPLACE INTO token_mode_values (ds_id, token_path, mode, resolved_value)
        VALUES (?, ?, ?, ?)
    `);

    let tokenCount = 0;
    let modeCount = 0;

    for (const entry of registry.entries) {
        const tokenPath = entry.path || entry.id || '';
        if (!tokenPath) continue;

        const slashPath = tokenPath.replace(/\./g, '/');
        const cssVar = entry.cssVar || `--${tokenPath.replace(/\./g, '-')}`;

        if (dryRun) {
            tokenCount++;
            if (entry.modes) modeCount += Object.keys(entry.modes).length;
            continue;
        }

        // Insert token
        tokenStmt.run(
            tokenPath,
            dsId,
            slashPath,
            cssVar,
            entry.type || 'unknown',
            entry.collection || 'unknown',
            JSON.stringify({ $value: entry.$value })
        );
        tokenCount++;

        // Insert mode values
        if (entry.modes) {
            for (const [mode, value] of Object.entries(entry.modes)) {
                modeStmt.run(dsId, tokenPath, mode, value);
                modeCount++;
            }
        }
    }

    return { tokens: tokenCount, modeValues: modeCount };
}

/**
 * Migrate figma-alias-graph.json
 */
function migrateFigmaAliases(db: Database, aliasPath: string, dsId: string, { dryRun }: DryRunOptions): number {
    const aliases = loadJson<{ aliases?: Array<{ fromPath?: string; toPath?: string; modes?: string[] }> }>(aliasPath, true);
    if (!aliases || !aliases.aliases) return 0;

    const stmt = db.prepare(`
        INSERT OR REPLACE INTO figma_aliases (ds_id, from_path, to_path, modes)
        VALUES (?, ?, ?, ?)
    `);

    let count = 0;
    for (const alias of aliases.aliases) {
        if (!alias.fromPath || !alias.toPath) continue;

        if (dryRun) {
            count++;
            continue;
        }

        stmt.run(dsId, alias.fromPath, alias.toPath, JSON.stringify(alias.modes || []));
        count++;
    }

    return count;
}

/**
 * Migrate component-registry.json
 */
function migrateComponentRegistry(
    db: Database,
    componentRegistryPath: string,
    dsId: string,
    { dryRun }: DryRunOptions
): { components: number; specs: number; anomalies: MigrationAnomalies } {
    const registry = loadJson<{ entries?: Array<{ slug?: string; name?: string; status?: string; docType?: string; specs?: Array<{ markdownPath?: string; docStatus?: string; coverage?: number }>; visualProofs?: Array<{ imagePath?: string; caption?: string }> }> }>(componentRegistryPath, true);
    if (!registry || !registry.entries) {
        return {
            components: 0,
            specs: 0,
            anomalies: {
                skippedInvalidComponentEntries: 0,
                missingComponentRowAfterUpsert: 0,
                skippedSpecsMissingMarkdownPath: 0,
            },
        };
    }

    const componentStmt = db.prepare(`
        INSERT INTO components (ds_id, slug, name, status, doc_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
        ON CONFLICT(ds_id, slug) DO UPDATE SET
          name = excluded.name,
          status = excluded.status,
          doc_type = excluded.doc_type,
          updated_at = excluded.updated_at
    `);
    const componentIdStmt = db.prepare(`
        SELECT id
        FROM components
        WHERE ds_id = ? AND slug = ?
    `);

    const specStmt = db.prepare(`
        INSERT OR REPLACE INTO component_specs (component_id, markdown_path, doc_status, coverage, created_at, updated_at)
        VALUES (?, ?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
    `);

    const proofStmt = db.prepare(`
        INSERT OR REPLACE INTO component_visual_proofs (component_id, image_path, caption, created_at)
        VALUES (?, ?, ?, strftime('%s', 'now'))
    `);

    let componentCount = 0;
    let specCount = 0;
    const anomalies: MigrationAnomalies = {
        skippedInvalidComponentEntries: 0,
        missingComponentRowAfterUpsert: 0,
        skippedSpecsMissingMarkdownPath: 0,
    };

    for (const entry of registry.entries) {
        if (!entry.slug || !entry.name) {
            anomalies.skippedInvalidComponentEntries++;
            continue;
        }

        if (dryRun) {
            componentCount++;
            if (entry.specs) specCount += entry.specs.length;
            continue;
        }

        // Insert component
        componentStmt.run(
            dsId,
            entry.slug,
            entry.name,
            entry.status || 'draft',
            entry.docType || 'component'
        );

        const componentRow = componentIdStmt.get(dsId, entry.slug) as { id: number } | undefined;
        if (!componentRow) {
            anomalies.missingComponentRowAfterUpsert++;
            continue;
        }
        const componentId = componentRow.id;

        // Insert specs
        if (entry.specs) {
            for (const spec of entry.specs) {
                if (!spec.markdownPath) {
                    anomalies.skippedSpecsMissingMarkdownPath++;
                    continue;
                }
                specStmt.run(
                    componentId,
                    spec.markdownPath,
                    spec.docStatus || 'draft',
                    spec.coverage || 0
                );
                specCount++;
            }
        }

        // Insert visual proofs
        if (entry.visualProofs) {
            const proofStmtBulk = db.transaction((proofs: Array<{ imagePath: string; caption?: string }>) => {
                for (const proof of proofs) {
                    if (!proof.imagePath) continue;
                    proofStmt.run(componentId, proof.imagePath, proof.caption || null);
                }
            });
            proofStmtBulk(entry.visualProofs);
        }

        componentCount++;
    }

    return { components: componentCount, specs: specCount, anomalies };
}

/**
 * Migrate token-usage-index.json
 */
function migrateTokenUsage(db: Database, usagePath: string, dsId: string, { dryRun }: DryRunOptions): number {
    const usage = loadJson<{ entries?: Array<{ path?: string; usedIn?: Array<{ kind?: string; source?: string; owner?: string; detail?: string }> }> }>(usagePath, true);
    if (!usage || !usage.entries) return 0;

    const stmt = db.prepare(`
        INSERT OR IGNORE INTO token_usage_occurrences (ds_id, token_id, kind, source, owner, detail)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    let count = 0;
    for (const entry of usage.entries) {
        if (!entry.path) continue;

        if (dryRun) {
            count += entry.usedIn?.length || 0;
            continue;
        }

        for (const occ of entry.usedIn || []) {
            stmt.run(
                dsId,
                entry.path,
                occ.kind || 'unknown',
                occ.source || 'unknown',
                occ.owner || 'unknown',
                occ.detail || ''
            );
            count++;
        }
    }

    return count;
}

/**
 * Main migration function
 */
function migrateJsonToDb(options: DryRunOptions = { dryRun: false }): MigrationStats {
    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');

    console.log(`\n🚀 Starting JSON → DB migration (${options.dryRun ? 'DRY RUN' : 'LIVE'})`);
    console.log(`📍 Database: ${dbPath}\n`);

    const stats: MigrationStats = {
        designSystems: 0,
        tokens: 0,
        tokenModeValues: 0,
        components: 0,
        componentSpecs: 0,
        tokenUsageOccurrences: 0,
        figmaAliases: 0,
        tokenGraphs: 0,
        healthSnapshots: 0,
        healthHistory: 0,
    };
    const anomalies: MigrationAnomalies = {
        skippedInvalidComponentEntries: 0,
        missingComponentRowAfterUpsert: 0,
        skippedSpecsMissingMarkdownPath: 0,
    };

    try {
        // 1. Migrate design-systems.json
        const designSystemsPath = path.join(repoRoot, 'tooling/config/design-systems.json');
        if (fs.existsSync(designSystemsPath)) {
            console.log('📦 Migrating design-systems.json...');
            stats.designSystems = migrateDesignSystems(db, designSystemsPath, options);
            console.log(`   ✓ ${stats.designSystems} design systems\n`);
        } else {
            console.log('⚠️  design-systems.json not found, skipping\n');
        }

        // Get design systems to migrate tokens for each
        const systemsStmt = db.prepare('SELECT id FROM design_systems');
        const systems = systemsStmt.all() as Array<{ id: string }>;

        for (const system of systems) {
            const dsId = system.id;
            const docsDir = path.join(repoRoot, 'design-systems', dsId, 'docs');
            const generatedDir = path.join(docsDir, '_generated');

            console.log(`📦 Migrating data for design system: ${dsId}`);

            // 2. Migrate token-registry.json
            const tokenRegistryPath = path.join(generatedDir, 'token-registry.json');
            if (fs.existsSync(tokenRegistryPath)) {
                const result = migrateTokenRegistry(db, tokenRegistryPath, dsId, options);
                stats.tokens += result.tokens;
                stats.tokenModeValues += result.modeValues;
                console.log(`   ✓ ${result.tokens} tokens, ${result.modeValues} mode values`);
            }

            // 3. Migrate figma-alias-graph.json
            const aliasPath = path.join(generatedDir, 'figma-alias-graph.json');
            if (fs.existsSync(aliasPath)) {
                stats.figmaAliases = migrateFigmaAliases(db, aliasPath, dsId, options);
                console.log(`   ✓ ${stats.figmaAliases} figma aliases`);
            }

            // 4. Migrate component-registry.json
            const componentRegistryPath = path.join(generatedDir, 'component-registry.json');
            if (fs.existsSync(componentRegistryPath)) {
                const result = migrateComponentRegistry(db, componentRegistryPath, dsId, options);
                stats.components += result.components;
                stats.componentSpecs += result.specs;
                anomalies.skippedInvalidComponentEntries += result.anomalies.skippedInvalidComponentEntries;
                anomalies.missingComponentRowAfterUpsert += result.anomalies.missingComponentRowAfterUpsert;
                anomalies.skippedSpecsMissingMarkdownPath += result.anomalies.skippedSpecsMissingMarkdownPath;
                console.log(`   ✓ ${result.components} components, ${result.specs} specs`);
            }

            // 5. Migrate token-usage-index.json
            const usagePath = path.join(generatedDir, 'token-usage-index.json');
            if (fs.existsSync(usagePath)) {
                stats.tokenUsageOccurrences = migrateTokenUsage(db, usagePath, dsId, options);
                console.log(`   ✓ ${stats.tokenUsageOccurrences} token usage occurrences`);
            }

            console.log('');
        }

        // Summary
        console.log('📊 Migration Summary:');
        console.log(`   Design Systems:        ${stats.designSystems}`);
        console.log(`   Tokens:                ${stats.tokens}`);
        console.log(`   Token Mode Values:     ${stats.tokenModeValues}`);
        console.log(`   Components:            ${stats.components}`);
        console.log(`   Component Specs:       ${stats.componentSpecs}`);
        console.log(`   Token Usage Occurrences: ${stats.tokenUsageOccurrences}`);
        console.log(`   Figma Aliases:         ${stats.figmaAliases}`);
        console.log(`   Token Graphs:          ${stats.tokenGraphs}`);
        console.log(`   Health Snapshots:      ${stats.healthSnapshots}`);
        console.log(`   Health History:        ${stats.healthHistory}`);
        console.log('\n🔎 Data Quality Notes:');
        console.log(`   Skipped invalid component entries: ${anomalies.skippedInvalidComponentEntries}`);
        console.log(`   Missing component rows after upsert: ${anomalies.missingComponentRowAfterUpsert}`);
        console.log(`   Skipped specs missing markdownPath: ${anomalies.skippedSpecsMissingMarkdownPath}`);

        if (options.dryRun) {
            console.log('\n⚠️  DRY RUN - No data was written to the database\n');
        } else {
            console.log('\n✅ Migration completed successfully!\n');
        }

        return stats;
    } catch (error) {
        console.error('❌ Migration failed:', error instanceof Error ? error.message : String(error));
        throw error;
    } finally {
        db.close();
    }
}

// CLI
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

try {
    migrateJsonToDb({ dryRun });
    process.exit(0);
} catch (error) {
    console.error(error);
    process.exit(1);
}
