/**
 * Health Repository
 *
 * DB-backed repository for health_snapshots and health_history.
 */

import Database from 'better-sqlite3';

/**
 * Health snapshot entry
 */
export interface HealthSnapshotEntry {
    id: number;
    dsId: string;
    kind: 'tokens' | 'components';
    snapshotJson: Record<string, unknown>;
    recordedAt: number;
}

/**
 * Health history entry
 */
export interface HealthHistoryEntry {
    id: number;
    dsId: string;
    kind: 'tokens' | 'components';
    entryJson: Record<string, unknown>;
    recordedAt: number;
}

/**
 * Health Repository for SQLite-backed storage
 */
export class HealthRepository {
    private db: Database.Database;

    constructor(db: Database.Database) {
        this.db = db;
    }

    /**
     * Get health snapshot for a design system and kind
     */
    getSnapshot(dsId: string, kind: 'tokens' | 'components'): HealthSnapshotEntry | null {
        const stmt = this.db.prepare(`
            SELECT id, ds_id, kind, snapshot_json, recorded_at
            FROM health_snapshots
            WHERE ds_id = ? AND kind = ?
        `);
        const row = stmt.get(dsId, kind) as {
            id: number;
            ds_id: string;
            kind: string;
            snapshot_json: string;
            recorded_at: number;
        } | undefined;

        if (!row) return null;

        return {
            id: row.id,
            dsId: row.ds_id,
            kind: row.kind as 'tokens' | 'components',
            snapshotJson: JSON.parse(row.snapshot_json),
            recordedAt: row.recorded_at,
        };
    }

    /**
     * Upsert health snapshot (replace on conflict)
     */
    upsertSnapshot(dsId: string, kind: 'tokens' | 'components', snapshotJson: Record<string, unknown>): number {
        const now = Math.floor(Date.now() / 1000);
        const stmt = this.db.prepare(`
            INSERT INTO health_snapshots (ds_id, kind, snapshot_json, recorded_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(ds_id, kind) DO UPDATE SET
                snapshot_json = excluded.snapshot_json,
                recorded_at = excluded.recorded_at
        `);

        const result = stmt.run(dsId, kind, JSON.stringify(snapshotJson), now);
        return result.changes;
    }

    /**
     * Get health history for a design system
     */
    getHistory(dsId: string, kind?: 'tokens' | 'components', limit = 50): HealthHistoryEntry[] {
        let sql = `
            SELECT id, ds_id, kind, entry_json, recorded_at
            FROM health_history
            WHERE ds_id = ?
        `;
        const params: (string | number)[] = [dsId];

        if (kind) {
            sql += ' AND kind = ?';
            params.push(kind);
        }

        sql += ' ORDER BY recorded_at DESC LIMIT ?';
        params.push(limit);

        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params) as Array<{
            id: number;
            ds_id: string;
            kind: string;
            entry_json: string;
            recorded_at: number;
        }>;

        return rows.map((row) => ({
            id: row.id,
            dsId: row.ds_id,
            kind: row.kind as 'tokens' | 'components',
            entryJson: JSON.parse(row.entry_json),
            recordedAt: row.recorded_at,
        }));
    }

    /**
     * Append entry to health history
     */
    appendHistory(dsId: string, kind: 'tokens' | 'components', entryJson: Record<string, unknown>): number {
        const now = Math.floor(Date.now() / 1000);
        const stmt = this.db.prepare(`
            INSERT INTO health_history (ds_id, kind, entry_json, recorded_at)
            VALUES (?, ?, ?, ?)
        `);

        const result = stmt.run(dsId, kind, JSON.stringify(entryJson), now);
        return result.changes;
    }

    /**
     * Delete all health data for a design system
     */
    deleteAll(dsId: string): void {
        const snapshotStmt = this.db.prepare('DELETE FROM health_snapshots WHERE ds_id = ?');
        const historyStmt = this.db.prepare('DELETE FROM health_history WHERE ds_id = ?');
        snapshotStmt.run(dsId);
        historyStmt.run(dsId);
    }
}
