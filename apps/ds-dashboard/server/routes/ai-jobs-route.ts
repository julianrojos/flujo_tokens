/**
 * AI Jobs Routes
 * HTTP endpoints for AI-powered component documentation generation
 */

import type { Context } from 'hono';
import { Hono } from 'hono';
import { getAiJobsStore } from '../services/ai-jobs-store.js';
import { runGenerateComponentDoc } from '../services/ai-orchestrator.js';
import { hasApiKey } from '../services/ai-provider.js';
import { OllamaAdapter } from '../services/ai-ollama-adapter.js';
import { createComponentSlug } from '../services/ai-component-doc-renderer.js';
import { AI_ERROR_CODES } from '../services/ai-component-doc-schema.js';
import { resolveFileKeyFromManager } from '../lib/filekey-utils.ts';
import { computeDocStatuses } from '../services/ai-doc-status-service.js';
import { computeDocDiff } from '../services/ai-diff-utils.js';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get repo root (this file is in apps/ds-dashboard/server/routes/)
const REPO_ROOT = path.resolve(__dirname, '../../../..');

/**
 * Request body for creating a job
 */
interface CreateJobRequest {
    type: 'GENERATE_COMPONENT_DOC';
    provider: 'anthropic' | 'openai' | 'ollama';
    componentId: string;
    figmaUrl?: string;
    model?: string;
    dryRun?: boolean;
    idempotencyKey?: string;
}

/**
 * Request body for applying a job
 */
interface ApplyJobRequest {
    outputPath?: string;
    overwrite?: boolean;
}

/**
 * Auth guard helper
 */
function checkAuth(c: { req: { header: (name: string) => string | undefined } }, internalToken?: string): boolean {
    // Allow loopback requests
    const forwarded = c.req.header('x-forwarded-for');
    const isLoopback = forwarded === '127.0.0.1' || forwarded === '::1' || !forwarded;

    if (isLoopback) {
        return true;
    }

    // Check internal token if set
    if (internalToken) {
        const provided = c.req.header('x-internal-token');
        return provided === internalToken;
    }

    return false;
}

/**
 * Create error response
 */
function errorResponse(code: string, message: string, retryable = false) {
    return {
        ok: false,
        code,
        message,
        retryable,
    };
}

/**
 * Register AI jobs routes
 */
export function registerAiJobsRoutes(app: Hono, deps: { internalToken?: string }) {
    const store = getAiJobsStore();
    store.setOnJobStarted((job) => {
        runGenerateComponentDoc(job, store).catch((err) => {
            console.error('Job pipeline error:', err);
        });
    });

    // POST /api/ai/jobs - Create a new job
    app.post('/api/ai/jobs', async (c) => {
        // Auth check
        if (!checkAuth(c, deps.internalToken)) {
            return c.json(errorResponse('ai.input.invalid', 'Unauthorized'), 401);
        }

        // Parse body
        let body: CreateJobRequest;
        try {
            body = await c.req.json();
        } catch {
            return c.json(errorResponse('ai.input.invalid', 'Invalid JSON body'), 400);
        }

        // Validate required fields
        if (!body.type || body.type !== 'GENERATE_COMPONENT_DOC') {
            return c.json(errorResponse('ai.input.invalid', 'type must be GENERATE_COMPONENT_DOC'), 400);
        }
        if (!body.provider || (body.provider !== 'anthropic' && body.provider !== 'openai' && body.provider !== 'ollama')) {
            return c.json(errorResponse('ai.input.invalid', 'provider must be anthropic, openai, or ollama'), 400);
        }
        if (!body.componentId || typeof body.componentId !== 'string') {
            return c.json(errorResponse('ai.input.invalid', 'componentId is required'), 400);
        }

        // Check API key exists (not required for Ollama)
        if (body.provider !== 'ollama' && !hasApiKey(body.provider)) {
            return c.json(
                errorResponse(
                    'ai.input.missing_provider_key',
                    `API key not set for ${body.provider}. Set ${body.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} environment variable.`
                ),
                400
            );
        }

        const figmaUrl = typeof body.figmaUrl === 'string' && body.figmaUrl.trim()
            ? body.figmaUrl.trim()
            : undefined;

        // Resolve file key via plugin connection manager utility
        const resolved = resolveFileKeyFromManager(figmaUrl, {
            ambiguous: AI_ERROR_CODES.FIGMA_NO_CONNECTION.code,
            noSocket: AI_ERROR_CODES.FIGMA_NO_CONNECTION.code,
            ambiguousMessage: 'Multiple plugin connections detected. Provide figmaUrl to disambiguate.',
            noSocketMessage: 'No plugin WebSocket connection available.',
        });

        if (!('fileKey' in resolved)) {
            // For requests without figmaUrl, allow enqueue even if no socket is currently connected.
            // The job may still fail later at extraction time with a taxonomy-mapped retryable error.
            if (!figmaUrl && resolved.code === AI_ERROR_CODES.FIGMA_NO_CONNECTION.code) {
                // continue with undefined fileKey
            } else {
                return c.json(
                    errorResponse(resolved.code, resolved.message, AI_ERROR_CODES.FIGMA_NO_CONNECTION.retryable),
                    503
                );
            }
        }
        const fileKey = 'fileKey' in resolved ? resolved.fileKey ?? undefined : undefined;

        // Health-check for Ollama before enqueue
        if (body.provider === 'ollama') {
            const ollamaBaseUrl = OllamaAdapter.configuredBaseUrl;
            const alive = await OllamaAdapter.isAvailable();
            if (!alive) {
                return c.json(
                    errorResponse(AI_ERROR_CODES.AI_OLLAMA_UNAVAILABLE.code, 'Ollama is not reachable at ' + ollamaBaseUrl, true),
                    503
                );
            }
        }

        try {
            // Enqueue job
            const job = store.enqueue({
                type: body.type,
                provider: body.provider,
                componentId: body.componentId,
                fileKey,
                figmaUrl,
                model: body.model,
                dryRun: body.dryRun,
                idempotencyKey: body.idempotencyKey,
            });

            // Try to dequeue immediately to start execution if slot available
            store.tryDequeue(body.provider);

            // Return status of the requested job, not dequeued job
            return c.json(
                {
                    ok: true,
                    jobId: job.id,
                    status: job.status,
                },
                202
            );
        } catch (error) {
            if (error && typeof error === 'object' && 'code' in error) {
                const err = error as { code: string; message: string; retryable: boolean };
                // Map error codes to appropriate HTTP status codes
                let statusCode: 400 | 429 | 503 = 400; // Default for client errors

                if (err.code === 'ai.job.queue_full') {
                    // Queue full is a temporary server condition (retryable)
                    statusCode = 503; // Service Unavailable
                } else if (err.code === 'ai.figma.no_connection' || err.code === 'ai.figma.spec_failed') {
                    // Figma connectivity issues are temporary (retryable)
                    statusCode = 503; // Service Unavailable
                } else if (err.code === 'ai.llm.timeout' || err.code === 'ai.llm.rate_limited' || err.code === 'ai.llm.api_error') {
                    // LLM issues are temporary (retryable)
                    statusCode = err.code === 'ai.llm.rate_limited' ? 429 : 503;
                } else if (err.retryable) {
                    // Generic retryable errors -> 503
                    statusCode = 503;
                }
                // Non-retryable input errors remain 400

                return c.json(errorResponse(err.code, err.message, err.retryable), statusCode);
            }
            return c.json(errorResponse('ai.input.invalid', 'Failed to create job'), 500);
        }
    });

    // GET /api/ai/docs/status - Get documentation staleness status
    app.get('/api/ai/docs/status', async (c) => {
        // Auth check
        if (!checkAuth(c, deps.internalToken)) {
            return c.json(errorResponse('ai.input.invalid', 'Unauthorized'), 401);
        }

        // Resolve docs directory
        const docsDir = path.resolve(REPO_ROOT, 'docs/components');

        try {
            const result = await computeDocStatuses(docsDir);
            return c.json(result);
        } catch (error) {
            console.error('Error computing doc statuses:', error);
            return c.json(errorResponse('ai.status.computation_failed', 'Failed to compute doc statuses'), 500);
        }
    });

    // GET /api/ai/jobs/:id - Get job status
    app.get('/api/ai/jobs/:id', async (c) => {
        // Auth check
        if (!checkAuth(c, deps.internalToken)) {
            return c.json(errorResponse('ai.input.invalid', 'Unauthorized'), 401);
        }

        const jobId = c.req.param('id');
        const job = store.findById(jobId);

        if (!job) {
            return c.json(errorResponse('ai.job.not_found', 'Job not found'), 404);
        }

        // Compute done flag from terminal statuses
        const done = job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled';

        // Compute nextCursor (null if done, otherwise polling hint)
        const nextCursor = done ? null : 'poll';

        return c.json({
            ok: true,
            id: job.id,
            status: job.status,
            input: job.input,
            output: job.output,
            error: job.error,
            errorCode: job.errorCode,
            retryable: job.retryable,
            events: job.events,
            usage: job.usage,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            done,
            nextCursor,
        });
    });

    // GET /api/ai/jobs/:id/events - SSE for job events
    //
    // Contract:
    // - Cursor precedence: Last-Event-ID header > query param 'cursor' > default 0
    // - Events are emitted with id, event, data fields
    // - Terminal event 'done' is emitted when job reaches terminal state
    // - Keepalive ':' events sent every 15s to prevent proxy timeouts
    // - Client can reconnect using Last-Event-ID to resume from last seen event
    app.get('/api/ai/jobs/:id/events', async (c) => {
        // Auth check
        if (!checkAuth(c, deps.internalToken)) {
            return c.text('Unauthorized', 401);
        }

        const jobId = c.req.param('id');

        // Cursor precedence: Last-Event-ID header > query cursor > default 0
        // This follows EventSource spec for reliable reconnection
        const lastEventId = c.req.header('Last-Event-ID');
        const queryCursor = c.req.query('cursor');

        let cursorNum = 0;
        if (lastEventId !== undefined && lastEventId !== '') {
            cursorNum = parseInt(lastEventId, 10) || 0;
        } else if (queryCursor !== undefined) {
            cursorNum = parseInt(queryCursor, 10) || 0;
        }

        const job = store.findById(jobId);
        if (!job) {
            return c.text('Job not found', 404);
        }

        // Create SSE stream
        const encoder = new TextEncoder();
        const signal = c.req.raw.signal;

        // State variables shared between start and cancel
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let closed = false;
        let controllerRef: ReadableStreamDefaultController | null = null;

        const closeStream = () => {
            if (closed) {
                return;
            }
            closed = true;
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            // Close the controller if available
            if (controllerRef) {
                try { controllerRef.close(); } catch { /* already closed */ }
                controllerRef = null;
            }
        };

        const stream = new ReadableStream({
            start(controller) {
                controllerRef = controller;
                let lastSeq = cursorNum;
                let lastKeepalive = Date.now();
                const POLL_INTERVAL = 1000;
                const KEEPALIVE_INTERVAL = 15000;

                signal.addEventListener('abort', closeStream, { once: true });

                // Send existing events first
                const sendNewEvents = () => {
                    if (closed || signal.aborted) {
                        closeStream();
                        return;
                    }

                    // Get fresh job reference
                    const currentJob = store.findById(jobId);
                    if (!currentJob) {
                        closeStream();
                        return;
                    }

                    const newEvents = currentJob.events.filter(e => e.seq > lastSeq);
                    for (const evt of newEvents) {
                        controller.enqueue(encoder.encode(
                            `id: ${evt.seq}\ndata: ${JSON.stringify(evt)}\n\n`
                        ));
                        lastSeq = evt.seq;
                    }

                    // Check for terminal state
                    if (currentJob.status === 'completed' || currentJob.status === 'failed' || currentJob.status === 'cancelled') {
                        controller.enqueue(encoder.encode(
                            `event: done\ndata: ${JSON.stringify({ status: currentJob.status })}\n\n`
                        ));
                        closeStream();
                        return;
                    }

                    // Keepalive
                    if (Date.now() - lastKeepalive > KEEPALIVE_INTERVAL) {
                        controller.enqueue(encoder.encode(': keepalive\n\n'));
                        lastKeepalive = Date.now();
                    }

                    // Continue polling
                    timeoutId = setTimeout(sendNewEvents, POLL_INTERVAL);
                };

                // Start polling
                sendNewEvents();
            },
            cancel() {
                // Cleanup when client disconnects
                closeStream();
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    });

    // POST /api/ai/jobs/:id/apply - Apply generated documentation
    app.post('/api/ai/jobs/:id/apply', async (c) => {
        // Auth check
        if (!checkAuth(c, deps.internalToken)) {
            return c.json(errorResponse('ai.input.invalid', 'Unauthorized'), 401);
        }

        const jobId = c.req.param('id');
        const job = store.findById(jobId);

        if (!job) {
            return c.json(errorResponse('ai.job.not_found', 'Job not found'), 404);
        }

        if (job.status !== 'completed') {
            return c.json(
                errorResponse('ai.job.not_completed', 'Job must be completed to apply'),
                409
            );
        }

        // Parse body
        let body: ApplyJobRequest;
        try {
            body = await c.req.json();
        } catch {
            body = {};
        }

        const { outputPath, overwrite } = body;

        // Generate filename from title
        const slug = createComponentSlug(job.output!.title);
        const filename = `${slug}.md`;

        // Resolve output path
        const basePath = outputPath
            ? path.resolve(REPO_ROOT, outputPath)
            : path.resolve(REPO_ROOT, 'docs/components');

        const filePath = path.join(basePath, filename);

        // Security: ensure path starts with allowed base
        const allowedBase = path.resolve(REPO_ROOT, 'docs/components');
        // Use startsWith with path separator to prevent prefix attacks (e.g., docs/components-evil)
        const resolvedPath = path.resolve(filePath);
        const allowedBaseWithSep = allowedBase + path.sep;
        if (resolvedPath !== allowedBase && !resolvedPath.startsWith(allowedBaseWithSep)) {
            return c.json(errorResponse('ai.apply.path_blocked', 'Path outside allowed directory'), 403);
        }

        // Ensure directory exists
        await fs.mkdir(basePath, { recursive: true });

        // Check if file exists
        let overwritten = false;
        try {
            await fs.access(filePath);
            // File exists
            if (!overwrite) {
                return c.json(
                    errorResponse('ai.apply.file_exists', 'File already exists. Set overwrite: true to replace.'),
                    409
                );
            }
            overwritten = true;
        } catch {
            // File doesn't exist - that's fine
        }

        // Write file
        try {
            if (overwrite) {
                // Use temp file for atomic write
                const tempPath = `${filePath}.tmp`;
                await fs.writeFile(tempPath, job.output!.markdown, 'utf-8');
                await fs.rename(tempPath, filePath);
            } else {
                // Use exclusive create
                await fs.writeFile(filePath, job.output!.markdown, {
                    flag: 'wx',
                });
            }
        } catch (err) {
            if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'EEXIST') {
                return c.json(
                    errorResponse('ai.apply.file_exists', 'File already exists. Set overwrite: true to replace.'),
                    409
                );
            }
            throw err;
        }

        // Compute checksum from the markdown we just wrote — avoids a redundant read
        const checksum = crypto.createHash('sha256').update(job.output!.markdown).digest('hex');

        return c.json({
            ok: true,
            path: path.relative(REPO_ROOT, filePath),
            overwritten,
            checksum,
        });
    });

    // GET /api/ai/jobs/:id/diff - Get diff between generated and existing doc
    app.get('/api/ai/jobs/:id/diff', async (c) => {
        // Auth check
        if (!checkAuth(c, deps.internalToken)) {
            return c.json(errorResponse('ai.input.invalid', 'Unauthorized'), 401);
        }

        const jobId = c.req.param('id');
        const job = store.findById(jobId);

        if (!job) {
            return c.json(errorResponse('ai.job.not_found', 'Job not found'), 404);
        }

        if (job.status !== 'completed' || !job.output) {
            return c.json(errorResponse('ai.job.not_completed', 'Job must be completed to get diff'), 400);
        }

        // Generate slug from title
        const slug = createComponentSlug(job.output.title);
        const docsDir = path.resolve(REPO_ROOT, 'docs/components');

        try {
            const diffResult = await computeDocDiff(job.output.markdown, slug, docsDir);
            return c.json(diffResult);
        } catch (error) {
            console.error('Error computing diff:', error);
            return c.json(errorResponse('ai.diff.computation_failed', 'Failed to compute diff'), 500);
        }
    });

    // POST /api/ai/jobs/:id/cancel - Cancel a job
    app.post('/api/ai/jobs/:id/cancel', async (c) => {
        // Auth check
        if (!checkAuth(c, deps.internalToken)) {
            return c.json(errorResponse('ai.input.invalid', 'Unauthorized'), 401);
        }

        const jobId = c.req.param('id');
        const job = store.findById(jobId);

        if (!job) {
            return c.json(errorResponse('ai.job.not_found', 'Job not found'), 404);
        }

        if (job.status !== 'queued' && job.status !== 'pending') {
            return c.json(
                errorResponse('ai.job.not_cancelable', 'Job cannot be cancelled'),
                409
            );
        }

        store.cancel(jobId);

        return c.json({
            ok: true,
            jobId,
            status: 'cancelled',
        });
    });
}
