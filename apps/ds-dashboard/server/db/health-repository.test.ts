/**
 * Health Repository Tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';

import { HealthRepository } from './health-repository.js';

/**
 * Create in-memory test database with required schema
 */
function createTestDb(): Database.Database {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    // Create minimal schema needed for tests
    db.exec(`
        CREATE TABLE health_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ds_id TEXT NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('tokens', 'components')),
            snapshot_json TEXT NOT NULL,
            recorded_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
            UNIQUE(ds_id, kind)
        );

        CREATE TABLE health_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ds_id TEXT NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('tokens', 'components')),
            entry_json TEXT NOT NULL,
            recorded_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );
    `);

    return db;
}

describe('HealthRepository', () => {
    let db: Database.Database;
    let repo: HealthRepository;

    before(() => {
        db = createTestDb();
        repo = new HealthRepository(db);
    });

    after(() => {
        if (db) db.close();
    });

    describe('upsertSnapshot', () => {
        it('inserts new health snapshot', () => {
            const snapshot = {
                ok: true,
                summary: {
                    tokens_total: 100,
                    tokens_with_usage: 80,
                },
            };

            const changes = repo.upsertSnapshot('test-sys', 'tokens', snapshot);
            assert.strictEqual(changes, 1);

            const stored = repo.getSnapshot('test-sys', 'tokens');
            assert.ok(stored);
            assert.deepStrictEqual(stored.snapshotJson, snapshot);
            assert.strictEqual(stored.kind, 'tokens');
        });

        it('replaces existing snapshot on conflict', () => {
            const updatedSnapshot = {
                ok: true,
                summary: {
                    tokens_total: 150,
                    tokens_with_usage: 120,
                },
                warnings: ['Some warning'],
            };

            const changes = repo.upsertSnapshot('test-sys', 'tokens', updatedSnapshot);
            assert.ok(changes >= 1);

            const stored = repo.getSnapshot('test-sys', 'tokens');
            assert.ok(stored);
            assert.deepStrictEqual(stored.snapshotJson, updatedSnapshot);
        });

        it('handles different kinds independently', () => {
            const componentsSnapshot = {
                ok: true,
                summary: {
                    components_total: 25,
                },
            };

            repo.upsertSnapshot('test-sys', 'components', componentsSnapshot);

            const tokensSnapshot = repo.getSnapshot('test-sys', 'tokens');
            const componentsSnapshotStored = repo.getSnapshot('test-sys', 'components');

            assert.ok(tokensSnapshot);
            assert.ok(componentsSnapshotStored);
            assert.strictEqual(tokensSnapshot.kind, 'tokens');
            assert.strictEqual(componentsSnapshotStored.kind, 'components');
        });
    });

    describe('getSnapshot', () => {
        it('returns null for non-existent snapshot', () => {
            const snapshot = repo.getSnapshot('non-existent-sys', 'tokens');
            assert.strictEqual(snapshot, null);
        });
    });

    describe('appendHistory', () => {
        it('appends entry to health history', () => {
            const entry = {
                timestamp: Date.now(),
                event: 'health_check',
                status: 'ok',
            };

            const changes = repo.appendHistory('test-sys', 'tokens', entry);
            assert.strictEqual(changes, 1);
        });

        it('appends multiple entries', () => {
            const entry1 = { event: 'event1', ts: 1 };
            const entry2 = { event: 'event2', ts: 2 };
            const entry3 = { event: 'event3', ts: 3 };

            repo.appendHistory('test-sys', 'tokens', entry1);
            repo.appendHistory('test-sys', 'tokens', entry2);
            repo.appendHistory('test-sys', 'tokens', entry3);

            const history = repo.getHistory('test-sys', 'tokens', 10);
            assert.ok(history.length >= 3);
        });
    });

    describe('getHistory', () => {
        it('returns empty array when no history exists', () => {
            const history = repo.getHistory('non-existent-sys', 'tokens');
            assert.deepStrictEqual(history, []);
        });

        it('filters by kind', () => {
            repo.appendHistory('kind-test-sys', 'tokens', { event: 'token-event' });
            repo.appendHistory('kind-test-sys', 'components', { event: 'component-event' });

            const tokensHistory = repo.getHistory('kind-test-sys', 'tokens', 10);
            const componentsHistory = repo.getHistory('kind-test-sys', 'components', 10);

            assert.ok(tokensHistory.length >= 1);
            assert.ok(componentsHistory.length >= 1);

            // Verify all entries have correct kind
            tokensHistory.forEach((h) => assert.strictEqual(h.kind, 'tokens'));
            componentsHistory.forEach((h) => assert.strictEqual(h.kind, 'components'));
        });

        it('respects limit parameter', () => {
            const limitedHistory = repo.getHistory('test-sys', 'tokens', 2);
            assert.ok(limitedHistory.length <= 2);
        });
    });

    describe('deleteAll', () => {
        it('deletes all health data for a design system', () => {
            const uniqueSysId = 'delete-health-sys-' + Date.now();
            repo.upsertSnapshot(uniqueSysId, 'tokens', { ok: true });
            repo.appendHistory(uniqueSysId, 'tokens', { event: 'test' });

            repo.deleteAll(uniqueSysId);

            const snapshot = repo.getSnapshot(uniqueSysId, 'tokens');
            const history = repo.getHistory(uniqueSysId, 'tokens');

            assert.strictEqual(snapshot, null);
            assert.deepStrictEqual(history, []);
        });
    });
});
