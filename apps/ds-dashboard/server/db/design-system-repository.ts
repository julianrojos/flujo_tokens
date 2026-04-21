/**
 * Design System Repository
 *
 * PostgreSQL-backed repository for design_systems and app_settings tables.
 * Replaces JSON-based system-repository.ts for multi-tenant support.
 */

import type { Sql } from 'postgres';
import * as path from 'node:path';

export interface DesignSystemRow {
  id: string;
  name: string;
  app_name: string | null;
  figma_file_id: string | null;
  figma_api_token: string | null;
  collections: unknown;
  compile_variables_on_capture: boolean;
  detected_components_count: number | null;
  imported_components_count: number | null;
  pending_components_count: number | null;
  imported_component_names: unknown;
  pending_component_names: unknown;
  created_at: Date;
  updated_at: Date;
}

export interface DesignSystemEntry {
  id: string;
  name: string;
  appName?: string;
  figmaFileId?: string;
  figmaApiToken?: string;
  collections?: string[];
  compileVariablesOnCapture?: boolean;
  detectedComponentsCount?: number;
  importedComponentsCount?: number;
  pendingComponentsCount?: number;
  importedComponentNames?: string[];
  pendingComponentNames?: string[];
}

export interface SystemPaths {
  inputDir: string;
  outputDir: string;
  docsDir: string;
  generatedDir: string;
  specsDir: string;
  componentsDir: string;
}

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
  specBackupsDirPath: string;
  wcagPairs: Record<string, unknown>;
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

export function resolveSystemPaths(
  dsId: string,
  repoRoot: string,
): SystemPaths {
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

function rowToEntry(row: DesignSystemRow): DesignSystemEntry {
  const collections = normalizeCollections(row.collections);
  const importedComponentNames = normalizeNameList(row.imported_component_names);
  const pendingComponentNames = normalizeNameList(row.pending_component_names);
  return {
    id: row.id,
    name: row.name,
    appName: row.app_name ?? undefined,
    figmaFileId: row.figma_file_id ?? undefined,
    figmaApiToken: row.figma_api_token ?? undefined,
    collections,
    compileVariablesOnCapture: row.compile_variables_on_capture,
    detectedComponentsCount: typeof row.detected_components_count === 'number' ? row.detected_components_count : undefined,
    importedComponentsCount: typeof row.imported_components_count === 'number' ? row.imported_components_count : undefined,
    pendingComponentsCount: typeof row.pending_components_count === 'number' ? row.pending_components_count : undefined,
    importedComponentNames,
    pendingComponentNames,
  };
}

function normalizeCollections(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  const raw = String(value).trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || '').trim()).filter(Boolean);
    }
  } catch {
    // Fall through to CSV-style parsing.
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function serializeCollections(value: string[] | undefined): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const normalized = value.map((item) => String(item || '').trim()).filter(Boolean);
  if (normalized.length === 0) return null;
  return JSON.stringify(normalized);
}

function normalizeNameList(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    return normalized.length > 0 ? normalized : undefined;
  }
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    const normalized = parsed
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    return normalized.length > 0 ? normalized : undefined;
  } catch {
    return undefined;
  }
}

function serializeNameList(value: string[] | undefined): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const normalized = value
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
  if (normalized.length === 0) return null;
  return JSON.stringify(normalized);
}

export class DesignSystemRepository {
  constructor(
    private sql: Sql,
    private repoRoot: string = process.cwd(),
  ) {}

  private async getJsonAppSetting<T extends Record<string, unknown>>(
    key: string,
    fallback: T,
  ): Promise<T> {
    const rows = (await this.sql`
            SELECT value FROM app_settings
            WHERE key = ${key}
        `) as Array<{ value: string }>;
    const raw = rows.length > 0 ? String(rows[0].value || '').trim() : '';
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

  async getAll(): Promise<DesignSystemEntry[]> {
    const rows = (await this.sql`
            SELECT id, name, app_name, figma_file_id, figma_api_token, collections, compile_variables_on_capture,
                   detected_components_count, imported_components_count, pending_components_count,
                   imported_component_names, pending_component_names, created_at, updated_at
            FROM design_systems
            ORDER BY name
        `) as Array<DesignSystemRow>;
    return rows.map(rowToEntry);
  }

  async getById(id: string): Promise<DesignSystemEntry | null> {
    const rows = (await this.sql`
            SELECT id, name, app_name, figma_file_id, figma_api_token, collections, compile_variables_on_capture,
                   detected_components_count, imported_components_count, pending_components_count,
                   imported_component_names, pending_component_names, created_at, updated_at
            FROM design_systems
            WHERE id = ${id}
        `) as Array<DesignSystemRow>;
    if (rows.length === 0) return null;
    return rowToEntry(rows[0]);
  }

  async create(entry: DesignSystemEntry): Promise<DesignSystemEntry> {
    const now = new Date();
    const collections = serializeCollections(entry.collections);
    const importedComponentNames = serializeNameList(entry.importedComponentNames);
    const pendingComponentNames = serializeNameList(entry.pendingComponentNames);
    await this.sql`
            INSERT INTO design_systems (
              id, name, app_name, figma_file_id, figma_api_token, collections, compile_variables_on_capture,
              detected_components_count, imported_components_count, pending_components_count,
              imported_component_names, pending_component_names, created_at, updated_at
            )
            VALUES (
              ${entry.id}, ${entry.name}, ${entry.appName ?? null}, ${entry.figmaFileId ?? null}, ${entry.figmaApiToken ?? null},
              ${collections}, ${entry.compileVariablesOnCapture !== false},
              ${entry.detectedComponentsCount ?? null}, ${entry.importedComponentsCount ?? null}, ${entry.pendingComponentsCount ?? null},
              ${importedComponentNames}, ${pendingComponentNames}, ${now}, ${now}
            )
        `;
    return { ...entry };
  }

  async update(
    id: string,
    patch: Partial<DesignSystemEntry>,
  ): Promise<DesignSystemEntry | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const updated: DesignSystemEntry = {
      ...existing,
      ...patch,
      id,
    };

    const now = new Date();
    const collections = serializeCollections(updated.collections);
    const importedComponentNames = serializeNameList(updated.importedComponentNames);
    const pendingComponentNames = serializeNameList(updated.pendingComponentNames);
    await this.sql`
            UPDATE design_systems
            SET name = ${updated.name},
                app_name = ${updated.appName ?? null},
                figma_file_id = ${updated.figmaFileId ?? null},
                figma_api_token = ${updated.figmaApiToken ?? null},
                collections = ${collections},
                compile_variables_on_capture = ${updated.compileVariablesOnCapture !== false},
                detected_components_count = ${updated.detectedComponentsCount ?? null},
                imported_components_count = ${updated.importedComponentsCount ?? null},
                pending_components_count = ${updated.pendingComponentsCount ?? null},
                imported_component_names = ${importedComponentNames},
                pending_component_names = ${pendingComponentNames},
                updated_at = ${now}
            WHERE id = ${id}
        `;

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    let deletedCount = 0;
    await this.sql.begin(async (tx) => {
      // Legacy tokens table was created before design_systems existed and may
      // not have an FK in older migrated schemas.
      await tx`DELETE FROM tokens WHERE ds_id = ${id}`;
      await tx`DELETE FROM document_chunks WHERE ds_id = ${id}`;
      const result = await tx`
              DELETE FROM design_systems
              WHERE id = ${id}
          `;
      deletedCount = result.count ?? 0;
    });
    return deletedCount > 0;
  }

  async getDefaultSystemId(): Promise<string | null> {
    const rows = (await this.sql`
            SELECT value FROM app_settings
            WHERE key = 'default_system_id'
        `) as Array<{ value: string }>;
    if (rows.length === 0) return null;
    return rows[0].value;
  }

  async setDefaultSystemId(id: string | null): Promise<void> {
    const now = new Date();
    if (id === null) {
      await this.sql`
                DELETE FROM app_settings
                WHERE key = 'default_system_id'
            `;
    } else {
      await this.sql`
                INSERT INTO app_settings (key, value, updated_at)
                VALUES ('default_system_id', ${id}, ${now})
                ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
            `;
    }
  }

  async getConfig(): Promise<DesignSystemsConfig> {
    const systems = await this.getAll();
    const defaultSystem =
      (await this.getDefaultSystemId()) ||
      (systems.length > 0 ? systems[0].id : '');
    return {
      systems,
      defaultSystem,
    };
  }

  async resolveSystemContext(
    systemId: string | undefined,
  ): Promise<ScriptSystemContext> {
    const systems = await this.getAll();
    const configuredDefault = (await this.getDefaultSystemId()) || '';
    const requested = String(systemId || '').trim() || configuredDefault;
    const target =
      systems.find((row) => row.id === requested) || systems[0] || null;
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

  async resolveDashboardSystemContext(
    systemHeader: string | undefined,
  ): Promise<DashboardSystemContext> {
    const systems = await this.getAll();
    const requested = String(systemHeader || '').trim();
    const configuredDefault = (await this.getDefaultSystemId()) || '';
    const targetId = requested || configuredDefault;
    const target =
      systems.find((row) => row.id === targetId) || systems[0] || null;
    if (!target) {
      throw new Error('No systems configured. Create one first.');
    }
    if (targetId && target.id !== targetId) {
      console.warn(
        `[DesignSystemRepository] Requested system "${targetId}" not found; using "${target.id}" instead.`,
      );
    }
    const paths = resolveSystemPaths(target.id, this.repoRoot);
    return {
      systemId: target.id,
      figmaFileId: target.figmaFileId,
      repoRoot: this.repoRoot,
      docsDir: paths.docsDir,
      genDir: paths.generatedDir,
      specBackupsDirPath: path.join(paths.generatedDir, 'spec-backups'),
      wcagPairs: await this.getJsonAppSetting('wcag_pairs', { pairs: [] }),
      figmaApiToken: target.figmaApiToken,
    };
  }

  dispose(): void {
    // No-op for DB-backed repository; kept to support server lifecycle hooks.
  }
}
