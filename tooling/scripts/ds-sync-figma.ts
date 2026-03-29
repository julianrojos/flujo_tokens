#!/usr/bin/env node

/**
 * DS Sync Figma - Plugin Sync via Server
 *
 * Calls the dashboard server's plugin-based sync endpoint.
 * Variables and components are imported directly from the Figma plugin
 * into SQLite — no JSON intermediaries.
 *
 * Requires: dashboard server running + Figma plugin open in Figma.
 * Usage: ds:sync-figma --system <id> [--port <port>]
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

interface ParsedArgs {
    system: string | null;
    port: number;
    timeoutMs: number;
}

function parseArgs(): ParsedArgs {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Usage: ds:sync-figma [options]

Options:
  --system <id>    Design system ID to sync (required)
  --port <port>    Dashboard server port (default: DS_SERVER_PORT or 3333)
  --timeout-ms <n> Maximum wait time in milliseconds (default: 240000)
  --help, -h       Show this help

Example:
  ds:sync-figma --system sys-01
`);
        process.exit(0);
    }

    const systemIndex = args.indexOf('--system');
    const system = systemIndex !== -1 && args[systemIndex + 1] ? args[systemIndex + 1] : null;

    const portIndex = args.indexOf('--port');
    const portArg = portIndex !== -1 && args[portIndex + 1] ? parseInt(args[portIndex + 1], 10) : null;
    const port = portArg || (process.env.DS_SERVER_PORT ? parseInt(process.env.DS_SERVER_PORT, 10) : 3333);

    const timeoutIndex = args.indexOf('--timeout-ms');
    const timeoutArg = timeoutIndex !== -1 && args[timeoutIndex + 1] ? parseInt(args[timeoutIndex + 1], 10) : null;
    const timeoutMs = timeoutArg || (process.env.DS_SYNC_TIMEOUT_MS ? parseInt(process.env.DS_SYNC_TIMEOUT_MS, 10) : 240000);

    return { system, port, timeoutMs };
}

async function pollJobStatus(baseUrl: string, jobId: string, systemId: string, timeoutMs: number): Promise<void> {
    const pollIntervalMs = 2000;
    const maxAttempts = Math.max(1, Math.ceil(timeoutMs / pollIntervalMs));
    let attempts = 0;

    while (attempts < maxAttempts) {
        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

        let response: Response;
        try {
            response = await fetch(`${baseUrl}/api/jobs/${jobId}`, {
                headers: { 'x-ds-system': systemId },
            });
        } catch (err) {
            console.error(`  Poll attempt ${attempts}: network error — ${err instanceof Error ? err.message : String(err)}`);
            continue;
        }

        if (!response.ok) {
            throw new Error(`Job status check failed: HTTP ${response.status}`);
        }

        const data = await response.json() as Record<string, unknown>;

        // API returns: { ok: true, job: {...}, done: boolean, events: [...], nextCursor: number }
        const done = data.done === true;
        const job = toRecord(data.job);
        const status = String(job?.status || data.status || '').toLowerCase();
        const jobResult = toRecord(job?.result);
        const resultPayload = toRecord(jobResult?.payload);
        const dataPayload = toRecord(data.payload);
        const summary = String(
            jobResult?.summary
            || resultPayload?.summary
            || data.summary
            || dataPayload?.summary
            || '',
        );

        if (status === 'failed' || status === 'error' || status === 'cancelled') {
            throw new Error(`Sync job failed: ${summary || status}`);
        }

        if (done || status === 'success') {
            if (resultPayload) {
                console.log(`✓ Sync completed:`);
                console.log(`  Tokens:        ${resultPayload.tokens ?? '?'}`);
                console.log(`  Mode vals:     ${resultPayload.tokenModeValues ?? '?'}`);
                console.log(`  Aliases:       ${resultPayload.aliases ?? '?'}`);
                console.log(`  Components:    ${resultPayload.components ?? '?'}`);
                if (typeof resultPayload.usageRestored === 'number' || typeof resultPayload.usageDropped === 'number') {
                    console.log(`  Usage kept:    ${resultPayload.usageRestored ?? '?'}`);
                    console.log(`  Usage dropped: ${resultPayload.usageDropped ?? '?'}`);
                }
            } else {
                console.log('✓ Sync completed.');
            }
            return;
        }

        if (status === 'running' || status === 'queued' || status === 'pending') {
            if (summary) console.log(`  [${status}] ${summary}`);
        }
    }

    throw new Error(`Sync timed out after waiting ${(timeoutMs / 1000).toFixed(0)} seconds.`);
}

function toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

async function main(): Promise<void> {
    const { system, port, timeoutMs } = parseArgs();

    if (!system) {
        console.error('❌ --system is required.');
        console.error('   Example: ds:sync-figma --system sys-01');
        process.exitCode = 1;
        return;
    }

    const baseUrl = `http://localhost:${port}`;
    console.log(`=== DS Sync Figma (Plugin → DB) ===`);
    console.log(`System: ${system}`);
    console.log(`Server: ${baseUrl}`);
    console.log('');

    // Trigger sync
    console.log('Triggering plugin sync...');
    let response: Response;
    try {
        response = await fetch(`${baseUrl}/api/sync-figma-tokens`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-ds-system': system,
            },
            body: JSON.stringify({ tokensSource: 'mcp', includeComponents: true }),
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`❌ Could not reach dashboard server at ${baseUrl}: ${message}`);
        console.error('   Make sure the dashboard server is running.');
        process.exitCode = 1;
        return;
    }

    if (!response.ok) {
        let errorBody = '';
        try { errorBody = await response.text(); } catch { /* ignore */ }
        console.error(`❌ Sync request failed: HTTP ${response.status}`);
        if (errorBody) console.error(`   ${errorBody.slice(0, 500)}`);
        process.exitCode = 1;
        return;
    }

    const data = await response.json() as Record<string, unknown>;
    const jobId = String(data.jobId || data.id || '');
    if (!jobId) {
        console.error('❌ Server did not return a job ID.');
        process.exitCode = 1;
        return;
    }

    console.log(`✓ Sync job queued: ${jobId}`);
    console.log('Waiting for completion...');

    try {
        await pollJobStatus(baseUrl, jobId, system, timeoutMs);
        console.log('');
        console.log('=== ✅ Sync completed successfully ===');
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`❌ ${message}`);
        console.error('');
        console.error('=== ❌ Sync failed ===');
        process.exitCode = 1;
    }
}

main().catch((err) => {
    console.error('Unexpected error:', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
});
