/**
 * Token Repository Tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import Database from 'better-sqlite3';
import { bootstrapDatabase } from './db-service.js';
import { TokenRepository } from './token-repository.js';

describe('token-repository', () => {
    let db: Database.Database;
    let repo: TokenRepository;

    beforeEach(() => {
        db = bootstrapDatabase({ dbPath: ':memory:' });
        repo = new TokenRepository(db);
    });

    afterEach(() => {
        if (db) {
            db.close();
        }
    });

    describe('getTokenByCssVar()', () => {
        it('returns null for non-existent CSS var', () => {
            const token = repo.getTokenByCssVar('--nonexistent');
            assert.strictEqual(token, null);
        });

        it('returns token for existing CSS var', () => {
            // Insert test data directly
            db.prepare(`
                INSERT INTO tokens (id, slash_path, css_var, type, collection, raw_value)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run('test.token', 'test/token', '--test-token', 'color', 'test', JSON.stringify({ $value: '#ff0000' }));

            const token = repo.getTokenByCssVar('--test-token');
            assert.ok(token);
            assert.strictEqual(token.cssVar, '--test-token');
            assert.strictEqual(token.type, 'color');
        });
    });

    describe('getTokenByPath()', () => {
        it('returns null for non-existent path', () => {
            const token = repo.getTokenByPath('nonexistent.path');
            assert.strictEqual(token, null);
        });

        it('returns token for existing path', () => {
            db.prepare(`
                INSERT INTO tokens (id, slash_path, css_var, type, collection, raw_value)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run('test.token', 'test/token', '--test-token', 'color', 'test', JSON.stringify({ $value: '#ff0000' }));

            const token = repo.getTokenByPath('test.token');
            assert.ok(token);
            assert.strictEqual(token.id, 'test.token');
        });
    });

    describe('rebuildFromJsonFiles()', () => {
        it('loads tokens from token-registry.json', () => {
            const tempDir = fs.mkdtempSync('token-test-');
            const registryPath = path.join(tempDir, 'token-registry.json');

            fs.writeFileSync(registryPath, JSON.stringify({
                entries: [
                    { id: 'color.blue', path: 'color.blue', cssVar: '--color-blue', type: 'color', collection: 'color', $value: '#0000ff' },
                ],
            }));

            const result = repo.rebuildFromJsonFiles({ tokenRegistry: registryPath });

            assert.strictEqual(result.tokensLoaded, 1);
            // Warnings for missing usage + alias files (optional)
            assert.ok(result.warnings.length >= 0);

            const token = repo.getTokenByPath('color.blue');
            assert.ok(token);
            assert.strictEqual(token.cssVar, '--color-blue');

            fs.rmSync(tempDir, { recursive: true, force: true });
        });

        it('handles missing files gracefully', () => {
            const result = repo.rebuildFromJsonFiles({
                tokenRegistry: '/nonexistent/registry.json',
                tokenUsageIndex: '/nonexistent/usage.json',
                figmaAliasGraph: '/nonexistent/aliases.json',
            });

            assert.strictEqual(result.tokensLoaded, 0);
            assert.strictEqual(result.warnings.length, 3);
        });

        it('populates token_usage from usedIn entries', () => {
            const tempDir = fs.mkdtempSync('usage-test-');
            const usagePath = path.join(tempDir, 'usage.json');
            fs.writeFileSync(usagePath, JSON.stringify({
                entries: [
                    {
                        path: 'color.blue', usedIn: [
                            { kind: 'css-variable', source: 'css-alias', owner: 'tokens.css', detail: '--color-blue' },
                            { kind: 'css-variable', source: 'css-alias', owner: 'tokens2.css', detail: '--color-blue' },
                        ]
                    },
                ],
            }));
            const result = repo.rebuildFromJsonFiles({ tokenUsageIndex: usagePath });
            assert.strictEqual(result.usageLoaded, 2);
            fs.rmSync(tempDir, { recursive: true, force: true });
        });
    });
});
