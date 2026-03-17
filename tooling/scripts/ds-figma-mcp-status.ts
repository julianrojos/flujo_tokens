#!/usr/bin/env node

/**
 * Figma MCP Status script entrypoint.
 *
 * Runs the TypeScript status runner directly.
 */

import { runFigmaMcpStatus } from '../src/runners/figma-mcp-status-runner.js';

runFigmaMcpStatus(process.argv.slice(2)).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
