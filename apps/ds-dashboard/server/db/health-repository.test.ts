/**
 * Health Repository Tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import type { Sql } from 'postgres';

import { HealthRepository } from './health-repository.js';
import { createTestDatabase } from './test-db-helpers.js';

describe('HealthRepository', () => {
    let sql: Sql;
    let cleanup: () => Promise<void>;
    let repo: HealthRepository;

    before(async () => {
        ({ sql, cleanup } = await createTestDatabase());
        repo = new HealthRepository(sql);
        await sql`INSERT INTO design_systems (id, name) VALUES ('test-sys', 'Test System') ON CONFLICT (id) DO NOTHING`;
        await sql`INSERT INTO design_systems (id, name) VALUES ('kind-test-sys', 'Kind Test System') ON CONFLICT (id) DO NOTHING`;
    });

    after(async () => {
        await cleanup();
    });

    describe('upsertSnapshot', () => {
        it('inserts new health snapshot', async () => {
            const snapshot = {
                ok: true,
                summary: {
                    tokens_total: 100,
                    tokens_with_usage: 80,
                },
            };

            const changes = await repo.upsertSnapshot('test-sys', 'tokens', snapshot);
            assert.strictEqual(changes, 1);

            const stored = await repo.getSnapshot('test-sys', 'tokens');
            assert.ok(stored);
            assert.deepStrictEqual(stored.snapshotJson, snapshot);
            assert.strictEqual(stored.kind, 'tokens');
        });

        it('replaces existing snapshot on conflict', async () => {
            const updatedSnapshot = {
                ok: true,
                summary: {
                    tokens_total: 150,
                    tokens_with_usage: 120,
                },
                warnings: ['Some warning'],
            };

            const changes = await repo.upsertSnapshot('test-sys', 'tokens', updatedSnapshot);
            assert.ok(changes >= 1);

            const stored = await repo.getSnapshot('test-sys', 'tokens');
            assert.ok(stored);
            assert.deepStrictEqual(stored.snapshotJson, updatedSnapshot);
        });

        it('handles different kinds independently', async () => {
            const componentsSnapshot = {
                ok: true,
                summary: {
                    components_total: 25,
                },
            };

            await repo.upsertSnapshot('test-sys', 'components', componentsSnapshot);

            const tokensSnapshot = await repo.getSnapshot('test-sys', 'tokens');
            const componentsSnapshotStored = await repo.getSnapshot('test-sys', 'components');

            assert.ok(tokensSnapshot);
            assert.ok(componentsSnapshotStored);
            assert.strictEqual(tokensSnapshot.kind, 'tokens');
            assert.strictEqual(componentsSnapshotStored.kind, 'components');
        });
    });

    describe('getSnapshot', () => {
        it('returns null for non-existent snapshot', async () => {
            const snapshot = await repo.getSnapshot('non-existent-sys', 'tokens');
            assert.strictEqual(snapshot, null);
        });
    });

    describe('appendHistory', () => {
        it('appends entry to health history', async () => {
            const entry = {
                timestamp: Date.now(),
                event: 'health_check',
                status: 'ok',
            };

            const changes = await repo.appendHistory('test-sys', 'tokens', entry);
            assert.strictEqual(changes, 1);
        });

        it('appends multiple entries', async () => {
            const entry1 = { event: 'event1', ts: 1 };
            const entry2 = { event: 'event2', ts: 2 };
            const entry3 = { event: 'event3', ts: 3 };

            await repo.appendHistory('test-sys', 'tokens', entry1);
            await repo.appendHistory('test-sys', 'tokens', entry2);
            await repo.appendHistory('test-sys', 'tokens', entry3);

            const history = await repo.getHistory('test-sys', 'tokens', 10);
            assert.ok(history.length >= 3);
        });
    });

    describe('getHistory', () => {
        it('returns empty array when no history exists', async () => {
            const history = await repo.getHistory('non-existent-sys', 'tokens');
            assert.deepStrictEqual(history, []);
        });

        it('filters by kind', async () => {
            await repo.appendHistory('kind-test-sys', 'tokens', { event: 'token-event' });
            await repo.appendHistory('kind-test-sys', 'components', { event: 'component-event' });

            const tokensHistory = await repo.getHistory('kind-test-sys', 'tokens', 10);
            const componentsHistory = await repo.getHistory('kind-test-sys', 'components', 10);

            assert.ok(tokensHistory.length >= 1);
            assert.ok(componentsHistory.length >= 1);

            // Verify all entries have correct kind
            tokensHistory.forEach((h) => assert.strictEqual(h.kind, 'tokens'));
            componentsHistory.forEach((h) => assert.strictEqual(h.kind, 'components'));
        });

        it('respects limit parameter', async () => {
            const limitedHistory = await repo.getHistory('test-sys', 'tokens', 2);
            assert.ok(limitedHistory.length <= 2);
        });
    });

    describe('deleteAll', () => {
        it('deletes all health data for a design system', async () => {
            const uniqueSysId = 'delete-health-sys-' + Date.now();
            await sql`INSERT INTO design_systems (id, name) VALUES (${uniqueSysId}, ${uniqueSysId})`;
            await repo.upsertSnapshot(uniqueSysId, 'tokens', { ok: true });
            await repo.appendHistory(uniqueSysId, 'tokens', { event: 'test' });

            await repo.deleteAll(uniqueSysId);

            const snapshot = await repo.getSnapshot(uniqueSysId, 'tokens');
            const history = await repo.getHistory(uniqueSysId, 'tokens');

            assert.strictEqual(snapshot, null);
            assert.deepStrictEqual(history, []);
        });
    });
});
