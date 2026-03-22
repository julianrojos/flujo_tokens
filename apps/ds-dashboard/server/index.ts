/**
 * Dashboard Server Entry Point
 *
 * Main entry point for the design system dashboard API server.
 */

import http from 'node:http';
import { getRequestListener } from '@hono/node-server';

import { createServerApp } from './create-server-app.ts';
import { createFigmaPluginWsServer } from './services/figma-plugin-ws-server.ts';

const { app, port, host, disposeDesignSystemRepository } = createServerApp();
const displayHost =
  host.includes(':') && !(host.startsWith('[') && host.endsWith(']'))
    ? `[${host}]`
    : host;

function handleProcessShutdown(signal: string): void {
  disposeDesignSystemRepository();
  console.log(`[ds-dashboard-api] received ${signal}, shutting down`);
  process.exit(0);
}

process.once('SIGINT', () => handleProcessShutdown('SIGINT'));
process.once('SIGTERM', () => handleProcessShutdown('SIGTERM'));

// Get the request listener from Hono
const requestListener = await getRequestListener(
  app.fetch, // This is the fetch callback
  { hostname: host }
);

// Create HTTP server with the request listener
const httpServer = http.createServer(requestListener);

// Create WebSocket server for Figma plugin connections
// This attaches its own upgrade handler that only processes /ws/figma-plugin
// Other upgrade paths are destroyed to prevent orphaned connections
createFigmaPluginWsServer(httpServer);

// Start the server
httpServer.listen(port, host, () => {
  console.log(`[ds-dashboard-api] listening on http://${displayHost}:${port}`);
  if (host !== '0.0.0.0' && host !== '::') {
    console.log(
      '[ds-dashboard-api] loopback-only binding active. Set DS_DASHBOARD_API_HOST=0.0.0.0 to allow LAN access.',
    );
  }
});
