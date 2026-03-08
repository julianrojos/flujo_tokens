/**
 * Figma MCP Variables Service
 *
 * Fetches Figma variables through an MCP stdio server (figma-console-mcp),
 * without relying on agent prompting.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

import type {
  FigmaVariable,
  FigmaVariableCollection,
  FigmaVariablesResponse,
} from '../utils/figma.js';

const DEFAULT_MCP_TIMEOUT_MS = 15_000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGES = 200;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: number;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
  result?: unknown;
}

interface McpCommand {
  command: string;
  args: string[];
}

interface NormalizedVariablesPage {
  variables: Record<string, FigmaVariable>;
  variableCollections: Record<string, FigmaVariableCollection>;
  hasNextPage: boolean;
}

export interface FetchFigmaVariablesViaMcpOptions {
  fileUrl?: string;
  timeoutMs?: number;
  command?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseCommandArgs(rawValue: string): string[] {
  const trimmed = rawValue.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item));
    }
  } catch {
    // Fallback to plain split when JSON is not provided.
  }

  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const char of trimmed) {
    if (quote === '"') {
      if (escaped) {
        if (char !== '"' && char !== '\\') {
          current += '\\';
        }
        current += char;
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }

    if (quote === "'") {
      if (char === "'") {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (quote) {
    throw new Error('Invalid MCP command args: unterminated quote.');
  }
  if (escaped) {
    current += '\\';
  }
  if (current) {
    args.push(current);
  }

  return args;
}

export function resolveFigmaMcpCommand(
  options: Pick<FetchFigmaVariablesViaMcpOptions, 'command' | 'args' | 'env'> = {},
): McpCommand {
  const env = options.env ?? process.env;
  const explicitCommand = String(options.command || '').trim();
  const explicitArgs = Array.isArray(options.args) ? options.args.map(String) : null;
  if (explicitCommand) {
    return {
      command: explicitCommand,
      args: explicitArgs ?? [],
    };
  }

  const envCommand = String(env.FIGMA_MCP_COMMAND || '').trim();
  if (envCommand) {
    if (
      envCommand.includes(' ') &&
      !env.FIGMA_MCP_COMMAND_ARGS &&
      /^(?:npx|node|pnpm|yarn|bun)\s/.test(envCommand)
    ) {
      console.warn(
        `\n[\x1b[33mWarning\x1b[0m] FIGMA_MCP_COMMAND contains spaces ("${envCommand}") but FIGMA_MCP_COMMAND_ARGS is empty. ` +
        `If this is a legacy configuration (e.g. "npx -y figma-console-mcp"), please move the arguments ` +
        `to FIGMA_MCP_COMMAND_ARGS or use FIGMA_MCP_BIN + FIGMA_MCP_ARGS instead. FIGMA_MCP_COMMAND is now treated as a literal executable path.\n`,
      );
    }
    return {
      command: envCommand,
      args: explicitArgs ?? parseCommandArgs(String(env.FIGMA_MCP_COMMAND_ARGS || '')),
    };
  }

  const envBin = String(env.FIGMA_MCP_BIN || '').trim();
  if (envBin) {
    return {
      command: envBin,
      args: explicitArgs ?? parseCommandArgs(String(env.FIGMA_MCP_ARGS || '')),
    };
  }

  return {
    command: 'npx',
    args: ['-y', 'figma-console-mcp'],
  };
}

function encodeMcpMessage(payload: JsonRpcRequest | JsonRpcNotification): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8');
  return Buffer.concat([header, body]);
}

function stripMarkdownCodeFence(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseToolContentPayload(rawToolResult: unknown): Record<string, unknown> {
  if (!isRecord(rawToolResult)) {
    throw new Error('Invalid MCP tools/call result: expected object.');
  }

  if (isRecord(rawToolResult.structuredContent)) {
    return rawToolResult.structuredContent;
  }

  if (isRecord(rawToolResult.data)) {
    return rawToolResult as Record<string, unknown>;
  }

  const content = Array.isArray(rawToolResult.content) ? rawToolResult.content : [];
  for (const entry of content) {
    if (!isRecord(entry)) continue;
    const text = String(entry.text || '').trim();
    if (!text) continue;
    const normalized = stripMarkdownCodeFence(text);
    try {
      const parsed = JSON.parse(normalized);
      if (isRecord(parsed)) return parsed;
    } catch {
      // keep scanning content blocks
    }
  }

  throw new Error('Unable to parse MCP figma_get_variables payload.');
}

function normalizeCollections(
  rawCollections: unknown,
): Record<string, FigmaVariableCollection> {
  const out: Record<string, FigmaVariableCollection> = {};
  if (Array.isArray(rawCollections)) {
    for (const item of rawCollections) {
      if (!isRecord(item)) continue;
      const id = String(item.id || '').trim();
      if (!id) continue;
      const name = String(item.name || id).trim();
      const modesRaw = Array.isArray(item.modes) ? item.modes : [];
      const modes = modesRaw
        .filter(isRecord)
        .map((mode) => ({
          modeId: String(mode.modeId || mode.id || '').trim(),
          name: String(mode.name || mode.modeId || mode.id || '').trim(),
        }))
        .filter((mode) => mode.modeId);
      out[id] = { id, name, modes };
    }
    return out;
  }

  if (isRecord(rawCollections)) {
    for (const item of Object.values(rawCollections)) {
      if (!isRecord(item)) continue;
      const id = String(item.id || '').trim();
      if (!id) continue;
      const name = String(item.name || id).trim();
      const modesRaw = Array.isArray(item.modes) ? item.modes : [];
      const modes = modesRaw
        .filter(isRecord)
        .map((mode) => ({
          modeId: String(mode.modeId || mode.id || '').trim(),
          name: String(mode.name || mode.modeId || mode.id || '').trim(),
        }))
        .filter((mode) => mode.modeId);
      out[id] = { id, name, modes };
    }
  }

  return out;
}

function normalizeVariables(rawVariables: unknown): Record<string, FigmaVariable> {
  const out: Record<string, FigmaVariable> = {};
  const pushVariable = (item: unknown) => {
    if (!isRecord(item)) return;
    const id = String(item.id || '').trim();
    const name = String(item.name || '').trim();
    const variableCollectionId = String(item.variableCollectionId || '').trim();
    const resolvedType = String(item.resolvedType || '').trim();
    const valuesByMode = isRecord(item.valuesByMode) ? item.valuesByMode : null;
    if (!id || !name || !variableCollectionId || !resolvedType || !valuesByMode) return;
    out[id] = {
      id,
      name,
      variableCollectionId,
      resolvedType,
      valuesByMode,
    };
  };

  if (Array.isArray(rawVariables)) {
    for (const item of rawVariables) pushVariable(item);
    return out;
  }

  if (isRecord(rawVariables)) {
    for (const item of Object.values(rawVariables)) pushVariable(item);
  }

  return out;
}

function normalizeVariablesPage(rawPayload: Record<string, unknown>): NormalizedVariablesPage {
  const data = isRecord(rawPayload.data) ? rawPayload.data : rawPayload;
  const rawVariables =
    data.variables ?? rawPayload.variables ?? data.items ?? rawPayload.items ?? [];
  const rawCollections =
    data.variableCollections ??
    rawPayload.variableCollections ??
    data.collections ??
    rawPayload.collections ??
    [];

  const paginationRecord = isRecord(rawPayload.pagination)
    ? rawPayload.pagination
    : isRecord(data.pagination)
      ? data.pagination
      : {};

  return {
    variables: normalizeVariables(rawVariables),
    variableCollections: normalizeCollections(rawCollections),
    hasNextPage: Boolean(paginationRecord.hasNextPage),
  };
}

function buildToolsCallParams(fileUrl: string | undefined, page: number): Record<string, unknown> {
  const params: Record<string, unknown> = {
    format: 'filtered',
    verbosity: 'full',
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  };
  if (fileUrl) {
    params.fileUrl = fileUrl;
  }
  return params;
}

class McpStdioClient {
  private readonly child: ChildProcessWithoutNullStreams;

  private readonly timeoutMs: number;

  private nextId = 1;

  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();

  private stdoutBuffer = Buffer.alloc(0);

  private expectedBodyLength: number | null = null;

  private stderrBuffer = '';

  constructor(command: McpCommand, timeoutMs: number, env: NodeJS.ProcessEnv | undefined) {
    this.timeoutMs = timeoutMs;
    this.child = spawn(command.command, command.args, {
      stdio: 'pipe',
      env: env ?? process.env,
    });

    this.child.stdout.on('data', (chunk: Buffer) => this.handleStdoutChunk(chunk));
    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderrBuffer += chunk.toString('utf8');
      if (this.stderrBuffer.length > 4_000) {
        this.stderrBuffer = this.stderrBuffer.slice(-4_000);
      }
    });

    this.child.on('error', (error) => {
      this.rejectAllPending(
        new Error(`Failed to start MCP server process: ${error.message}`),
      );
    });

    this.child.on('exit', (code, signal) => {
      if (this.pending.size === 0) return;
      const tail = this.stderrBuffer.trim();
      const details = tail ? `\n${tail}` : '';
      this.rejectAllPending(
        new Error(
          `MCP server exited before responding (code=${String(code)}, signal=${String(signal)}).${details}`,
        ),
      );
    });
  }

  close(): void {
    try {
      this.child.kill('SIGTERM');
    } catch {
      // no-op
    }
  }

  async initialize(): Promise<void> {
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'flujo-tokens-cli',
        version: '1.0.0',
      },
    });
    this.sendNotification('notifications/initialized', {});
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });
    if (!isRecord(result)) {
      throw new Error('Invalid MCP tools/call response: expected result object.');
    }
    return result;
  }

  private sendNotification(method: string, params: Record<string, unknown>): void {
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    this.child.stdin.write(encodeMcpMessage(notification));
  }

  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    const payload: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const tail = this.stderrBuffer.trim();
        const details = tail ? `\n${tail}` : '';
        reject(new Error(`MCP request timed out (${method}).${details}`));
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(encodeMcpMessage(payload));
    });
  }

  private handleStdoutChunk(chunk: Buffer): void {
    this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
    while (true) {
      if (this.expectedBodyLength === null) {
        const separatorIndex = this.stdoutBuffer.indexOf('\r\n\r\n');
        if (separatorIndex < 0) return;
        const headerText = this.stdoutBuffer.slice(0, separatorIndex).toString('utf8');
        const match = /content-length:\s*(\d+)/i.exec(headerText);
        if (!match) {
          this.rejectAllPending(new Error(`Invalid MCP frame headers: ${headerText}`));
          this.close();
          return;
        }
        this.expectedBodyLength = Number(match[1]);
        this.stdoutBuffer = this.stdoutBuffer.slice(separatorIndex + 4);
      }

      if (this.expectedBodyLength === null) return;
      if (this.stdoutBuffer.length < this.expectedBodyLength) return;

      const bodyBuffer = this.stdoutBuffer.slice(0, this.expectedBodyLength);
      this.stdoutBuffer = this.stdoutBuffer.slice(this.expectedBodyLength);
      this.expectedBodyLength = null;

      const rawText = bodyBuffer.toString('utf8').trim();
      if (!rawText) continue;

      let parsed: JsonRpcErrorResponse;
      try {
        parsed = JSON.parse(rawText) as JsonRpcErrorResponse;
      } catch {
        continue;
      }

      if (typeof parsed.id !== 'number') {
        continue;
      }
      const pending = this.pending.get(parsed.id);
      if (!pending) {
        continue;
      }
      clearTimeout(pending.timer);
      this.pending.delete(parsed.id);
      if (parsed.error) {
        pending.reject(
          new Error(
            `MCP error (${String(parsed.error.code || 'unknown')}): ${String(
              parsed.error.message || 'Unknown error',
            )}`,
          ),
        );
        continue;
      }
      pending.resolve(parsed.result);
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

/**
 * Check MCP server connectivity by calling figma_get_status.
 * Throws if the server reports no Figma connection.
 * @param client - MCP stdio client
 * @throws Error if MCP reports no connection to Figma
 */
async function checkMcpConnectivity(client: McpStdioClient): Promise<void> {
  const result = await client.callTool('figma_get_status', {});

  // Try structured fields first (preferred)
  let hasStructuredSignal = false;
  if (isRecord(result)) {
    // Check for explicit connected/disconnected fields
    if (typeof result.connected === 'boolean') {
      hasStructuredSignal = true;
      if (result.connected === false) {
        throw new Error(
          'MCP server reports no Figma connection. Ensure Figma Desktop is open with the Desktop Bridge plugin running.',
        );
      }
    }
    if (isRecord(result.transport)) {
      const transportConnected = result.transport.connected;
      if (typeof transportConnected === 'boolean') {
        hasStructuredSignal = true;
        if (transportConnected === false) {
          throw new Error(
            'MCP server transport reports disconnected. Ensure Figma Desktop is open with the Desktop Bridge plugin running.',
          );
        }
      }
    }
  }

  // If we found a definitive structured boolean, we trust it and early exit.
  if (hasStructuredSignal) {
    return;
  }

  // Fallback to text content parsing
  const content = Array.isArray(result?.content) ? result.content : [];
  const textBlocks: string[] = [];

  // Pass 1: Look for structured signals within text blocks that are valid JSON
  for (const block of content) {
    if (!isRecord(block) || block.type !== 'text') continue;

    const text = String(block.text || '');
    if (!text) continue;
    textBlocks.push(text);

    const normalizedText = stripMarkdownCodeFence(text);
    let parsedFromText: unknown = null;

    try {
      parsedFromText = JSON.parse(normalizedText);
    } catch {
      continue;
    }

    if (isRecord(parsedFromText)) {
      let blockHasStructuredSignal = false;
      if (typeof parsedFromText.connected === 'boolean') {
        blockHasStructuredSignal = true;
        if (parsedFromText.connected === false) {
          throw new Error(
            'MCP server reports no Figma connection. Ensure Figma Desktop is open with the Desktop Bridge plugin running.',
          );
        }
      }
      if (isRecord(parsedFromText.transport)) {
        const transportConnected = parsedFromText.transport.connected;
        if (typeof transportConnected === 'boolean') {
          blockHasStructuredSignal = true;
          if (transportConnected === false) {
            throw new Error(
              'MCP server transport reports disconnected. Ensure Figma Desktop is open with the Desktop Bridge plugin running.',
            );
          }
        }
      }

      // If this JSON block had a valid connected boolean, trust it as the definitive signal.
      if (blockHasStructuredSignal) {
        return;
      }
    }
  }

  // Pass 2: No structured signal was found anywhere. Apply unstructured text heuristics.
  for (const text of textBlocks) {
    if (/not connected|no connection|disconnected/i.test(text)) {
      throw new Error(
        `MCP server reports no Figma connection. Ensure Figma Desktop is open with the Desktop Bridge plugin running. Details: ${text}`,
      );
    }
  }
}

export async function fetchFigmaLocalVariablesViaMcp(
  options: FetchFigmaVariablesViaMcpOptions = {},
): Promise<FigmaVariablesResponse> {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_MCP_TIMEOUT_MS;
  const command = resolveFigmaMcpCommand({
    command: options.command,
    args: options.args,
    env: options.env,
  });

  const client = new McpStdioClient(command, timeoutMs, options.env);
  const variables: Record<string, FigmaVariable> = {};
  const variableCollections: Record<string, FigmaVariableCollection> = {};

  try {
    await client.initialize();

    // Pre-flight connectivity check (non-fatal if tool not supported)
    try {
      await checkMcpConnectivity(client);
    } catch (statusError) {
      const msg = statusError instanceof Error ? statusError.message : String(statusError);
      if (/method not found|unknown tool/i.test(msg)) {
        // MCP server doesn't support figma_get_status, continue without pre-flight
      } else {
        throw statusError;
      }
    }

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const toolResult = await client.callTool(
        'figma_get_variables',
        buildToolsCallParams(options.fileUrl, page),
      );
      if (toolResult.isError === true) {
        throw new Error(`MCP figma_get_variables returned isError=true (page ${page}).`);
      }
      const payload = parseToolContentPayload(toolResult);
      const normalized = normalizeVariablesPage(payload);
      Object.assign(variableCollections, normalized.variableCollections);
      Object.assign(variables, normalized.variables);

      if (!normalized.hasNextPage) {
        break;
      }
      if (page === MAX_PAGES) {
        throw new Error(`MCP pagination exceeded maximum pages (${MAX_PAGES}).`);
      }
    }

    return {
      meta: {
        variableCollections,
        variables,
      },
    };
  } finally {
    client.close();
  }
}
