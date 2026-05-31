/**
 * Health Repository
 *
 * DB-backed repository for health_snapshots and health_history.
 */

import type { Sql } from 'postgres';

export interface HealthSnapshotEntry {
  id: number;
  dsId: string;
  kind: 'tokens' | 'components';
  snapshotJson: Record<string, unknown>;
  recordedAt: Date;
}

export interface HealthHistoryEntry {
  id: number;
  dsId: string;
  kind: 'tokens' | 'components';
  entryJson: Record<string, unknown>;
  recordedAt: Date;
}

export class HealthRepository {
  private sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  async getSnapshot(
    dsId: string,
    kind: 'tokens' | 'components',
  ): Promise<HealthSnapshotEntry | null> {
    const rows = (await this.sql`
            SELECT id, ds_id, kind, snapshot_json, recorded_at
            FROM health_snapshots
            WHERE ds_id = ${dsId} AND kind = ${kind}
        `) as Array<{
      id: number;
      ds_id: string;
      kind: string;
      snapshot_json: Record<string, unknown>;
      recorded_at: Date;
    }>;

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: row.id,
      dsId: row.ds_id,
      kind: row.kind as 'tokens' | 'components',
      snapshotJson: row.snapshot_json,
      recordedAt: row.recorded_at,
    };
  }

  async upsertSnapshot(
    dsId: string,
    kind: 'tokens' | 'components',
    snapshotJson: Record<string, unknown>,
  ): Promise<number> {
    const now = new Date();
    const result = await this.sql`
            INSERT INTO health_snapshots (ds_id, kind, snapshot_json, recorded_at)
            VALUES (${dsId}, ${kind}, ${snapshotJson}, ${now})
            ON CONFLICT(ds_id, kind) DO UPDATE SET
                snapshot_json = EXCLUDED.snapshot_json,
                recorded_at = EXCLUDED.recorded_at
        `;
    return result.count ?? 0;
  }

  async getHistory(
    dsId: string,
    kind?: 'tokens' | 'components',
    limit = 50,
  ): Promise<HealthHistoryEntry[]> {
    const rows = (await this.sql`
      SELECT id, ds_id, kind, entry_json, recorded_at
      FROM health_history
      WHERE ds_id = ${dsId}
      ${kind ? this.sql`AND kind = ${kind}` : this.sql``}
      ORDER BY recorded_at DESC
      LIMIT ${limit}
    `) as Array<{
      id: number;
      ds_id: string;
      kind: string;
      entry_json: Record<string, unknown>;
      recorded_at: Date;
    }>;

    return rows.map((row) => ({
      id: row.id,
      dsId: row.ds_id,
      kind: row.kind as 'tokens' | 'components',
      entryJson: row.entry_json,
      recordedAt: row.recorded_at,
    }));
  }

  async appendHistory(
    dsId: string,
    kind: 'tokens' | 'components',
    entryJson: Record<string, unknown>,
  ): Promise<number> {
    const now = new Date();
    const result = await this.sql`
            INSERT INTO health_history (ds_id, kind, entry_json, recorded_at)
            VALUES (${dsId}, ${kind}, ${entryJson}, ${now})
        `;
    return result.count ?? 0;
  }

  async deleteAll(dsId: string): Promise<void> {
    await this.sql`DELETE FROM health_snapshots WHERE ds_id = ${dsId}`;
    await this.sql`DELETE FROM health_history WHERE ds_id = ${dsId}`;
  }
}
