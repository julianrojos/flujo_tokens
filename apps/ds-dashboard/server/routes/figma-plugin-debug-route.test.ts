/**
 * Tests for Figma Plugin Debug Route
 *
 * Includes both unit tests for the auth helper and integration tests
 * for the actual /api/figma-plugin/debug endpoint.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { checkDebugEndpointAuth } from '../lib/debug-endpoint-auth.ts';
import { type ServerDeps } from '../lib/register-all-routes-service.ts';
import { AiJobsStore, initializeAiJobsStore } from '../services/ai-jobs-store.js';
import { registerAllRoutes } from './register-all-routes.ts';
import { registerFigmaPluginDebugRoute } from './figma-plugin-debug-route.ts';
import type { Context } from 'hono';
import { getConnInfo, type ConnInfo } from '@hono/node-server/conninfo';

// ============================================================================
// Unit Tests for checkDebugEndpointAuth helper
// ============================================================================

interface MockContext {
  remoteAddress?: string;
  internalToken?: string;
  receivedToken?: string;
  isDev?: boolean;
}

function createMockConnInfo(remoteAddress?: string): ReturnType<typeof getConnInfo> {
  return {
    remote: {
      address: remoteAddress ?? '',
      port: 8080,
      addressType: remoteAddress?.includes(':') ? 'IPv6' : 'IPv4',
    },
  } as ReturnType<typeof getConnInfo>;
}

function createMockContext(ctx: MockContext) {
  const mockC = {
    req: {
      header: (name: string) => ctx.receivedToken ?? null,
    },
  } as unknown as Context;

  const mockGetConnInfo = (): ReturnType<typeof getConnInfo> => createMockConnInfo(ctx.remoteAddress);

  // Mock process.env.NODE_ENV
  const originalNodeEnv = process.env.NODE_ENV;
  const hadNodeEnv = originalNodeEnv !== undefined;
  if (ctx.isDev) {
    process.env.NODE_ENV = 'development';
  } else {
    process.env.NODE_ENV = 'production';
  }

  const result = checkDebugEndpointAuth(mockC, ctx.internalToken, mockGetConnInfo);

  // Restore - use delete if original was undefined
  if (hadNodeEnv) {
    process.env.NODE_ENV = originalNodeEnv;
  } else {
    delete process.env.NODE_ENV;
  }

  return result;
}

function createServerDepsForRouteWiring(): ServerDeps {
  return {
    failJson: () => ({}),
    getSystemContext: () => ({ systemId: 'core' }),
    buildHealthPayload: () => ({ ok: true }),
    readJsonBody: async () => ({}),
    designSystemRepository: {},
    normalizeSystemId: (value) => String(value || ''),
    ensureRelativeDir: (value) => value,
    normalizeFigmaApiTokenRef: (value) => value,
    normalizeCollectionList: (value) => value,
    summarizeDesignSystemsConfig: (value) => value,
    resolveSafeSystemPathsForDeletion: () => [],
    repoRoot: '/repo',
    fsSync: {},
    isDevRuntime: () => true,
    resolveRepoFilePath: () => '/repo/file',
    sha256Text: () => 'hash',
    readTextFileLimited: async () => ({ content: '', truncated: false }),
    findLineForQuery: () => 1,
    buildSnippet: () => ({ targetLine: 1, startLine: 1, endLine: 1, snippet: '' }),
    guessContentType: () => 'text/plain',
    MAX_FILE_BYTES: 1_000_000,
    queueJobs: new Map(),
    listQueueJobEvents: () => [],
    queueJobSnapshot: () => ({}),
    isQueueJobFinalStatus: () => false,
    cancelQueueJob: () => ({ ok: true }),
    toQueueTerminalEvent: () => ({}),
    buildApiErrorPayload: () => ({}),
    MAX_RETAINED_EVENTS: 1000,
    enqueueQueueJob: () => ({}),
    runQueuedSpawnCommand: async () => ({}),
    queueNpmScript: () => ({}),
    queueNodeJsonCommand: () => ({}),
    toBooleanString: () => 'false',
    toNumberString: () => '0',
    validateGitRef: () => 'HEAD~1',
  };
}

test('figma-plugin-debug auth helper: rejects remote request without token in production', () => {
  const result = createMockContext({
    remoteAddress: '10.20.30.40',
    internalToken: 'secret-token',
    receivedToken: undefined,
    isDev: false,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.code, 'debug.forbidden');
});

test('figma-plugin-debug auth helper: accepts remote request with valid token in production', () => {
  const result = createMockContext({
    remoteAddress: '10.20.30.40',
    internalToken: 'secret-token',
    receivedToken: 'secret-token',
    isDev: false,
  });

  assert.equal(result.allowed, true);
});

test('figma-plugin-debug auth helper: accepts loopback request without token', () => {
  const result = createMockContext({
    remoteAddress: '127.0.0.1',
    internalToken: 'secret-token',
    receivedToken: undefined,
    isDev: false,
  });

  assert.equal(result.allowed, true);
});

test('figma-plugin-debug auth helper: accepts any request in development mode', () => {
  const result = createMockContext({
    remoteAddress: '10.20.30.40',
    internalToken: 'secret-token',
    receivedToken: undefined,
    isDev: true,
  });

  assert.equal(result.allowed, true);
});

// ============================================================================
// Integration Tests for /api/figma-plugin/debug route
// ============================================================================

function createTestApp(options?: { internalToken?: string; nodeEnv?: string }) {
  const app = new Hono();
  const internalToken = options?.internalToken ?? 'test-token';
  const nodeEnv = options?.nodeEnv ?? 'production';

  // Mock process.env - track if original values were undefined
  const originalToken = process.env.DS_DASHBOARD_INTERNAL_TOKEN;
  const originalNodeEnv = process.env.NODE_ENV;
  const hadToken = originalToken !== undefined;
  const hadNodeEnv = originalNodeEnv !== undefined;

  process.env.DS_DASHBOARD_INTERNAL_TOKEN = internalToken;
  process.env.NODE_ENV = nodeEnv;

  // Custom getConnInfo that extracts remote address from x-forwarded-for header
  const customGetConnInfo = (c: Context): ConnInfo => {
    const forwardedFor = c.req.header('x-forwarded-for');
    return {
      remote: {
        address: forwardedFor ?? '127.0.0.1',
        port: 8080,
        addressType: forwardedFor?.includes(':') ? 'IPv6' : 'IPv4',
      },
    } as ConnInfo;
  };

  // Register the REAL debug route with custom getConnInfo
  registerFigmaPluginDebugRoute(app, {
    internalToken,
    getConnInfoFn: customGetConnInfo,
  });

  // Cleanup function - restore env properly
  const cleanup = () => {
    if (hadToken) {
      process.env.DS_DASHBOARD_INTERNAL_TOKEN = originalToken;
    } else {
      delete process.env.DS_DASHBOARD_INTERNAL_TOKEN;
    }
    if (hadNodeEnv) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  };

  return { app, cleanup };
}

test('figma-plugin-debug route integration: returns 403 for remote request without token in production', async () => {
  const { app, cleanup } = createTestApp({
    internalToken: 'secret-token',
    nodeEnv: 'production',
  });

  try {
    const response = await app.request('/api/figma-plugin/debug', {
      method: 'GET',
      headers: {
        'x-forwarded-for': '10.20.30.40',
      },
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'debug.forbidden');
  } finally {
    cleanup();
  }
});

test('figma-plugin-debug route integration: returns 200 for remote request with valid token in production', async () => {
  const { app, cleanup } = createTestApp({
    internalToken: 'secret-token',
    nodeEnv: 'production',
  });

  try {
    const response = await app.request('/api/figma-plugin/debug', {
      method: 'GET',
      headers: {
        'x-forwarded-for': '10.20.30.40',
        'x-ds-dashboard-internal-token': 'secret-token',
      },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
  } finally {
    cleanup();
  }
});

test('figma-plugin-debug route integration: returns 200 for loopback request without token', async () => {
  const { app, cleanup } = createTestApp({
    internalToken: 'secret-token',
    nodeEnv: 'production',
  });

  try {
    const response = await app.request('/api/figma-plugin/debug', {
      method: 'GET',
      headers: {
        'x-forwarded-for': '127.0.0.1',
      },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
  } finally {
    cleanup();
  }
});

test('figma-plugin-debug route integration: returns 200 in development mode without token', async () => {
  const { app, cleanup } = createTestApp({
    internalToken: 'secret-token',
    nodeEnv: 'development',
  });

  try {
    const response = await app.request('/api/figma-plugin/debug', {
      method: 'GET',
      headers: {
        'x-forwarded-for': '10.20.30.40',
      },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
  } finally {
    cleanup();
  }
});

test('figma-plugin-debug route integration: returns 403 for remote request with invalid token', async () => {
  const { app, cleanup } = createTestApp({
    internalToken: 'secret-token',
    nodeEnv: 'production',
  });

  try {
    const response = await app.request('/api/figma-plugin/debug', {
      method: 'GET',
      headers: {
        'x-forwarded-for': '10.20.30.40',
        'x-ds-dashboard-internal-token': 'wrong-token',
      },
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'debug.forbidden');
  } finally {
    cleanup();
  }
});

test('figma-plugin-debug route wiring: registerAllRoutes exposes debug endpoint', async () => {
  const app = new Hono();
  const originalToken = process.env.DS_DASHBOARD_INTERNAL_TOKEN;
  const originalNodeEnv = process.env.NODE_ENV;
  const hadToken = originalToken !== undefined;
  const hadNodeEnv = originalNodeEnv !== undefined;

  process.env.DS_DASHBOARD_INTERNAL_TOKEN = 'wiring-token';
  process.env.NODE_ENV = 'development';

  try {
    initializeAiJobsStore(new AiJobsStore());
    await registerAllRoutes(app, createServerDepsForRouteWiring());
    const allowedResponse = await app.request('/api/figma-plugin/debug', {
      method: 'GET',
    });

    assert.equal(allowedResponse.status, 200);
    const payload = await allowedResponse.json();
    assert.equal(payload.ok, true);
  } finally {
    if (hadToken) {
      process.env.DS_DASHBOARD_INTERNAL_TOKEN = originalToken;
    } else {
      delete process.env.DS_DASHBOARD_INTERNAL_TOKEN;
    }
    if (hadNodeEnv) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  }
});
