/**
 * Design System Repository
 *
 * DB-backed repository for design_systems and app_settings tables.
 * Replaces JSON-based system-repository.ts for multi-tenant support.
 */

import Database from 'better-sqlite3';
import * as path from 'node:path';

/**
 * Design system row as stored in DB
 */
export interface DesignSystemRow {
    id: string;
    name: string;
    app_name: string | null;
    figma_file_id: string | null;
    figma_api_token: string | null;
    collections: string | null;           // JSON array
    compile_variables_on_capture: number; // 0 or 1
    created_at: number;
    updated_at: number;
}

/**
 * Design system entry for public API (without internal fields)
 */
export interface DesignSystemEntry {
    id: string;
    name: string;
    appName?: string;
    figmaFileId?: string;
    figmaApiToken?: string;
    collections?: string[];
    compileVariablesOnCapture?: boolean;
}

/**
 * System paths derived from ds_id by convention
 */
export interface SystemPaths {
    inputDir: string;
    outputDir: string;
    docsDir: string;
    generatedDir: string;
    specsDir: string;
    componentsDir: string;
}

/**
 * Design system configuration for backward compatibility
 */
export interface DesignSystemsConfig {
    systems: DesignSystemEntry[];
    defaultSystem: string;
}

export interface DashboardSystemContext {
    systemId: string;
    figmaFileId?: string;
    repoRoot: string;
    docsDir: string;
    genDir: string;
    namingDebtConfig: Record<string, unknown>;
    specBackupsDirPath: string;
    wcagPairs: Record<string, unknown>;
    healthSnapshotScriptPath: string;
    figmaApiToken?: string;
}

export interface ScriptSystemContext extends DesignSystemEntry {
    paths: {
        input: string;
        output: string;
        generated: string;
        specs: string;
        docs: string;
    };
}

const SYSTEM_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,63})$/;

export function isValidSystemId(dsId: string): boolean {
    const normalized = String(dsId || '').trim();
    if (!normalized) return false;
    if (!SYSTEM_ID_PATTERN.test(normalized)) return false;
    if (normalized.includes('..')) return false;
    if (normalized.includes('/') || normalized.includes('\\')) return false;
    return true;
}

/**
 * Pure function to derive system paths from ds_id
 * No DB access - testable in isolation
 */
export function resolveSystemPaths(dsId: string, repoRoot: string): SystemPaths {
    if (!isValidSystemId(dsId)) {
        throw new Error(`Invalid system ID: ${dsId}`);
    }
    const docsDir = path.join(repoRoot, 'design-systems', dsId, 'docs');
    return {
        inputDir: path.join(repoRoot, 'design-systems', dsId, 'input'),
        outputDir: path.join(repoRoot, 'design-systems', dsId, 'output'),
        docsDir,
        generatedDir: path.join(docsDir, '_generated'),
        specsDir: path.join(docsDir, '_spec', 'components'),
        componentsDir: path.join(docsDir, 'components'),
    };
}

/**
 * Parse collections JSON safely
 */
function parseCollections(collectionsJson: string | null): string[] {
    if (!collectionsJson) return [];
    try {
        const parsed = JSON.parse(collectionsJson);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((c) => typeof c === 'string');
    } catch {
        return [];
    }
}

/**
 * Serialize collections to JSON
 */
function serializeCollections(collections: string[] | undefined): string | null {
    if (!collections || collections.length === 0) return null;
    return JSON.stringify(collections);
}

/**
 * Convert DB row to public entry
 */
function rowToEntry(row: DesignSystemRow): DesignSystemEntry {
    return {
        id: row.id,
        name: row.name,
        appName: row.app_name ?? undefined,
        figmaFileId: row.figma_file_id ?? undefined,
        figmaApiToken: row.figma_api_token ?? undefined,
        collections: parseCollections(row.collections),
        compileVariablesOnCapture: row.compile_variables_on_capture === 1,
    };
}

/**
 * Design System Repository for SQLite-backed storage
 */
export class DesignSystemRepository {
    private db: Database.Database;
    private repoRoot: string;

    constructor(db: Database.Database, options: { repoRoot?: string } = {}) {
        this.db = db;
        this.repoRoot = options.repoRoot || process.cwd();
    }

    private getJsonAppSetting<T extends Record<string, unknown>>(key: string, fallback: T): T {
        const row = this.db.prepare(`
            SELECT value FROM app_settings
            WHERE key = ?
        `).get(key) as { value?: string } | undefined;
        const raw = String(row?.value || '').trim();
        if (!raw) return fallback;
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return fallback;
            }
            return parsed as T;
        } catch {
            return fallback;
        }
    }

    /**
     * Get all design systems
     */
    getAll(): DesignSystemEntry[] {
        const stmt = this.db.prepare(`
            SELECT id, name, app_name, figma_file_id, figma_api_token, collections, compile_variables_on_capture, created_at, updated_at
            FROM design_systems
            ORDER BY name
        `);
        const rows = stmt.all() as DesignSystemRow[];
        return rows.map(rowToEntry);
    }

    /**
     * Get design system by ID
     */
    getById(id: string): DesignSystemEntry | null {
        const stmt = this.db.prepare(`
            SELECT id, name, app_name, figma_file_id, figma_api_token, collections, compile_variables_on_capture, created_at, updated_at
            FROM design_systems
            WHERE id = ?
        `);
        const row = stmt.get(id) as DesignSystemRow | undefined;
        if (!row) return null;
        return rowToEntry(row);
    }

    /**
     * Create a new design system
     */
    create(entry: DesignSystemEntry): DesignSystemEntry {
        const now = Math.floor(Date.now() / 1000);
        const stmt = this.db.prepare(`
            INSERT INTO design_systems (id, name, app_name, figma_file_id, figma_api_token, collections, compile_variables_on_capture, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            entry.id,
            entry.name,
            entry.appName ?? null,
            entry.figmaFileId ?? null,
            entry.figmaApiToken ?? null,
            serializeCollections(entry.collections),
            entry.compileVariablesOnCapture !== false ? 1 : 0,
            now,
            now
        );

        return { ...entry };
    }

    /**
     * Update an existing design system
     */
    update(id: string, patch: Partial<DesignSystemEntry>): DesignSystemEntry | null {
        const existing = this.getById(id);
        if (!existing) return null;

        const updated: DesignSystemEntry = {
            ...existing,
            ...patch,
            id, // Cannot change ID
        };

        const now = Math.floor(Date.now() / 1000);
        const stmt = this.db.prepare(`
            UPDATE design_systems
            SET name = ?, app_name = ?, figma_file_id = ?, figma_api_token = ?, collections = ?, compile_variables_on_capture = ?, updated_at = ?
            WHERE id = ?
        `);

        stmt.run(
            updated.name,
            updated.appName ?? null,
            updated.figmaFileId ?? null,
            updated.figmaApiToken ?? null,
            serializeCollections(updated.collections),
            updated.compileVariablesOnCapture !== false ? 1 : 0,
            now,
            id
        );

        return updated;
    }

    /**
     * Delete a design system (CASCADE cleans up related data)
     */
    delete(id: string): boolean {
        const stmt = this.db.prepare(`
            DELETE FROM design_systems
            WHERE id = ?
        `);
        const result = stmt.run(id);
        return result.changes > 0;
    }

    /**
     * Get default system ID from app_settings
     */
    getDefaultSystemId(): string | null {
        const stmt = this.db.prepare(`
            SELECT value FROM app_settings
            WHERE key = 'default_system_id'
        `);
        const row = stmt.get() as { value: string } | undefined;
        if (!row) return null;
        return row.value;
    }

    /**
     * Set default system ID in app_settings
     */
    setDefaultSystemId(id: string | null): void {
        const now = Math.floor(Date.now() / 1000);
        if (id === null) {
            const stmt = this.db.prepare(`
                DELETE FROM app_settings
                WHERE key = 'default_system_id'
            `);
            stmt.run();
        } else {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO app_settings (key, value, updated_at)
                VALUES (?, ?, ?)
            `);
            stmt.run('default_system_id', id, now);
        }
    }

    getConfig(): DesignSystemsConfig {
        const systems = this.getAll();
        const defaultSystem = this.getDefaultSystemId() || (systems.length > 0 ? systems[0].id : '');
        return {
            systems,
            defaultSystem,
        };
    }

    resolveSystemContext(systemId: string | undefined): ScriptSystemContext {
        const systems = this.getAll();
        const configuredDefault = this.getDefaultSystemId() || '';
        const requested = String(systemId || '').trim() || configuredDefault;
        const target = systems.find((row) => row.id === requested) || systems[0] || null;
        if (!target) {
            throw new Error('No systems configured. Create one first.');
        }
        const paths = resolveSystemPaths(target.id, this.repoRoot);
        return {
            ...target,
            paths: {
                input: paths.inputDir,
                output: paths.outputDir,
                generated: paths.generatedDir,
                specs: paths.specsDir,
                docs: paths.componentsDir,
            },
        };
    }

    resolveDashboardSystemContext(systemHeader: string | undefined): DashboardSystemContext {
        const systems = this.getAll();
        const requested = String(systemHeader || '').trim();
        const configuredDefault = this.getDefaultSystemId() || '';
        const targetId = requested || configuredDefault;
        const target = systems.find((row) => row.id === targetId) || systems[0] || null;
        if (!target) {
            throw new Error('No systems configured. Create one first.');
        }
        if (targetId && target.id !== targetId) {
            console.warn(
                `[DesignSystemRepository] Requested system "${targetId}" not found; using "${target.id}" instead.`
            );
        }
        const paths = resolveSystemPaths(target.id, this.repoRoot);
        return {
            systemId: target.id,
            figmaFileId: target.figmaFileId,
            repoRoot: this.repoRoot,
            docsDir: paths.docsDir,
            genDir: paths.generatedDir,
            namingDebtConfig: this.getJsonAppSetting('naming_debt_config', {}),
            specBackupsDirPath: path.join(paths.generatedDir, 'spec-backups'),
            wcagPairs: this.getJsonAppSetting('wcag_pairs', { pairs: [] }),
            healthSnapshotScriptPath: path.join(this.repoRoot, 'tooling', 'scripts', 'ds-health-snapshot.mjs'),
            figmaApiToken: target.figmaApiToken,
        };
    }

    dispose(): void {
        // No-op for DB-backed repository; kept to support server lifecycle hooks.
    }
}
