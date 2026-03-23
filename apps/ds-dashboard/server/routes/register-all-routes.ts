/**
 * Register All Routes
 *
 * Registers all API routes on the Hono application.
 */

import type { Hono } from 'hono';

import { registerSystemRoutes } from './system-routes.mjs';
import { registerOperationsRoutes } from './operations-routes.mjs';
import { registerRegistryRoutes } from './registry-routes.mjs';
import { registerTokenGraphRoutes } from './token-graph-routes.ts';
import { registerHealthRoutes } from './health-routes.mjs';
import { registerAnalysisRoutes } from './analysis-routes.mjs';
import { registerComponentSpecRoutes } from './component-spec-routes.mjs';
import { registerFileRoutes } from './file-routes.mjs';
import { registerJobRoutes } from './job-routes.mjs';
import { registerCommandRoutes } from './command-routes.mjs';
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
    getSystemContext: (systemHeader) => {
      const context = deps.getSystemContext(systemHeader);
      if (!isRecord(context)) {
        throw new TypeError('commandDeps.getSystemContext must return an object');
      }
      return {
        repoRoot: ensureString(context.repoRoot, 'commandDeps.getSystemContext.repoRoot'),
        systemId: ensureString(context.systemId, 'commandDeps.getSystemContext.systemId'),
        healthSnapshotScriptPath: ensureString(
          context.healthSnapshotScriptPath,
          'commandDeps.getSystemContext.healthSnapshotScriptPath',
        ),
        tokensFromFigmaScriptPath: ensureString(
          context.tokensFromFigmaScriptPath,
          'commandDeps.getSystemContext.tokensFromFigmaScriptPath',
        ),
        captureFromFigmaUrlScriptPath: ensureString(
          context.captureFromFigmaUrlScriptPath,
          'commandDeps.getSystemContext.captureFromFigmaUrlScriptPath',
        ),
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
    enqueueRefreshNamingDebtJob: (args) => {
      const job = deps.enqueueRefreshNamingDebtJob(args);
      if (!isRecord(job) || typeof job.id !== 'string') {
        throw new TypeError('commandDeps.enqueueRefreshNamingDebtJob must return { id: string }');
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
    toBooleanString: deps.toBooleanString,
    toNumberString: deps.toNumberString,
    validateGitRef: deps.validateGitRef,
  };
}

type DesignSystemConfigShape = {
  systems?: Array<{ figmaFileId?: unknown; figmaApiToken?: unknown }>;
};

type ReadConfigRepoShape = {
  readConfig?: () => DesignSystemConfigShape;
};

function hasReadConfigRepo(value: unknown): value is ReadConfigRepoShape {
  return typeof value === 'object' && value !== null && typeof (value as ReadConfigRepoShape).readConfig === 'function';
}

export function registerAllRoutes(app: Hono, deps: ServerDeps): void {
  const routeDeps = buildAllRouteDeps(deps);
  const resolveFigmaTokenRefByDsFileKey = (dsFileKey: string): string => {
    const normalizedDsFileKey = String(dsFileKey || '').trim();
    if (!normalizedDsFileKey) return '';
    if (!hasReadConfigRepo(deps.designSystemRepository)) return '';
    try {
      const config = deps.designSystemRepository.readConfig();
      const systems = Array.isArray(config?.systems) ? config.systems : [];
      const matchedSystem = systems.find(
        (system) => String(system?.figmaFileId || '').trim() === normalizedDsFileKey,
      );
      return String(matchedSystem?.figmaApiToken || '').trim();
    } catch (error) {
      console.warn(
        `[register-all-routes] Failed to resolve Figma token for dsFileKey="${normalizedDsFileKey}"`,
        error,
      );
      return '';
    }
  };

  registerSystemRoutes(app, routeDeps.systemDeps);
  registerOperationsRoutes(app, routeDeps.operationsDeps);
  registerRegistryRoutes(app, routeDeps.registryDeps);
  registerTokenGraphRoutes(app, routeDeps.tokenGraphDeps);
  registerHealthRoutes(app, routeDeps.healthDeps);
  registerAnalysisRoutes(app, routeDeps.analysisDeps);
  registerComponentSpecRoutes(app, routeDeps.componentSpecDeps);
  registerFileRoutes(app, routeDeps.fileDeps);
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
        const context = deps.getSystemContext(systemHeader) as Record<string, unknown>;
        const rawRef = String(context?.figmaApiToken || process.env.FIGMA_TOKEN || '');
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
  });
}
