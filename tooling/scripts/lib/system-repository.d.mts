/**
 * Type declarations for system-repository.mjs
 * Backed by SQLite via apps/ds-dashboard/server/db/design-system-repository.ts
 */

export interface DesignSystemConfigEntry {
  id: string;
  name: string;
  appName?: string;
  figmaFileId?: string;
  figmaApiToken?: string;
  collections?: string[];
  [key: string]: unknown;
}

export interface DesignSystemsConfig {
  systems: DesignSystemConfigEntry[];
  defaultSystem: string;
  [key: string]: unknown;
}

export interface ScriptSystemContext extends DesignSystemConfigEntry {
  paths: {
    input: string;
    output: string;
    generated: string;
    specs: string;
    docs: string;
    registry: string;
  };
}

export interface DesignSystemRepository {
  getAll(): DesignSystemConfigEntry[];
  getById(id: string): DesignSystemConfigEntry | null;
  create(entry: DesignSystemConfigEntry): DesignSystemConfigEntry;
  update(id: string, patch: Partial<DesignSystemConfigEntry>): DesignSystemConfigEntry | null;
  delete(id: string): boolean;
  getDefaultSystemId(): string | null;
  setDefaultSystemId(id: string | null): void;
  getConfig(): DesignSystemsConfig;
  resolveSystemContext(systemId: string | undefined): ScriptSystemContext;
  dispose(): void;
}

export interface DesignSystemRepositoryOptions {
  repoRoot: string;
}

export function createDesignSystemRepository(options: DesignSystemRepositoryOptions): DesignSystemRepository;
