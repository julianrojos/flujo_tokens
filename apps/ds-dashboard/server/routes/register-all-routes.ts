/**
 * Register All Routes
 *
 * Registers all API routes on the Hono application.
 */

import type { Hono } from 'hono';

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
import { registerFigmaMcpPingRoute } from './figma-mcp-ping-route.ts';
import { registerFigmaMcpResetRoute } from './figma-mcp-reset-route.ts';
import { registerFigmaMcpVariablesRoute } from './figma-mcp-variables-route.ts';
import { buildAllRouteDeps, type ServerDeps } from '../lib/register-all-routes-service.ts';

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
  registerFigmaMcpVariablesRoute(app, routeDeps.figmaMcpPingDeps);
}
