/**
 * Figma MCP Variables Service
 *
 * Fetches Figma variables through an MCP stdio server (figma-console-mcp),
 * without relying on agent prompting.
 */

import {
  execFileSync,
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {
  FigmaVariable,
  FigmaVariableCollection,
  FigmaVariablesResponse,
} from '../utils/figma.js';

// First-time `npx figma-console-mcp` startup can exceed 15s while resolving/installing.
// Use a safer default and allow override via env/options.
const DEFAULT_MCP_TIMEOUT_MS = 60_000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGES = 200;

/**
 * Timeout for dashboard MCP proxy requests.
 *
 * Generous budget (90 s) because the downstream `figma_get_variables` call
 * may page through hundreds of variables while waiting for the Desktop
 * Bridge plugin to respond.
 */
const DASHBOARD_MCP_PROXY_TIMEOUT_MS = 90_000;

/**
 * Temp-file path used to persist the PID of the last spawned shared MCP
 * child process.  On startup we read this file and SIGTERM the stale PID
 * so orphaned processes from crashed/killed server runs are cleaned up.
 * The file is scoped per workspace to avoid cross-repo PID collisions.
 */
function resolveWorkspacePidScope(): string {
  try {
    return fs.realpathSync(process.cwd());
  } catch {
    return process.cwd();
  }
}

function hashPidScope(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 12);
}

const MCP_CHILD_PID_FILE = path.join(
  os.tmpdir(),
  `ds-dashboard-mcp-child-${hashPidScope(resolveWorkspacePidScope())}.pid`,
);
const PROCESS_PROBE_TIMEOUT_MS = 2_000;

interface McpChildPidRecordV1 {
  version: 1;
  ownerPid: number;
  childPid: number;
  timestamp: number;
}

interface McpChildPidLegacyRecord {
  version: 0;
  childPid: number;
}

type McpChildPidState = McpChildPidRecordV1 | McpChildPidLegacyRecord;

function parsePositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const integer = Math.floor(parsed);
  if (integer <= 0) return null;
  return integer;
}

function parseMcpChildPidState(raw: string): McpChildPidState | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Backward compatibility: previous format stored only the child PID as plain text.
  if (!trimmed.startsWith('{')) {
    const childPid = parsePositiveInteger(Number.parseInt(trimmed, 10));
    if (childPid == null) return null;
    return { version: 0, childPid };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const asRecord = parsed as Record<string, unknown>;
    const version = Number(asRecord.version ?? 1);
    if (version !== 1) return null;

    const ownerPid = parsePositiveInteger(asRecord.ownerPid);
    const childPid = parsePositiveInteger(asRecord.childPid);
    if (ownerPid == null || childPid == null) return null;

    const timestampRaw = Number(asRecord.timestamp);
    const timestamp = Number.isFinite(timestampRaw) && timestampRaw > 0
      ? Math.floor(timestampRaw)
      : Date.now();

    return {
      version: 1,
      ownerPid,
      childPid,
      timestamp,
    };
  } catch {
    return null;
  }
}

function readMcpChildPidFile(): McpChildPidState | null {
  try {
    const raw = fs.readFileSync(MCP_CHILD_PID_FILE, 'utf8').trim();
    return parseMcpChildPidState(raw);
  } catch {
    return null;
  }
}

function writeMcpChildPidFile(record: McpChildPidRecordV1): void {
  const payload = JSON.stringify(record);
  const tmpPath = `${MCP_CHILD_PID_FILE}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmpPath, payload, 'utf8');
    try {
      fs.renameSync(tmpPath, MCP_CHILD_PID_FILE);
    } catch {
      // On some platforms rename-overwrite can fail; fallback to replace.
      fs.rmSync(MCP_CHILD_PID_FILE, { force: true });
      fs.renameSync(tmpPath, MCP_CHILD_PID_FILE);
    }
  } catch {
    // no-op
  } finally {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // no-op
    }
  }
}

function clearMcpChildPidFile(expected?: { ownerPid?: number; childPid?: number }): void {
  try {
    if (!expected) {
      fs.unlinkSync(MCP_CHILD_PID_FILE);
      return;
    }

    const currentState = readMcpChildPidFile();
    if (!currentState) return;
    if (expected.childPid != null && currentState.childPid !== expected.childPid) return;
    if (expected.ownerPid != null) {
      if (currentState.version !== 1 || currentState.ownerPid !== expected.ownerPid) {
        return;
      }
    }
    fs.unlinkSync(MCP_CHILD_PID_FILE);
  } catch {
    // no-op
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    return code === 'EPERM';
  }
}

function isFigmaMcpProcessPid(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) {
    return false;
  }
  const probeTimeoutMs = PROCESS_PROBE_TIMEOUT_MS;

  if (process.platform === 'win32') {
    // On Windows, read full command line via CIM so we can validate identity.
    const pidQuery = String(pid);
    const commandLineQuery =
      `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pidQuery}" ` +
      '| Select-Object -ExpandProperty CommandLine)';
    try {
      const command = String(
        execFileSync(
          'powershell.exe',
          ['-NoProfile', '-Command', commandLineQuery],
          {
            encoding: 'utf8',
            timeout: probeTimeoutMs,
          },
        ),
      ).trim();
      if (!command) return false;
      return /figma-console-mcp/i.test(command);
    } catch {
      // Conservative fallback: never kill if identity cannot be verified.
      return false;
    }
  }

  try {
    const command = String(
      execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
        encoding: 'utf8',
        timeout: probeTimeoutMs,
      }),
    ).trim();
    if (!command) return false;
    return /figma-console-mcp/i.test(command);
  } catch {
    return false;
  }
}

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
  connectWaitMs?: number;
  command?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
}

function resolveTimeoutMs(options: FetchFigmaVariablesViaMcpOptions): number {
  const env = options.env ?? process.env;
  const fromOptions = Number(options.timeoutMs);
  if (Number.isFinite(fromOptions) && fromOptions > 0) {
    return fromOptions;
  }

  const fromEnv = Number(String(env.FIGMA_MCP_TIMEOUT_MS || '').trim());
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }

  return DEFAULT_MCP_TIMEOUT_MS;
}

function resolveConnectWaitMs(options: FetchFigmaVariablesViaMcpOptions): number {
  const env = options.env ?? process.env;
  const fromOptions = Number(options.connectWaitMs);
  if (Number.isFinite(fromOptions) && fromOptions >= 0) {
    return Math.floor(fromOptions);
  }

  const fromEnv = Number(String(env.FIGMA_MCP_CONNECT_WAIT_MS || '').trim());
  if (Number.isFinite(fromEnv) && fromEnv >= 0) {
    return Math.floor(fromEnv);
  }

  return 0;
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
  // MCP stdio transport uses newline-delimited JSON (one JSON object per line).
  // The @modelcontextprotocol/sdk StdioServerTransport reads until '\n' and
  // writes JSON.stringify(msg) + '\n'. Content-Length / LSP framing is NOT used.
  return Buffer.from(JSON.stringify(payload) + '\n', 'utf8');
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

  private readonly defaultTimeoutMs: number;

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

  private stderrBuffer = '';

  constructor(command: McpCommand, timeoutMs: number, env: NodeJS.ProcessEnv | undefined) {
    this.defaultTimeoutMs = timeoutMs;
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

    // Persist child PID for orphan cleanup on next server restart.
    if (this.child.pid != null) {
      try {
        writeMcpChildPidFile({
          version: 1,
          ownerPid: process.pid,
          childPid: this.child.pid,
          timestamp: Date.now(),
        });
      } catch {
        // Best-effort: the file may be in a read-only tmpdir on some systems.
      }
    }
  }

  close(): void {
    const childPid = this.child.pid ?? undefined;
    try {
      this.child.kill('SIGTERM');
    } catch {
      // no-op
    } finally {
      // Clear only when this client still owns the persisted PID.
      clearMcpChildPidFile({ ownerPid: process.pid, childPid });
    }
  }

  async initialize(timeoutMs?: number): Promise<void> {
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'flujo-tokens-cli',
        version: '1.0.0',
      },
    }, timeoutMs);
    this.sendNotification('notifications/initialized', {});
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<Record<string, unknown>> {
    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    }, timeoutMs);
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

  private sendRequest(
    method: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    const payload: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };
    const effectiveTimeoutMs =
      Number.isFinite(timeoutMs) && Number(timeoutMs) > 0
        ? Number(timeoutMs)
        : this.defaultTimeoutMs;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const tail = this.stderrBuffer.trim();
        const details = tail ? `\n${tail}` : '';
        reject(new Error(`MCP request timed out (${method}).${details}`));
      }, effectiveTimeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(encodeMcpMessage(payload));
    });
  }

  private handleStdoutChunk(chunk: Buffer): void {
    this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
    while (true) {
      // MCP stdio transport sends one JSON object per line (newline-delimited).
      const newlineIndex = this.stdoutBuffer.indexOf('\n');
      if (newlineIndex < 0) return;

      const lineBuffer = this.stdoutBuffer.slice(0, newlineIndex);
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);

      const rawText = lineBuffer.toString('utf8').trim();
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
async function checkMcpConnectivity(
  client: McpStdioClient,
  timeoutMs?: number,
): Promise<void> {
  const result = await client.callTool('figma_get_status', {}, timeoutMs);

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

function isMcpDisconnectedError(message: string): boolean {
  return /no figma connection|transport reports disconnected|not connected|no connection|disconnected/i.test(
    message,
  );
}

function waitMs(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function ensureMcpConnectivity(
  client: McpStdioClient,
  connectWaitMs: number,
  timeoutMs?: number,
): Promise<void> {
  const budgetMs = Math.max(0, Math.floor(connectWaitMs));
  const startedAt = Date.now();
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      await checkMcpConnectivity(client, timeoutMs);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isMcpDisconnectedError(message)) {
        throw error;
      }
      const elapsedMs = Date.now() - startedAt;
      const remainingMs = budgetMs - elapsedMs;
      if (remainingMs <= 0) {
        throw error;
      }
      // Short bounded backoff to tolerate bridge attach races on fresh MCP startup.
      const delayMs = Math.min(1_000, Math.max(200, Math.floor(remainingMs / Math.max(1, 4 - attempt))));
      await waitMs(Math.min(delayMs, remainingMs));
    }
  }
}

/**
 * Fetch variables by proxying through the dashboard server's shared MCP
 * client.  This avoids spawning a new `figma-console-mcp` child process
 * when the runner is a subprocess of the dashboard.
 *
 * Called automatically when `DS_DASHBOARD_INTERNAL_URL` is set in the env.
 */
async function fetchVariablesViaDashboardProxy(
  baseUrl: string,
  env: NodeJS.ProcessEnv,
  options: FetchFigmaVariablesViaMcpOptions,
): Promise<FigmaVariablesResponse> {
  const internalToken = String(env.DS_DASHBOARD_INTERNAL_TOKEN || '').trim();
  const effectiveTimeoutMs = Math.min(
    resolveTimeoutMs(options),
    DASHBOARD_MCP_PROXY_TIMEOUT_MS,
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, effectiveTimeoutMs);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (internalToken) {
    headers['x-ds-dashboard-internal-token'] = internalToken;
  }

  const body = JSON.stringify({ figmaUrl: options.fileUrl || '' });

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/figma-mcp-variables`, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
  } catch (error) {
    const isAbort =
      error instanceof Error &&
      error.name.trim().toLowerCase() === 'aborterror';
    if (isAbort) {
      throw new Error(
        `Dashboard MCP proxy timed out after ${effectiveTimeoutMs}ms`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(
      `Dashboard MCP proxy request failed (${response.status} ${response.statusText})`,
    );
  }

  const json = (await response.json()) as {
    ok: boolean;
    meta?: FigmaVariablesResponse['meta'];
    message?: string;
    code?: string;
  };

  if (!json.ok || !json.meta) {
    throw new Error(
      json.message ||
        `Dashboard MCP proxy returned ok=false (code: ${json.code || 'unknown'})`,
    );
  }

  return { meta: json.meta } as FigmaVariablesResponse;
}

export async function fetchFigmaLocalVariablesViaMcp(
  options: FetchFigmaVariablesViaMcpOptions = {},
): Promise<FigmaVariablesResponse> {
  // ── Dashboard proxy shortcut ──────────────────────────────────────────
  // When this process was spawned by the dashboard server,
  // DS_DASHBOARD_INTERNAL_URL is set.  Route the request through the
  // server's shared MCP client instead of spawning a new child process.
  const env = options.env ?? process.env;
  const dashboardUrl = String(env.DS_DASHBOARD_INTERNAL_URL || '').trim();
  if (dashboardUrl) {
    return fetchVariablesViaDashboardProxy(dashboardUrl, env, options);
  }

  const timeoutMs = resolveTimeoutMs(options);
  const connectWaitMs = resolveConnectWaitMs(options);
  const command = resolveFigmaMcpCommand({
    command: options.command,
    args: options.args,
    env: options.env,
  });

  const client = new McpStdioClient(command, timeoutMs, options.env);
  const variables: Record<string, FigmaVariable> = {};
  const variableCollections: Record<string, FigmaVariableCollection> = {};

  try {
    await client.initialize(timeoutMs);

    // Pre-flight connectivity check (non-fatal if tool not supported)
    try {
      await ensureMcpConnectivity(client, connectWaitMs, timeoutMs);
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
        timeoutMs,
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

export interface PingSharedFigmaMcpOptions extends FetchFigmaVariablesViaMcpOptions {}

export interface PingSharedFigmaMcpResult {
  ok: boolean;
  connected: boolean;
  code?: string;
  message: string;
  collectionsDetected?: number;
  variablesDetected?: number;
  /**
   * True if Desktop Bridge has successfully connected at least once during
   * this server session. Used by the UI to distinguish "never connected" from
   * "was connected, now lost" and show context-appropriate guidance.
   */
  everConnected: boolean;
}

interface SharedMcpClientState {
  signature: string;
  client: McpStdioClient;
}

let sharedMcpClientState: SharedMcpClientState | null = null;

/**
 * Set to true the first time a ping returns connected=true in this server
 * session. Intentionally NOT reset when the shared client is disposed/restarted
 * so it reflects "Desktop Bridge connected at some point", not "connected now".
 */
let everConnectedToDesktopBridge = false;

function buildSharedClientSignature(args: {
  command: McpCommand;
  env: NodeJS.ProcessEnv | undefined;
}): string {
  const env = args.env ?? process.env;
  // Any change in these fields can alter connectivity/runtime behaviour, so force a restart.
  const envSignature = [
    String(env.FIGMA_ACCESS_TOKEN || ''),
    String(env.FIGMA_WS_HOST || ''),
    String(env.FIGMA_WS_PORT || ''),
    String(env.FIGMA_MCP_COMMAND || ''),
    String(env.FIGMA_MCP_COMMAND_ARGS || ''),
    String(env.FIGMA_MCP_BIN || ''),
    String(env.FIGMA_MCP_ARGS || ''),
  ].join('|');
  return `${args.command.command}\u0000${args.command.args.join('\u0001')}\u0000${envSignature}`;
}

function disposeSharedClientState(): void {
  if (!sharedMcpClientState) return;
  try {
    sharedMcpClientState.client.close();
  } catch {
    // no-op
  } finally {
    sharedMcpClientState = null;
  }
}

async function getOrCreateSharedMcpClient(
  options: PingSharedFigmaMcpOptions,
): Promise<McpStdioClient> {
  const timeoutMs = resolveTimeoutMs(options);
  const command = resolveFigmaMcpCommand({
    command: options.command,
    args: options.args,
    env: options.env,
  });
  const signature = buildSharedClientSignature({ command, env: options.env });

  if (sharedMcpClientState && sharedMcpClientState.signature === signature) {
    return sharedMcpClientState.client;
  }

  // Kill any orphaned MCP child process from a previous server run.
  // This handles the case where the server crashed or was killed before
  // the shared client state was set (e.g., during warmup).
  const staleState = readMcpChildPidFile();
  if (staleState?.version === 1) {
    const staleOwnerPid = staleState.ownerPid;
    const staleChildPid = staleState.childPid;
    const ownedByCurrentProcess = staleOwnerPid === process.pid;
    const ownerAlive = ownedByCurrentProcess ? true : isProcessAlive(staleOwnerPid);
    const shouldCleanup = ownedByCurrentProcess || !ownerAlive;

    if (shouldCleanup) {
      try {
        if (isFigmaMcpProcessPid(staleChildPid)) {
          process.kill(staleChildPid, 'SIGTERM');
        }
      } catch {
        // PID already dead or permission error — both are safe to ignore.
      } finally {
        // Don't keep stale data around for subsequent startups.
        clearMcpChildPidFile({
          ownerPid: staleOwnerPid,
          childPid: staleChildPid,
        });
      }
    }
  } else if (staleState?.version === 0) {
    // Legacy migration path: previous versions persisted only child PID.
    // Best-effort cleanup on first run after upgrade, with identity check
    // to avoid killing unrelated recycled PIDs.
    const legacyChildPid = staleState.childPid;
    try {
      if (isFigmaMcpProcessPid(legacyChildPid)) {
        process.kill(legacyChildPid, 'SIGTERM');
      }
    } catch {
      // PID already dead or permission error — both are safe to ignore.
    } finally {
      clearMcpChildPidFile({ childPid: legacyChildPid });
    }
  }

  disposeSharedClientState();
  const client = new McpStdioClient(command, timeoutMs, options.env);
  try {
    await client.initialize(timeoutMs);
  } catch (error) {
    client.close();
    throw error;
  }
  sharedMcpClientState = { signature, client };
  return client;
}

function shouldRestartSharedClient(message: string): boolean {
  return /exited before responding|econnreset|epipe|write after end|failed to start mcp server process/i.test(
    message,
  );
}

interface McpDisconnectedDiagnostics {
  currentPort?: number;
  preferredPort?: number;
  portFallbackUsed: boolean;
  otherInstancePorts: number[];
}

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.floor(parsed);
}

function parseMcpDisconnectedDiagnostics(message: string): McpDisconnectedDiagnostics | null {
  const marker = 'Details:';
  const markerIndex = message.lastIndexOf(marker);
  if (markerIndex < 0) return null;
  const rawDetails = message.slice(markerIndex + marker.length).trim();
  if (!rawDetails.startsWith('{')) return null;

  let parsedDetails: unknown;
  try {
    parsedDetails = JSON.parse(rawDetails);
  } catch {
    return null;
  }
  if (!isRecord(parsedDetails)) return null;

  const transport = isRecord(parsedDetails.transport) ? parsedDetails.transport : null;
  const websocket =
    transport && isRecord(transport.websocket) ? transport.websocket : null;
  if (!websocket) return null;

  const otherInstancePorts = Array.isArray(websocket.otherInstances)
    ? websocket.otherInstances
        .map((entry) => (isRecord(entry) ? toFiniteNumber(entry.port) : undefined))
        .filter((port): port is number => typeof port === 'number')
    : [];

  return {
    currentPort: toFiniteNumber(websocket.port),
    preferredPort: toFiniteNumber(websocket.preferredPort),
    portFallbackUsed: websocket.portFallbackUsed === true,
    otherInstancePorts,
  };
}

export function classifyMcpPingError(message: string): { code: string; message: string } {
  const normalized = String(message || '').trim();
  const lower = normalized.toLowerCase();
  if (isMcpDisconnectedError(lower)) {
    const diagnostics = parseMcpDisconnectedDiagnostics(normalized);
    if (
      diagnostics &&
      diagnostics.portFallbackUsed &&
      diagnostics.otherInstancePorts.length > 0
    ) {
      const currentPortLabel =
        typeof diagnostics.currentPort === 'number'
          ? String(diagnostics.currentPort)
          : 'unknown';
      const otherPortsLabel = diagnostics.otherInstancePorts
        .map((port) => String(port))
        .join(', ');
      return {
        code: 'mcp.instance_mismatch',
        message:
          `MCP server started on fallback port ${currentPortLabel}, while other MCP instances are active (${otherPortsLabel}). ` +
          'Desktop Bridge is likely connected to another instance. Close duplicate MCP sessions or restart Desktop Bridge after starting this dashboard.',
      };
    }
    return {
      code: 'mcp.not_connected',
      message:
        'MCP server is running, but it is not connected to Figma Desktop (Desktop Bridge/CDP unavailable).',
    };
  }
  if (lower.includes('timed out')) {
    return {
      code: 'mcp.timeout',
      message: 'MCP request timed out while checking connectivity.',
    };
  }
  return {
    code: 'mcp.error',
    message: normalized || 'Unknown MCP error.',
  };
}

/**
 * Shared MCP ping that reuses a long-lived MCP client process across calls.
 * This avoids spawning a fresh MCP server process for every single request.
 */
export async function pingSharedFigmaMcp(
  options: PingSharedFigmaMcpOptions = {},
): Promise<PingSharedFigmaMcpResult> {
  const timeoutMs = resolveTimeoutMs(options);
  const connectWaitMs = resolveConnectWaitMs(options);

  const executePing = async (): Promise<PingSharedFigmaMcpResult> => {
    const client = await getOrCreateSharedMcpClient(options);
    await ensureMcpConnectivity(client, connectWaitMs, timeoutMs);
    everConnectedToDesktopBridge = true;
    return {
      ok: true,
      connected: true,
      everConnected: true,
      message: 'MCP connection is healthy.',
    };
  };

  try {
    return await executePing();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (shouldRestartSharedClient(message)) {
      disposeSharedClientState();
      try {
        return await executePing();
      } catch (retryError) {
        const retryMessage =
          retryError instanceof Error ? retryError.message : String(retryError);
        const classified = classifyMcpPingError(retryMessage);
        return {
          ok: false,
          connected: false,
          everConnected: everConnectedToDesktopBridge,
          code: classified.code,
          message: classified.message,
        };
      }
    }
    const classified = classifyMcpPingError(message);
    return {
      ok: false,
      connected: false,
      everConnected: everConnectedToDesktopBridge,
      code: classified.code,
      message: classified.message,
    };
  }
}

export function disposeSharedFigmaMcpClient(): void {
  disposeSharedClientState();
}

/**
 * Pre-warm the shared MCP client by creating it eagerly in the background.
 *
 * Call this at server startup so the `figma-console-mcp` process is already
 * running (and the Desktop Bridge plugin can discover and connect to it) by
 * the time the user interacts with the UI.  Without pre-warming the client is
 * created lazily on the first ping request, which can cause a cold-start
 * timeout if npx needs to download a new version of figma-console-mcp.
 *
 * Errors are silently suppressed — warmup failure is non-fatal and the next
 * explicit ping will retry.
 *
 * @param options - Same options as pingSharedFigmaMcp.  Use a generous
 *   timeoutMs (≥ 90 s) to accommodate first-time npx package downloads.
 */
export function warmupSharedFigmaMcpClient(options: PingSharedFigmaMcpOptions = {}): void {
  // No-op if a matching client is already alive.
  const command = resolveFigmaMcpCommand({
    command: options.command,
    args: options.args,
    env: options.env,
  });
  const signature = buildSharedClientSignature({ command, env: options.env });
  if (sharedMcpClientState && sharedMcpClientState.signature === signature) {
    return;
  }

  // Fire-and-forget: spawn the process in the background and cache it.
  getOrCreateSharedMcpClient(options).catch(() => {
    // Warmup failure is expected on first boot (e.g. download in progress).
    // disposeSharedClientState() is NOT called here so the partially-started
    // process can still settle and be reused by the next explicit ping.
  });
}

/**
 * Fetch Figma local variables using the shared (long-lived) MCP client.
 *
 * Unlike `fetchFigmaLocalVariablesViaMcp`, this function does NOT spawn a
 * fresh `figma-console-mcp` process — it reuses the one that the server
 * already manages (and that the Desktop Bridge plugin is connected to).
 * This is the preferred path when running inside the dashboard server.
 */
export async function fetchVariablesFromSharedMcpClient(
  options: Pick<FetchFigmaVariablesViaMcpOptions, 'fileUrl' | 'timeoutMs' | 'connectWaitMs'> = {},
): Promise<FigmaVariablesResponse> {
  const timeoutMs = resolveTimeoutMs(options);
  const connectWaitMs = resolveConnectWaitMs(options);

  const doFetch = async (): Promise<FigmaVariablesResponse> => {
    const client = await getOrCreateSharedMcpClient(options);
    await ensureMcpConnectivity(client, connectWaitMs, timeoutMs);

    const variables: Record<string, FigmaVariable> = {};
    const variableCollections: Record<string, FigmaVariableCollection> = {};

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const toolResult = await client.callTool(
        'figma_get_variables',
        buildToolsCallParams(options.fileUrl, page),
        timeoutMs,
      );
      if (toolResult.isError === true) {
        throw new Error(`MCP figma_get_variables returned isError=true (page ${page}).`);
      }
      const payload = parseToolContentPayload(toolResult);
      const normalized = normalizeVariablesPage(payload);
      Object.assign(variableCollections, normalized.variableCollections);
      Object.assign(variables, normalized.variables);

      if (!normalized.hasNextPage) break;
      if (page === MAX_PAGES) {
        throw new Error(`MCP pagination exceeded maximum pages (${MAX_PAGES}).`);
      }
    }

    return { meta: { variableCollections, variables } };
  };

  try {
    return await doFetch();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (shouldRestartSharedClient(message)) {
      disposeSharedClientState();
      return await doFetch();
    }
    throw error;
  }
}
