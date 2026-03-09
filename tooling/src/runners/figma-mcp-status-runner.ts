#!/usr/bin/env node

/**
 * Figma MCP Status Runner
 *
 * Lightweight diagnostic runner that validates MCP connectivity to Figma Desktop
 * and reports variable/collection counts when available.
 */

import { parseArgs, printUsage } from '../utils/parse-args.js';
import {
  classifyMcpPingError,
  fetchFigmaLocalVariablesViaMcp,
} from '../services/figma-mcp-variables.js';

const CLI_CONFIG = {
  command: 'ds:figma-mcp-status [options]',
  description:
    'Checks whether Figma MCP can connect to Figma Desktop and reads variable metadata.',
  options: [
    {
      name: '--url <figma-url>',
      description:
        'Optional Figma file URL. When provided, variables are scoped to that file.',
    },
    {
      name: '--format <json>',
      description: 'Output format. Only "json" is supported.',
      defaultValue: 'json',
    },
    {
      name: '--timeout-ms <number>',
      description: 'MCP timeout in milliseconds (default: service default).',
    },
    {
      name: '--wait-for-connection-ms <number>',
      description:
        'Max wait budget for Desktop Bridge attach before failing as disconnected (default: 0).',
    },
    {
      name: '--help',
      description: 'Show this help message.',
    },
  ],
};

type McpStatusPayload = {
  ok: boolean;
  connected: boolean;
  code?: string;
  message: string;
  collectionsDetected?: number;
  variablesDetected?: number;
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function printJson(payload: McpStatusPayload): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function parseTimeoutMs(rawValue: unknown): number | undefined {
  if (rawValue === undefined || rawValue === null || rawValue === '') return undefined;
  const parsed = Number.parseInt(String(rawValue), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid --timeout-ms value: ${String(rawValue)}. Must be a positive integer.`);
  }
  return parsed;
}

function parseWaitForConnectionMs(rawValue: unknown): number | undefined {
  if (rawValue === undefined || rawValue === null || rawValue === '') return undefined;
  const parsed = Number.parseInt(String(rawValue), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(
      `Invalid --wait-for-connection-ms value: ${String(rawValue)}. Must be a non-negative integer.`,
    );
  }
  return parsed;
}

export async function runFigmaMcpStatus(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const format = String(parsed.format || 'json').trim().toLowerCase();
  if (format !== 'json') {
    printJson({
      ok: false,
      connected: false,
      code: 'mcp.invalid_format',
      message: `Unsupported format "${format}". Only "json" is supported.`,
    });
    process.exit(1);
  }

  try {
    const timeoutMs = parseTimeoutMs(parsed['timeout-ms']);
    const connectWaitMs = parseWaitForConnectionMs(parsed['wait-for-connection-ms']);
    const response = await fetchFigmaLocalVariablesViaMcp({
      fileUrl: String(parsed.url || '').trim() || undefined,
      timeoutMs,
      connectWaitMs,
    });
    const collectionsDetected = Object.keys(response.meta?.variableCollections || {}).length;
    const variablesDetected = Object.keys(response.meta?.variables || {}).length;
    printJson({
      ok: true,
      connected: true,
      message: 'MCP connection is healthy.',
      collectionsDetected,
      variablesDetected,
    });
    process.exit(0);
  } catch (error) {
    const classified = classifyMcpPingError(toErrorMessage(error));
    printJson({
      ok: false,
      connected: false,
      code: classified.code,
      message: classified.message,
    });
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFigmaMcpStatus(process.argv.slice(2)).catch((error) => {
    const classified = classifyMcpPingError(toErrorMessage(error));
    printJson({
      ok: false,
      connected: false,
      code: classified.code,
      message: classified.message,
    });
    process.exit(1);
  });
}
