/**
 * AI Doc Status Service Tests (S-11: DB-first)
 *
 * Tests the DB-based staleness computation. No filesystem scanning.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
    computeDocStatusesDb,
    computeDocStatuses,
    computeDocStatusesFromSnapshots,
    computeDocStatusesDbFromSnapshots,
    type DocComponentStatus,
} from './ai-doc-status-service.js';
import type { ComponentRepository } from '../db/component-repository.js';

// Minimal mock that satisfies listDocStatusFromComponentDocs
function makeMockRepo(
    snapshots: Array<{
        id: number;
        slug: string;
        status: 'fresh' | 'stale' | 'missing';
        appliedAt: number | null;
    }>,
): ComponentRepository {
    return {
        listDocStatusFromComponentDocs: () => snapshots,
    } as unknown as ComponentRepository;
}

describe('computeDocStatusesDb', () => {
    it('returns empty components when no components exist', () => {
        const repo = makeMockRepo([]);
        const result = computeDocStatusesDb(repo);

        assert.equal(result.connected, true);
        assert.equal(result.sourceScope, 'docs_from_db');
        assert.equal(result.components.length, 0);
    });

    it('maps fresh status from component_docs (appliedAt >= syncedAt)', () => {
        const nowSec = Math.floor(Date.now() / 1000);
        const repo = makeMockRepo([
            {
                id: 1,
                slug: 'button',
                status: 'fresh',
                appliedAt: nowSec,
            },
        ]);
        const result = computeDocStatusesDb(repo);

        assert.equal(result.components.length, 1);
        assert.equal(result.components[0].componentId, '1');
        assert.equal(result.components[0].slug, 'button');
        assert.equal(result.components[0].status, 'fresh');
        assert.ok(result.components[0].generatedAt);
    });

    it('maps missing status when no component_docs row', () => {
        const repo = makeMockRepo([
            { id: 3, slug: 'modal', status: 'missing', appliedAt: null },
        ]);
        const result = computeDocStatusesDb(repo);

        assert.equal(result.components.length, 1);
        assert.equal(result.components[0].status, 'missing');
        assert.equal(result.components[0].generatedAt, undefined);
    });
});

describe('computeDocStatusesFromSnapshots', () => {
    it('returns correct result from snapshot fixtures', () => {
        const nowSec = Math.floor(Date.now() / 1000);
        const result = computeDocStatusesFromSnapshots([
            { id: 1, slug: 'button', status: 'fresh', appliedAt: nowSec },
            { id: 2, slug: 'card', status: 'stale', appliedAt: 1000 },
            { id: 3, slug: 'modal', status: 'missing', appliedAt: null },
        ]);

        assert.equal(result.connected, true);
        assert.equal(result.sourceScope, 'docs_from_db');
        assert.equal(result.components.length, 3);

        assert.equal(result.components[0].slug, 'button');
        assert.equal(result.components[0].status, 'fresh');
        assert.ok(result.components[0].generatedAt);

        assert.equal(result.components[1].status, 'stale');
        assert.equal(result.components[2].status, 'missing');
        assert.equal(result.components[2].generatedAt, undefined);
    });

    it('handles empty snapshots', () => {
        const result = computeDocStatusesFromSnapshots([]);
        assert.equal(result.components.length, 0);
    });
});

describe('computeDocStatusesDbFromSnapshots (deprecated alias)', () => {
    it('delegates to computeDocStatusesFromSnapshots', () => {
        const result = computeDocStatusesDbFromSnapshots([
            { id: 10, slug: 'alias-test', status: 'fresh', appliedAt: null },
        ]);
        assert.equal(result.components.length, 1);
        assert.equal(result.components[0].slug, 'alias-test');
    });
});

describe('computeDocStatuses (deprecated signature)', () => {
    it('returns empty components when no DB is provided', async () => {
        const result = await computeDocStatuses('/some/path');

        assert.equal(result.connected, false);
        assert.equal(result.components.length, 0);
    });

    it('delegates to DB path when db+componentRepo provided', async () => {
        const nowSec = Math.floor(Date.now() / 1000);
        const repo = makeMockRepo([
            { id: 42, slug: 'delegated', status: 'fresh', appliedAt: nowSec },
        ]);
        const result = await computeDocStatuses('/ignored', undefined, {
            // db just needs to be truthy — the function doesn't use it directly,
            // it delegates to computeDocStatusesDb which only uses componentRepo
            db: {} as any,
            componentRepo: repo,
        });

        assert.equal(result.connected, true);
        assert.equal(result.components.length, 1);
        assert.equal(result.components[0].slug, 'delegated');
    });
});
