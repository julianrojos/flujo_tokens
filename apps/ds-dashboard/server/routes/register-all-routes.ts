/**
 * Register All Routes
 *
 * Registers all API routes on the Hono application.
 */

import type { Hono } from 'hono';

import { registerSystemRoutes } from './system-routes.mjs';
import { registerAssetRoutes } from './asset-routes.mjs';
import { registerCatalogRoutes } from './catalog-routes.mjs';
import { registerTokenUsageIndexRoutes } from './token-usage-index-routes.ts';
import { registerHealthRoutes } from './health-routes.ts';
import { registerComponentSpecRoutes } from './component-spec-routes.mjs';
import { registerJobRoutes } from './job-routes.mjs';
import { registerCommandRoutes } from './command-routes.ts';
import { registerFigmaMcpVariablesRoute } from './figma-mcp-variables-route.ts';
import { registerFigmaMcpPortRoute } from './figma-mcp-port-route.ts';
import { registerFigmaMcpSearchNodesRoute } from './figma-mcp-search-nodes-route.ts';
import { registerFigmaMcpCapabilitiesRoute } from './figma-mcp-capabilities-route.ts';
import { registerFigmaMcpSurgicalQueriesRoutes } from './figma-mcp-surgical-queries-route.ts';
import { registerFigmaMcpDesignSystemKitRoute } from './figma-mcp-design-system-kit-route.ts';
import { registerFigmaMcpHeartbeatRoute } from './figma-mcp-heartbeat-route.ts';
import { registerFigmaMcpReconnectRoute } from './figma-mcp-reconnect-route.ts';
import { registerFigmaMcpConsoleLogsRoute } from './figma-mcp-console-logs-route.ts';
import { registerFigmaMcpDesignChangesRoute } from './figma-mcp-design-changes-route.ts';
import { registerFigmaMcpSelectionRoute } from './figma-mcp-selection-route.ts';
import { registerFigmaMcpDesignContextCompactRoute } from './figma-mcp-design-context-compact-route.ts';
import { registerFigmaPluginDebugRoute } from './figma-plugin-debug-route.ts';
import { registerFigmaMcpVariablesV2Routes } from './figma-mcp-variables-v2-route.ts';
import { registerFigmaMcpComponentsRoutes } from './figma-mcp-components-route.ts';
import { registerFigmaMcpTokenBindingsRoutes } from './figma-mcp-token-bindings-route.ts';
import { registerFigmaMcpDependenciesRoutes } from './figma-mcp-dependencies-route.ts';
import { registerAiJobsRoutes } from './ai-jobs-route.ts';
import type { CommandRoutesDeps } from './command-routes.ts';
import { registerComponentDocsRoutes } from './component-docs-route.ts';
import { buildAllRouteDeps, type ServerDeps } from '../lib/register-all-routes-service.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function ensureString(value: unknown, source: string): string {
  if (typeof value === 'string') return value;
  throw new TypeError(`${source} must be a string`);
}

function ensureResponse(value: unknown, source: string): Response {
  if (value instanceof Response) return value;
  throw new TypeError(`${source} must return a Response instance`);
}

function ensureCommandRoutesDeps(deps: ReturnType<typeof buildAllRouteDeps>['commandDeps']): CommandRoutesDeps {
  return {
    failJson: (c, statusCode, args) => ensureResponse(deps.failJson(c, statusCode, args), 'commandDeps.failJson'),
    createApiRequestId: deps.createApiRequestId,
    readJsonBody: deps.readJsonBody,
    getSystemContext: async (systemHeader) => {
      const context = await deps.getSystemContext(systemHeader);
      if (!isRecord(context)) {
        throw new TypeError('commandDeps.getSystemContext must return an object');
      }
      return {
        repoRoot: ensureString(context.repoRoot, 'commandDeps.getSystemContext.repoRoot'),
        systemId: ensureString(context.systemId, 'commandDeps.getSystemContext.systemId'),
        figmaFileId:
          typeof context.figmaFileId === 'string' && context.figmaFileId.trim()
            ? context.figmaFileId
            : undefined,
        captureFromFigmaUrlScriptPath: `${ensureString(context.repoRoot, 'commandDeps.getSystemContext.repoRoot')}/tooling/src/runners/capture-from-figma-url-runner.ts`,
      };
    },
    queueJobAcceptedPayload: (job) => {
      const payload = deps.queueJobAcceptedPayload(job);
      if (!isRecord(payload) || typeof payload.ok !== 'boolean' || typeof payload.jobId !== 'string') {
        throw new TypeError('commandDeps.queueJobAcceptedPayload must return { ok: boolean; jobId: string }');
      }
      return { ok: payload.ok, jobId: payload.jobId };
    },
    enqueueQueueJob: (args) => {
      const job = deps.enqueueQueueJob(args);
      if (!isRecord(job) || typeof job.id !== 'string') {
        throw new TypeError('commandDeps.enqueueQueueJob must return { id: string }');
      }
      return { id: job.id };
    },
    sha256Text: deps.sha256Text,
    runQueuedSpawnCommand: async (options) => {
      const result = await deps.runQueuedSpawnCommand(options);
      if (!isRecord(result) || typeof result.ok !== 'boolean') {
        throw new TypeError('commandDeps.runQueuedSpawnCommand must resolve to { ok: boolean }');
      }
      return { ok: result.ok };
    },
    queueNpmScript: (args) => {
      const job = deps.queueNpmScript(args);
      if (!isRecord(job) || typeof job.id !== 'string') {
        throw new TypeError('commandDeps.queueNpmScript must return { id: string }');
      }
      return { id: job.id };
    },
    queueNodeJsonCommand: (args) => {
      const job = deps.queueNodeJsonCommand(args);
      if (!isRecord(job) || typeof job.id !== 'string') {
        throw new TypeError('commandDeps.queueNodeJsonCommand must return { id: string }');
      }
      return { id: job.id };
    },
    componentRepo: deps.componentRepo,
    tokenRepo: deps.tokenRepo,
    healthRepo: deps.healthRepo,
    db: deps.db,
    toBooleanString: deps.toBooleanString,
    toNumberString: deps.toNumberString,
    validateGitRef: deps.validateGitRef,
  };
}

type DbDesignSystemRepoShape = {
  getAll?: () => Array<{ figmaFileId?: unknown; figmaApiToken?: unknown }>;
};

function hasDbDesignSystemRepo(value: unknown): value is DbDesignSystemRepoShape {
  return typeof value === 'object' && value !== null && typeof (value as DbDesignSystemRepoShape).getAll === 'function';
}

export function registerAllRoutes(app: Hono, deps: ServerDeps): void {
  const routeDeps = buildAllRouteDeps(deps);
  const figmaTokenByDsFileKey = new Map<string, string>();
  const figmaTokenBySystemId = new Map<string, string>();
  if (hasDbDesignSystemRepo(deps.designSystemRepository)) {
    Promise.resolve(deps.designSystemRepository.getAll?.())
      .then((systems) => {
        if (!Array.isArray(systems)) return;
        for (const system of systems) {
          const systemId = String((system as { id?: unknown })?.id || '').trim();
          const dsFileKey = String(system?.figmaFileId || '').trim();
          const tokenRef = String(system?.figmaApiToken || '').trim();
          if (dsFileKey && tokenRef) {
            figmaTokenByDsFileKey.set(dsFileKey, tokenRef);
          }
          if (systemId && tokenRef) {
            figmaTokenBySystemId.set(systemId, tokenRef);
          }
        }
      })
      .catch((error) => {
        console.warn(
          '[register-all-routes] Failed to preload DB Figma token references',
          error,
        );
      });
  }
  const resolveFigmaTokenRefByDsFileKey = (dsFileKey: string): string => {
    const normalizedDsFileKey = String(dsFileKey || '').trim();
    if (!normalizedDsFileKey) return '';
    return figmaTokenByDsFileKey.get(normalizedDsFileKey) || '';
  };

  registerSystemRoutes(app, routeDeps.systemDeps);
  registerAssetRoutes(app, routeDeps.componentSpecDeps);
  registerCatalogRoutes(app, { ...routeDeps.registryDeps, componentRepo: routeDeps.componentRepo, tokenRepo: routeDeps.tokenRepo });
  registerTokenUsageIndexRoutes(app, { ...routeDeps.tokenUsageIndexDeps, tokenRepo: routeDeps.tokenRepo });
  registerHealthRoutes(app, { ...routeDeps.healthDeps, healthRepo: routeDeps.healthRepo });
  registerComponentSpecRoutes(app, routeDeps.componentSpecDeps);
  registerJobRoutes(app, routeDeps.jobDeps);
  registerCommandRoutes(app, ensureCommandRoutesDeps(routeDeps.commandDeps));
  registerFigmaMcpVariablesRoute(app, {
    readJsonBody: routeDeps.figmaMcpPingDeps.readJsonBody,
  });
  registerFigmaMcpPortRoute(app);
  registerFigmaMcpSearchNodesRoute(app);
  registerFigmaMcpCapabilitiesRoute(app);
  registerFigmaMcpHeartbeatRoute(app);
  registerFigmaMcpReconnectRoute(app);
  registerFigmaMcpConsoleLogsRoute(app);
  registerFigmaMcpDesignChangesRoute(app);
  registerFigmaMcpSelectionRoute(app);
  registerFigmaMcpDesignContextCompactRoute(app);
  registerFigmaMcpSurgicalQueriesRoutes(app);
  registerFigmaMcpDesignSystemKitRoute(app);
  registerFigmaMcpVariablesV2Routes(app, {
    readJsonBody: routeDeps.figmaMcpPingDeps.readJsonBody,
  });
  registerFigmaMcpComponentsRoutes(app, {
    readJsonBody: routeDeps.figmaMcpPingDeps.readJsonBody,
  });
  registerFigmaMcpTokenBindingsRoutes(app, {
    readJsonBody: routeDeps.figmaMcpPingDeps.readJsonBody,
  });
  if (deps.db) {
    registerFigmaMcpDependenciesRoutes(app, {
      readJsonBody: routeDeps.figmaMcpPingDeps.readJsonBody,
      db: deps.db,
      getSystemConfig: (c) => {
        const systemHeader = String(c.req.header('x-ds-system') || '');
        const rawRef = String(
          figmaTokenBySystemId.get(systemHeader) || process.env.FIGMA_TOKEN || '',
        );
        return { figmaApiToken: rawRef };
      },
      getSystemConfigByDsFileKey: (dsFileKey) => {
        const rawRef = resolveFigmaTokenRefByDsFileKey(dsFileKey);
        if (!rawRef) return null;
        return { figmaApiToken: rawRef };
      },
    });
  }
  registerFigmaPluginDebugRoute(app, {
    internalToken: process.env.DS_DASHBOARD_INTERNAL_TOKEN,
  });
  registerAiJobsRoutes(app, {
    internalToken: process.env.DS_DASHBOARD_INTERNAL_TOKEN,
    getSystemContext: deps.getSystemContext,
    componentRepo: routeDeps.componentRepo,
  });
  registerComponentDocsRoutes(app, {
    componentRepo: routeDeps.componentRepo,
  });
}
