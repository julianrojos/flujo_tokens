/**
 * Register All Routes
 *
 * Registers all API routes on the Hono application.
 */

import type { Hono, Context } from 'hono';

import { registerSystemRoutes } from './system-routes.mjs';
import { registerOperationsRoutes } from './operations-routes.mjs';
import { registerRegistryRoutes } from './registry-routes.mjs';
import { registerTokenGraphRoutes } from './token-graph-routes.mjs';
import { registerHealthRoutes } from './health-routes.mjs';
import { registerAnalysisRoutes } from './analysis-routes.mjs';
import { registerComponentSpecRoutes } from './component-spec-routes.mjs';
import { registerFileRoutes } from './file-routes.mjs';
import { registerJobRoutes } from './job-routes.mjs';
import { registerCommandRoutes } from './command-routes.mjs';
import { registerFigmaPingRoute } from './figma-ping-route.mjs';
import { registerFigmaMcpPingRoute } from './figma-legacy-ping-route.ts';
import { registerFigmaMcpResetRoute } from './figma-legacy-reset-route.ts';
import { registerFigmaMcpReconcileRoute } from './figma-legacy-reconcile-route.ts';
import { registerFigmaMcpVariablesRoute } from './figma-mcp-variables-route.ts';
import { registerFigmaMcpPortRoute } from './figma-mcp-port-route.ts';
import { registerFigmaMcpSearchNodesRoute } from './figma-mcp-search-nodes-route.ts';
import { registerFigmaMcpCapabilitiesRoute } from './figma-mcp-capabilities-route.ts';
import { registerFigmaMcpSurgicalQueriesRoutes } from './figma-mcp-surgical-queries-route.ts';
import { registerFigmaMcpDesignSystemKitRoute } from './figma-mcp-design-system-kit-route.ts';
import { registerFigmaMcpHeartbeatRoute } from './figma-mcp-heartbeat-route.ts';
import { registerFigmaMcpConsoleLogsRoute } from './figma-mcp-console-logs-route.ts';
import { registerFigmaMcpDesignChangesRoute } from './figma-mcp-design-changes-route.ts';
import { registerFigmaMcpSelectionRoute } from './figma-mcp-selection-route.ts';
import { registerFigmaPluginDebugRoute } from './figma-plugin-debug-route.ts';
import { registerFigmaMcpVariablesV2Routes } from './figma-mcp-variables-v2-route.ts';
import { registerFigmaMcpComponentsRoutes } from './figma-mcp-components-route.ts';
import { registerFigmaMcpTokenBindingsRoutes } from './figma-mcp-token-bindings-route.ts';
import { buildAllRouteDeps, type ServerDeps } from '../lib/register-all-routes-service.ts';
import { verifyMcpPort } from '../services/figma-mcp-port-verify.ts';
import { getPluginConnectionManager } from '../services/plugin-connection-manager.ts';

export function registerAllRoutes(app: Hono, deps: ServerDeps): void {
  const routeDeps = buildAllRouteDeps(deps);

  registerSystemRoutes(app, routeDeps.systemDeps);
  registerOperationsRoutes(app, routeDeps.operationsDeps);
  registerRegistryRoutes(app, routeDeps.registryDeps);
  registerTokenGraphRoutes(app, routeDeps.tokenGraphDeps);
  registerHealthRoutes(app, routeDeps.healthDeps);
  registerAnalysisRoutes(app, routeDeps.analysisDeps);
  registerComponentSpecRoutes(app, routeDeps.componentSpecDeps);
  registerFileRoutes(app, routeDeps.fileDeps);
  registerJobRoutes(app, routeDeps.jobDeps);
  registerCommandRoutes(app, routeDeps.commandDeps);
  registerFigmaPingRoute(app, routeDeps.figmaPingDeps);
  registerFigmaMcpPingRoute(app, routeDeps.figmaMcpPingDeps);
  registerFigmaMcpResetRoute(app);
  registerFigmaMcpReconcileRoute(app);
  registerFigmaMcpVariablesRoute(app, routeDeps.figmaMcpPingDeps);
  registerFigmaMcpPortRoute(app, {
    ...routeDeps.figmaMcpPingDeps,
    verifyMcpPortFn: verifyMcpPort,
  });
  registerFigmaMcpSearchNodesRoute(app, routeDeps.figmaMcpPingDeps);
  registerFigmaMcpCapabilitiesRoute(app, routeDeps.figmaMcpPingDeps);
  registerFigmaMcpHeartbeatRoute(app);
  registerFigmaMcpConsoleLogsRoute(app);
  registerFigmaMcpDesignChangesRoute(app);
  registerFigmaMcpSelectionRoute(app);
  registerFigmaMcpSurgicalQueriesRoutes(app, routeDeps.figmaMcpPingDeps);
  registerFigmaMcpDesignSystemKitRoute(app, routeDeps.figmaMcpPingDeps);
  registerFigmaMcpVariablesV2Routes(app, routeDeps.figmaMcpPingDeps);
  registerFigmaMcpComponentsRoutes(app, routeDeps.figmaMcpPingDeps);
  registerFigmaMcpTokenBindingsRoutes(app, routeDeps.figmaMcpPingDeps);
  registerFigmaPluginDebugRoute(app, {
    internalToken: process.env.DS_DASHBOARD_INTERNAL_TOKEN,
  });
}
