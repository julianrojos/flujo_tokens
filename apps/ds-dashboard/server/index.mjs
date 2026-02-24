import { serve } from "@hono/node-server";

import { createServerApp } from "./create-server-app.mjs";

const { app, port, disposeDesignSystemRepository } = createServerApp();

function handleProcessShutdown(signal) {
  disposeDesignSystemRepository();
  // eslint-disable-next-line no-console
  console.log(`[ds-dashboard-api] received ${signal}, shutting down`);
  process.exit(0);
}

process.once("SIGINT", () => handleProcessShutdown("SIGINT"));
process.once("SIGTERM", () => handleProcessShutdown("SIGTERM"));

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    // eslint-disable-next-line no-console
    console.log(`[ds-dashboard-api] listening on http://localhost:${info.port}`);
  },
);
