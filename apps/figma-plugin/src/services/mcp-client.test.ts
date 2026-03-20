/**
 * Tests for mcp-client.ts - KitSummary computation
 */

import { describe, it, expect } from 'vitest';
import { McpClientService } from './mcp-client.ts';

describe('McpClientService.computeKitSummary', () => {
    const client = new McpClientService('http://localhost:3000');

    it('returns null for error response (not ok)', () => {
        const errorResponse = {
            ok: false,
            code: 'mcp.not_connected',
            message: 'MCP not connected',
        };
        const summary = client.computeKitSummary(errorResponse);
        expect(summary).toBeNull();
    });

    it('computes correct variableCount and collectionCount from kit response', () => {
        const kit = {
            ok: true,
            tokens: {
                variables: {
                    'variable-1': { id: 'v1', name: 'Color/Primary', resolvedType: 'COLOR' },
                    'variable-2': { id: 'v2', name: 'Color/Secondary', resolvedType: 'COLOR' },
                    'variable-3': { id: 'v3', name: 'Spacing/Small', resolvedType: 'FLOAT' },
                },
                variableCollections: {
                    'collection-1': { id: 'c1', name: 'Default', modes: [] },
                },
            },
            styles: [],
            elapsedMs: 100,
        };
        const summary = client.computeKitSummary(kit);
        expect(summary).not.toBeNull();
        expect(summary!.variableCount).toBe(3);
        expect(summary!.collectionCount).toBe(1);
        expect(summary!.stylesByType).toEqual({});
        expect(summary!.fetchedAt).toBeInstanceOf(Date);
    });

    it('computes correct stylesByType from kit response', () => {
        const kit = {
            ok: true,
            tokens: {
                variables: {},
                variableCollections: {},
            },
            styles: [
                { id: 's1', name: 'Fill/Primary', styleType: 'FILL' },
                { id: 's2', name: 'Fill/Secondary', styleType: 'FILL' },
                { id: 's3', name: 'Text/Heading', styleType: 'TEXT' },
                { id: 's4', name: 'Effect/Shadow', styleType: 'EFFECT' },
            ],
            elapsedMs: 50,
        };
        const summary = client.computeKitSummary(kit);
        expect(summary).not.toBeNull();
        expect(summary!.variableCount).toBe(0);
        expect(summary!.collectionCount).toBe(0);
        expect(summary!.stylesByType).toEqual({
            FILL: 2,
            TEXT: 1,
            EFFECT: 1,
        });
    });

    it('handles empty tokens and styles gracefully', () => {
        const kit = {
            ok: true,
            tokens: {},
            styles: [],
            elapsedMs: 10,
        };
        const summary = client.computeKitSummary(kit);
        expect(summary).not.toBeNull();
        expect(summary!.variableCount).toBe(0);
        expect(summary!.collectionCount).toBe(0);
        expect(summary!.stylesByType).toEqual({});
    });

    it('handles undefined tokens and styles gracefully', () => {
        const kit = {
            ok: true,
            elapsedMs: 10,
        };
        const summary = client.computeKitSummary(kit);
        expect(summary).not.toBeNull();
        expect(summary!.variableCount).toBe(0);
        expect(summary!.collectionCount).toBe(0);
        expect(summary!.stylesByType).toEqual({});
    });
});

describe('McpClientService.computeConnectionState', () => {
    const client = new McpClientService('http://localhost:3000');

    it('returns connecting when capabilities request timed out', () => {
        const state = client.computeConnectionState({
            ok: false,
            code: 'capabilities.timeout',
            message: 'timed out',
        });
        expect(state.state).toBe('connecting');
    });
});
