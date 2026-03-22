/**
 * Token Repository
 *
 * SQLite-backed cache for token data.
 * Provides fast lookups by CSS variable, token path, and collection.
 */

import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Token cache entry
 */
export interface TokenCacheEntry {
    id: string;          // tokenPath e.g. "primitives.blue.300"
    slashPath: string;   // "primitives/blue/300"
    cssVar: string;      // "--primitives-blue-300"
    type: string;        // "color", "dimension", etc.
    collection: string;  // "primitives", "semantic", etc.
    rawValue: string;    // JSON string for complex values
}

/**
 * Token Repository for SQLite-backed token caching
 */
export class TokenRepository {
    private db: Database.Database;

    constructor(db: Database.Database) {
        this.db = db;
    }

    /**
     * Get token by CSS variable name
     */
    getTokenByCssVar(cssVar: string): TokenCacheEntry | null {
        const stmt = this.db.prepare(`
            SELECT id, slash_path, css_var, type, collection, raw_value
            FROM tokens
            WHERE css_var = ?
        `);
        const row = stmt.get(cssVar) as
            | { id: string; slash_path: string; css_var: string; type: string; collection: string; raw_value: string }
            | undefined;

        if (!row) return null;

        return {
            id: row.id,
            slashPath: row.slash_path,
            cssVar: row.css_var,
            type: row.type,
            collection: row.collection,
            rawValue: row.raw_value,
        };
    }

    /**
     * Get token by path (dotted notation)
     */
    getTokenByPath(tokenPath: string): TokenCacheEntry | null {
        const stmt = this.db.prepare(`
            SELECT id, slash_path, css_var, type, collection, raw_value
            FROM tokens
            WHERE id = ?
        `);
        const row = stmt.get(tokenPath) as
            | { id: string; slash_path: string; css_var: string; type: string; collection: string; raw_value: string }
            | undefined;

        if (!row) return null;

        return {
            id: row.id,
            slashPath: row.slash_path,
            cssVar: row.css_var,
            type: row.type,
            collection: row.collection,
            rawValue: row.raw_value,
        };
    }

    /**
     * Get tokens by collection
     */
    getTokensByCollection(collection: string): TokenCacheEntry[] {
        const stmt = this.db.prepare(`
            SELECT id, slash_path, css_var, type, collection, raw_value
            FROM tokens
            WHERE collection = ?
            ORDER BY id
        `);
        const rows = stmt.all(collection) as Array<{
            id: string;
            slash_path: string;
            css_var: string;
            type: string;
            collection: string;
            raw_value: string;
        }>;

        return rows.map((row) => ({
            id: row.id,
            slashPath: row.slash_path,
            cssVar: row.css_var,
            type: row.type,
            collection: row.collection,
            rawValue: row.raw_value,
        }));
    }

    /**
     * Get full token usage index reconstructed from DB
     * Returns TokenUsageIndexNew format compatible with frontend
     */
    getTokenUsageIndex(): {
        ok: boolean;
        summary: {
            generatedAt: string;
            tokens_total: number;
            tokens_with_usage: number;
            tokens_without_usage: number;
            usage_links_total: number;
            usage_links_by_kind: Record<string, number>;
            unresolved_total: number;
        };
        warnings: Array<{ message: string; tokenPath?: string }>;
        unresolved: Array<{
            kind: string;
            source: string;
            owner: string;
            keyPath: string;
            tokenPath: string;
            reason: string;
            suggested: string | null;
        }>;
        entries: Array<{
            path: string;
            slashPath: string;
            cssVar: string;
            type: string;
            collection: string;
            usageCount: number;
            usageByKind: Record<string, number>;
            usedIn: Array<{
                kind: string;
                source: string;
                owner: string;
                detail: string;
            }>;
        }>;
        byPath: Record<string, {
            path: string;
            slashPath: string;
            cssVar: string;
            type: string;
            collection: string;
            usageCount: number;
            usageByKind: Record<string, number>;
            usedIn: Array<{
                kind: string;
                source: string;
                owner: string;
                detail: string;
            }>;
        }>;
        bySlashPath: Record<string, {
            path: string;
            slashPath: string;
            cssVar: string;
            type: string;
            collection: string;
            usageCount: number;
            usageByKind: Record<string, number>;
            usedIn: Array<{
                kind: string;
                source: string;
                owner: string;
                detail: string;
            }>;
        }>;
        byCssVar: Record<string, {
            path: string;
            slashPath: string;
            cssVar: string;
            type: string;
            collection: string;
            usageCount: number;
            usageByKind: Record<string, number>;
            usedIn: Array<{
                kind: string;
                source: string;
                owner: string;
                detail: string;
            }>;
        }>;
    } | null {
        try {
            // Check if DB has been populated (look for last_rebuild metadata)
            const metaStmt = this.db.prepare(`SELECT value FROM db_meta WHERE key = 'last_rebuild'`);
            const metaRow = metaStmt.get() as { value: string } | undefined;

            // If no last_rebuild metadata, DB hasn't been populated yet
            if (!metaRow) {
                return null;
            }

            // Get all tokens
            const tokensStmt = this.db.prepare(`
                SELECT id, slash_path, css_var, type, collection, raw_value
                FROM tokens
                ORDER BY id
            `);
            const tokens = tokensStmt.all() as Array<{
                id: string;
                slash_path: string;
                css_var: string;
                type: string;
                collection: string;
                raw_value: string;
            }>;

            // If no tokens in DB, consider it not populated
            if (tokens.length === 0) {
                return null;
            }

            // Get usage counts by token
            const usageStmt = this.db.prepare(`
                SELECT token_path, kind, source, owner, detail
                FROM token_usage
                ORDER BY token_path
            `);
            const usageRows = usageStmt.all() as Array<{
                token_path: string;
                kind: string;
                source: string;
                owner: string;
                detail: string;
            }>;

            // Build usage map
            const usageMap = new Map<string, {
                count: number;
                byKind: Record<string, number>;
                usedIn: Array<{
                    kind: string;
                    source: string;
                    owner: string;
                    detail: string;
                }>;
            }>();

            for (const row of usageRows) {
                if (!usageMap.has(row.token_path)) {
                    usageMap.set(row.token_path, {
                        count: 0,
                        byKind: {},
                        usedIn: [],
                    });
                }
                const usage = usageMap.get(row.token_path)!;
                usage.count++;
                usage.byKind[row.kind] = (usage.byKind[row.kind] || 0) + 1;
                usage.usedIn.push({
                    kind: row.kind,
                    source: row.source,
                    owner: row.owner,
                    detail: row.detail,
                });
            }

            // Build entries
            const entries = tokens.map((token) => {
                const usage = usageMap.get(token.id) || { count: 0, byKind: {}, usedIn: [] };
                return {
                    path: token.id,
                    slashPath: token.slash_path,
                    cssVar: token.css_var,
                    type: token.type,
                    collection: token.collection,
                    usageCount: usage.count,
                    usageByKind: usage.byKind,
                    usedIn: usage.usedIn,
                };
            });

            // Calculate summary
            const tokensWithUsage = entries.filter((e) => e.usageCount > 0).length;
            const usageLinksTotal = entries.reduce((sum, e) => sum + e.usageCount, 0);
            const usageLinksByKind = entries.reduce<Record<string, number>>((acc, e) => {
                for (const [kind, count] of Object.entries(e.usageByKind)) {
                    acc[kind] = (acc[kind] || 0) + count;
                }
                return acc;
            }, {});

            // Use metadata from earlier check for generatedAt
            let generatedAt = new Date().toISOString();
            if (metaRow) {
                try {
                    const metadata = JSON.parse(metaRow.value);
                    generatedAt = new Date(metadata.timestamp).toISOString();
                } catch {
                    // Use default
                }
            }

            return {
                ok: true,
                summary: {
                    generatedAt,
                    tokens_total: tokens.length,
                    tokens_with_usage: tokensWithUsage,
                    tokens_without_usage: tokens.length - tokensWithUsage,
                    usage_links_total: usageLinksTotal,
                    usage_links_by_kind: usageLinksByKind,
                    unresolved_total: 0,
                },
                warnings: [],
                unresolved: [],
                entries,
                byPath: Object.fromEntries(entries.map((e) => [e.path, e])),
                bySlashPath: Object.fromEntries(entries.map((e) => [e.slashPath, e])),
                byCssVar: Object.fromEntries(entries.map((e) => [e.cssVar, e])),
            };
        } catch (error) {
            console.warn('[TokenRepository] getTokenUsageIndex failed:', error instanceof Error ? error.message : String(error));
            return null;
        }
    }

    /**
     * Rebuild token cache from JSON files
     * Loads token-registry.json, token-usage-index.json, figma-alias-graph.json
     */
    rebuildFromJsonFiles(paths: {
        tokenRegistry?: string;
        tokenUsageIndex?: string;
        figmaAliasGraph?: string;
    }): {
        tokensLoaded: number;
        usageLoaded: number;
        aliasesLoaded: number;
        warnings: string[];
    } {
        const warnings: string[] = [];
        let tokensLoaded = 0;
        let usageLoaded = 0;
        let aliasesLoaded = 0;

        // Begin transaction for atomic rebuild
        const tx = this.db.transaction(() => {
            // Clear existing data
            this.db.exec('DELETE FROM tokens');
            this.db.exec('DELETE FROM token_usage');
            this.db.exec('DELETE FROM figma_aliases');

            // Load token registry
            if (paths.tokenRegistry && fs.existsSync(paths.tokenRegistry)) {
                const registryContent = fs.readFileSync(paths.tokenRegistry, 'utf8');
                const registry = JSON.parse(registryContent) as { entries?: Array<{ id?: string; path?: string; cssVar?: string; type?: string; collection?: string; $value?: string }> };

                if (registry.entries) {
                    const insertStmt = this.db.prepare(`
                        INSERT OR REPLACE INTO tokens (id, slash_path, css_var, type, collection, raw_value)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `);

                    for (const entry of registry.entries) {
                        const tokenPath = entry.path || entry.id || '';
                        if (!tokenPath) continue;

                        const slashPath = tokenPath.replace(/\./g, '/');
                        const cssVar = entry.cssVar || `--${tokenPath.replace(/\./g, '-')}`;

                        insertStmt.run(
                            tokenPath,
                            slashPath,
                            cssVar,
                            entry.type || 'unknown',
                            entry.collection || 'unknown',
                            JSON.stringify({ $value: entry.$value })
                        );
                        tokensLoaded++;
                    }
                }
            } else if (paths.tokenRegistry) {
                warnings.push(`Token registry not found: ${paths.tokenRegistry}`);
            }

            // Load token usage index
            if (paths.tokenUsageIndex && fs.existsSync(paths.tokenUsageIndex)) {
                const usageContent = fs.readFileSync(paths.tokenUsageIndex, 'utf8');
                const usageIndex = JSON.parse(usageContent) as {
                    entries?: Array<{
                        path?: string;
                        usedIn?: Array<{ kind?: string; source?: string; owner?: string; detail?: string }>;
                    }>;
                    usage?: Array<{
                        tokenPath?: string;
                        usedIn?: Array<{ kind?: string; context?: string; file?: string; property?: string }>;
                    }>;
                };

                const insertStmt = this.db.prepare(`
                    INSERT OR IGNORE INTO token_usage (token_path, kind, source, owner, detail)
                    VALUES (?, ?, ?, ?, ?)
                `);

                // New format (entries/usedIn)
                if (usageIndex.entries) {
                    for (const entry of usageIndex.entries) {
                        if (!entry.path) continue;
                        for (const occ of entry.usedIn || []) {
                            insertStmt.run(
                                entry.path,
                                occ.kind || 'unknown',
                                occ.source || 'unknown',
                                occ.owner || 'unknown',
                                occ.detail || ''
                            );
                            usageLoaded++;
                        }
                    }
                }

                // Legacy format (usage/usedIn)
                if (usageIndex.usage) {
                    for (const entry of usageIndex.usage) {
                        if (!entry.tokenPath) continue;
                        for (const occ of entry.usedIn || []) {
                            const context = String(occ.context || 'other').trim().toLowerCase();
                            const rawKind = String(occ.kind || '').trim().toLowerCase();
                            const sourceMap = {
                                spec: 'component-spec',
                                css: 'css-alias',
                                other: 'unknown',
                            };
                            const kindMap = {
                                spec: 'component-spec',
                                css: 'css-alias',
                                'component-spec': 'component-spec',
                                'css-alias': 'css-alias',
                            };
                            const normalizedKind =
                                kindMap[rawKind as keyof typeof kindMap] ||
                                kindMap[context as keyof typeof kindMap] ||
                                (rawKind || 'unknown');
                            const normalizedSource =
                                sourceMap[context as keyof typeof sourceMap] ||
                                (normalizedKind === 'component-spec'
                                    ? 'component-spec'
                                    : normalizedKind === 'css-alias'
                                        ? 'css-alias'
                                        : 'unknown');
                            insertStmt.run(
                                entry.tokenPath,
                                normalizedKind,
                                normalizedSource,
                                occ.file || 'unknown',
                                occ.property || 'unknown'
                            );
                            usageLoaded++;
                        }
                    }
                }
            } else if (paths.tokenUsageIndex) {
                warnings.push(`Token usage index not found: ${paths.tokenUsageIndex}`);
            }

            // Load figma aliases
            if (paths.figmaAliasGraph && fs.existsSync(paths.figmaAliasGraph)) {
                const aliasContent = fs.readFileSync(paths.figmaAliasGraph, 'utf8');
                const aliasGraph = JSON.parse(aliasContent) as { aliases?: Array<{ fromPath?: string; toPath?: string; modes?: string[] }> };

                if (aliasGraph.aliases) {
                    const insertStmt = this.db.prepare(`
                        INSERT OR IGNORE INTO figma_aliases (from_path, to_path, modes)
                        VALUES (?, ?, ?)
                    `);

                    for (const alias of aliasGraph.aliases) {
                        if (!alias.fromPath || !alias.toPath) continue;

                        insertStmt.run(
                            alias.fromPath,
                            alias.toPath,
                            JSON.stringify(alias.modes || [])
                        );
                        aliasesLoaded++;
                    }
                }
            } else if (paths.figmaAliasGraph) {
                warnings.push(`Figma alias graph not found: ${paths.figmaAliasGraph}`);
            }

            // Store rebuild metadata
            const metaStmt = this.db.prepare(`
                INSERT OR REPLACE INTO db_meta (key, value)
                VALUES ('last_rebuild', ?)
            `);
            metaStmt.run(JSON.stringify({
                timestamp: Date.now(),
                tokensLoaded,
                usageLoaded,
                aliasesLoaded,
                warnings,
            }));
        });

        try {
            tx();
        } catch (error) {
            // Re-throw error to signal failure to caller
            throw new Error(`Rebuild failed: ${error instanceof Error ? error.message : String(error)}`);
        }

        return { tokensLoaded, usageLoaded, aliasesLoaded, warnings };
    }

    /**
     * Get last rebuild metadata
     */
    getLastRebuildMetadata(): { timestamp?: number; tokensLoaded?: number; warnings?: string[] } | null {
        const stmt = this.db.prepare(`SELECT value FROM db_meta WHERE key = 'last_rebuild'`);
        const row = stmt.get() as { value: string } | undefined;

        if (!row) return null;

        try {
            return JSON.parse(row.value);
        } catch {
            return null;
        }
    }
}
