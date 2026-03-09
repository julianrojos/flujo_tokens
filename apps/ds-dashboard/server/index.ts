/**
 * Dashboard Server Entry Point
 *
 * Main entry point for the design system dashboard API server.
 */

import { serve } from '@hono/node-server';

import { createServerApp } from './create-server-app.ts';

const { app, port, host, disposeDesignSystemRepository } = createServerApp();
const displayHost =
  host.includes(':') && !(host.startsWith('[') && host.endsWith(']'))
    ? `[${host}]`
    : host;

function handleProcessShutdown(signal: string): void {
  disposeDesignSystemRepository();
  // eslint-disable-next-line no-console
  console.log(`[ds-dashboard-api] received ${signal}, shutting down`);
  process.exit(0);
}

process.once('SIGINT', () => handleProcessShutdown('SIGINT'));
process.once('SIGTERM', () => handleProcessShutdown('SIGTERM'));

serve(
  {
    fetch: app.fetch,
    port,
    hostname: host,
  },
  (info) => {
    // eslint-disable-next-line no-console
    console.log(`[ds-dashboard-api] listening on http://${displayHost}:${info.port}`);
    if (host !== '0.0.0.0' && host !== '::') {
      // eslint-disable-next-line no-console
      console.log(
        '[ds-dashboard-api] loopback-only binding active. Set DS_DASHBOARD_API_HOST=0.0.0.0 to allow LAN access.',
      );
    }
  }
);
