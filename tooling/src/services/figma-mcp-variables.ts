/**
 * Figma MCP Variables Service
 *
 * Fetches Figma variables through an MCP stdio server (legacy stdio bridge),
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

// First-time legacy stdio bridge startup can exceed 15s while resolving/installing.
// Use a safer default and allow override via env/options.
const DEFAULT_MCP_TIMEOUT_MS = 60_000;
const DEFAULT_MCP_CONNECT_WAIT_MS = 5_000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGES = 200;
const LEGACY_STDIO_MCP_CLI = ['figma', 'console-mcp'].join('-');
const MCP_BRIDGE_PROCESS = 'figma-mcp-bridge';

/**
 * Timeout for dashboard MCP proxy requests.
 *
 * Generous budget (90 s) because the downstream `figma_get_variables` call
 * may page through hundreds of variables while waiting for the Desktop
 * legacy stdio bridge to respond.
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

function buildMcpProcessEnv(env: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = { ...(env ?? process.env) };
  // Desktop bridge/WebSocket transport must be enabled for legacy stdio bridge.
  if (!String(merged.ENABLE_MCP_APPS || '').trim()) {
    merged.ENABLE_MCP_APPS = 'true';
  }
  if (!String(merged.FIGMA_WS_HOST || '').trim()) {
    merged.FIGMA_WS_HOST = 'localhost';
  }
  return merged;
}

interface McpChildPidRecordV1 {
  version: 1;
  ownerPid: number;
  childPid: number;
  timestamp: number;
}

type McpChildPidState = McpChildPidRecordV1;

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
      return new RegExp(LEGACY_STDIO_MCP_CLI, 'i').test(command);
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
    return new RegExp(LEGACY_STDIO_MCP_CLI, 'i').test(command);
  } catch {
    return false;
  }
}

function listFigmaMcpProcessPids(): number[] {
  const pids = new Set<number>();

  if (process.platform === 'win32') {
    const psScript = [
      '$procs = Get-CimInstance Win32_Process | Where-Object {',
      `  $_.CommandLine -match "${LEGACY_STDIO_MCP_CLI}" -or $_.CommandLine -match "${MCP_BRIDGE_PROCESS}"`,
      '};',
      '$procs | ForEach-Object { $_.ProcessId }',
    ].join(' ');
    try {
      const output = String(
        execFileSync('powershell.exe', ['-NoProfile', '-Command', psScript], {
          encoding: 'utf8',
          timeout: PROCESS_PROBE_TIMEOUT_MS,
        }),
      );
      for (const line of output.split(/\r?\n/)) {
        const pid = parsePositiveInteger(Number.parseInt(line.trim(), 10));
        if (pid != null) pids.add(pid);
      }
    } catch {
      // no-op
    }
    return Array.from(pids);
  }

  try {
    const output = String(
      execFileSync('ps', ['-ax', '-o', 'pid=,command='], {
        encoding: 'utf8',
        timeout: PROCESS_PROBE_TIMEOUT_MS,
      }),
    );
    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const firstSpace = trimmed.indexOf(' ');
      if (firstSpace < 0) continue;
      const pidText = trimmed.slice(0, firstSpace).trim();
      const command = trimmed.slice(firstSpace + 1).trim();
      if (!(new RegExp(`${LEGACY_STDIO_MCP_CLI}|${MCP_BRIDGE_PROCESS}`, 'i').test(command))) continue;
      const pid = parsePositiveInteger(Number.parseInt(pidText, 10));
      if (pid != null) pids.add(pid);
    }
  } catch {
    // no-op
  }

  return Array.from(pids);
}

export interface TerminateCompetingFigmaMcpProcessesOptions {
  excludePids?: number[];
  waitMs?: number;
}

export interface TerminateCompetingFigmaMcpProcessesResult {
  attempted: number[];
  terminated: number[];
  failed: number[];
}

/**
 * Terminate competing legacy stdio bridge processes.
 *
 * Used by MCP reconcile flows to recover from long-lived stale instances that
 * force the current server onto fallback ports where no legacy stdio bridge is
 * connected.
 */
export async function terminateCompetingFigmaMcpProcesses(
  options: TerminateCompetingFigmaMcpProcessesOptions = {},
): Promise<TerminateCompetingFigmaMcpProcessesResult> {
  const waitDurationMs = Number.isFinite(Number(options.waitMs)) ? Math.max(0, Math.floor(Number(options.waitMs))) : 300;
  const exclude = new Set<number>(
    [process.pid, ...(Array.isArray(options.excludePids) ? options.excludePids : [])]
      .map((value) => parsePositiveInteger(value))
      .filter((value): value is number => value != null),
  );
  const attempted: number[] = [];
  const terminated: number[] = [];
  const failed: number[] = [];

  const candidates = listFigmaMcpProcessPids();
  for (const pid of candidates) {
    if (exclude.has(pid)) continue;
    if (!isFigmaMcpProcessPid(pid)) continue;
    attempted.push(pid);
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      failed.push(pid);
    }
  }

  if (waitDurationMs > 0) {
    await waitMs(waitDurationMs);
  }

  for (const pid of attempted) {
    if (!isProcessAlive(pid)) {
      terminated.push(pid);
      continue;
    }
    try {
      process.kill(pid, 'SIGKILL');
      if (!isProcessAlive(pid)) {
        terminated.push(pid);
      } else if (!failed.includes(pid)) {
        failed.push(pid);
      }
    } catch {
      if (!failed.includes(pid)) failed.push(pid);
    }
  }

  return {
    attempted,
    terminated,
    failed,
  };
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
  signal?: AbortSignal;
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

  return DEFAULT_MCP_CONNECT_WAIT_MS;
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
        'If this is a legacy stdio bridge configuration, please move the arguments ' +
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

  // Legacy MCP stdio spawn is deprecated and disabled by default.
  // Set DS_ALLOW_LEGACY_MCP_STDIO=true to temporarily re-enable it.
  const allowLegacyStdio = String(env.DS_ALLOW_LEGACY_MCP_STDIO || '').toLowerCase() === 'true';
  if (!allowLegacyStdio) {
    throw new Error(
      'Direct-only mode: Legacy MCP stdio spawn is disabled by default. ' +
      'Use the dashboard API endpoint /api/figma-mcp-variables instead, ' +
      'or set DS_ALLOW_LEGACY_MCP_STDIO=true to temporarily re-enable legacy mode.'
    );
  }

  return {
    command: 'npx',
    args: ['-y', LEGACY_STDIO_MCP_CLI],
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
    return rawToolResult.data as Record<string, unknown>;
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
    const processEnv = buildMcpProcessEnv(env);
    this.child = spawn(command.command, command.args, {
      stdio: 'pipe',
      env: processEnv,
    });

    this.child.stdout.on('data', (chunk: Buffer) => this.handleStdoutChunk(chunk));
    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderrBuffer += chunk.toString('utf8');
      if (this.stderrBuffer.length > 4_000) {
        this.stderrBuffer = this.stderrBuffer.slice(-4_000);
      }
    });
    this.child.stdin.on('error', (error) => {
      this.rejectAllPending(
        new Error(`MCP stdin stream error: ${error.message}`),
      );
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

  async initialize(timeoutMs?: number, signal?: AbortSignal): Promise<void> {
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'flujo-tokens-cli',
        version: '1.0.0',
      },
    }, timeoutMs, signal);
    this.sendNotification('notifications/initialized', {});
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    }, timeoutMs, signal);
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
    if (this.child.stdin.destroyed || this.child.stdin.writableEnded) return;
    this.child.stdin.write(encodeMcpMessage(notification), (error) => {
      if (error) {
        this.rejectAllPending(new Error(`MCP notification write failed: ${error.message}`));
      }
    });
  }

  /**
   * List available MCP tools.
   * Public wrapper around sendRequest for tools/list.
   */
  public listTools(timeoutMs?: number): Promise<unknown> {
    return this.sendRequest('tools/list', {}, timeoutMs);
  }

  private sendRequest(
    method: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
    signal?: AbortSignal,
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

      const onAbort = () => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error(`MCP request aborted (${method}).`));
      };

      this.pending.set(id, { resolve, reject, timer });
      if (signal?.aborted) {
        onAbort();
        return;
      }
      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }
      if (this.child.stdin.destroyed || this.child.stdin.writableEnded) {
        clearTimeout(timer);
        this.pending.delete(id);
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
        reject(new Error(`MCP stdin stream is closed (${method}).`));
        return;
      }
      this.child.stdin.write(encodeMcpMessage(payload), (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(id);
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
        pending.reject(new Error(`MCP write failed (${method}): ${error.message}`));
      });
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
  signal?: AbortSignal,
): Promise<void> {
  const result = await client.callTool('figma_get_status', {}, timeoutMs, signal);

  // Try structured fields first (preferred)
  let hasStructuredSignal = false;
  if (isRecord(result)) {
    // Check for explicit connected/disconnected fields
    if (typeof result.connected === 'boolean') {
      hasStructuredSignal = true;
      if (result.connected === false) {
        throw new Error(
          'MCP server reports no Figma connection. Ensure Figma Desktop is open with the legacy stdio bridge running.',
        );
      }
    }
    if (isRecord(result.transport)) {
      const transportConnected = result.transport.connected;
      if (typeof transportConnected === 'boolean') {
        hasStructuredSignal = true;
        if (transportConnected === false) {
          throw new Error(
            'MCP server transport reports disconnected. Ensure Figma Desktop is open with the legacy stdio bridge running.',
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
            'MCP server reports no Figma connection. Ensure Figma Desktop is open with the legacy stdio bridge running.',
          );
        }
      }
      if (isRecord(parsedFromText.transport)) {
        const transportConnected = parsedFromText.transport.connected;
        if (typeof transportConnected === 'boolean') {
          blockHasStructuredSignal = true;
          if (transportConnected === false) {
            throw new Error(
              'MCP server transport reports disconnected. Ensure Figma Desktop is open with the legacy stdio bridge running.',
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
        `MCP server reports no Figma connection. Ensure Figma Desktop is open with the legacy stdio bridge running. Details: ${text}`,
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
 * client.  This avoids spawning a new legacy stdio bridge child process
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
  const externalSignal = options.signal;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, effectiveTimeoutMs);
  const onExternalAbort = () => controller.abort();
  if (externalSignal?.aborted) {
    controller.abort();
  } else if (externalSignal) {
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

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
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
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
    if (options.signal?.aborted) {
      throw new Error('MCP request aborted');
    }
    await client.initialize(timeoutMs, options.signal);

    // Pre-flight connectivity check (non-fatal if tool not supported)
    try {
      await ensureMcpConnectivity(client, connectWaitMs, timeoutMs, options.signal);
    } catch (statusError) {
      const msg = statusError instanceof Error ? statusError.message : String(statusError);
      if (/method not found|unknown tool/i.test(msg)) {
        // MCP server doesn't support figma_get_status, continue without pre-flight
      } else {
        throw statusError;
      }
    }

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      if (options.signal?.aborted) {
        throw new Error('MCP request aborted');
      }
      const toolResult = await client.callTool(
        'figma_get_variables',
        buildToolsCallParams(options.fileUrl, page),
        timeoutMs,
        options.signal,
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

export interface PingSharedFigmaMcpOptions extends FetchFigmaVariablesViaMcpOptions {
  detectPort?: boolean;
}

export interface PingSharedFigmaMcpResult {
  ok: boolean;
  connected: boolean;
  code?: string;
  message: string;
  collectionsDetected?: number;
  variablesDetected?: number;
  /**
   * True if the legacy stdio bridge has successfully connected at least once during
   * this server session. Used by the UI to distinguish "never connected" from
   * "was connected, now lost" and show context-appropriate guidance.
   */
  everConnected: boolean;
  /**
   * The current MCP WebSocket port. Useful for UI to display active connection.
   */
  currentPort?: number;
}

interface SharedMcpClientState {
  signature: string;
  client: McpStdioClient;
}

let sharedMcpClientState: SharedMcpClientState | null = null;
type SharedMcpClientFactoryForTesting = (
  options: PingSharedFigmaMcpOptions,
) => Promise<McpStdioClient>;
let sharedMcpClientFactoryForTesting: SharedMcpClientFactoryForTesting | null = null;

/**
 * Set to true the first time a ping returns connected=true in this server
 * session. Intentionally NOT reset when the shared client is disposed/restarted
 * so it reflects "legacy stdio bridge connected at some point", not "connected now".
 */
let everConnectedToBridgePlugin = false;

export function setSharedMcpClientFactoryForTesting(
  factory: SharedMcpClientFactoryForTesting | null,
): void {
  sharedMcpClientFactoryForTesting = factory;
  if (factory) {
    disposeSharedClientState();
  }
}

function buildSharedClientSignature(args: {
  command: McpCommand;
  env: NodeJS.ProcessEnv | undefined;
}): string {
  const env = args.env ?? process.env;
  // Any change in these fields can alter connectivity/runtime behaviour, so force a restart.
  const envSignature = [
    String(env.FIGMA_ACCESS_TOKEN || ''),
    String(env.ENABLE_MCP_APPS || ''),
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

export async function getOrCreateSharedMcpClient(
  options: PingSharedFigmaMcpOptions,
): Promise<McpStdioClient> {
  if (sharedMcpClientFactoryForTesting) {
    return await sharedMcpClientFactoryForTesting(options);
  }

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

function parseCurrentPortFromStatusPayload(payload: unknown): number | undefined {
  if (!isRecord(payload)) return undefined;

  const transport = isRecord(payload.transport) ? payload.transport : null;
  const websocket =
    transport && isRecord(transport.websocket) ? transport.websocket : null;
  const directPort = websocket ? toFiniteNumber(websocket.port) : undefined;
  if (typeof directPort === 'number') {
    return directPort;
  }

  if (payload.structuredContent != null) {
    const nested = parseCurrentPortFromStatusPayload(payload.structuredContent);
    if (typeof nested === 'number') return nested;
  }

  if (payload.data != null) {
    const nested = parseCurrentPortFromStatusPayload(payload.data);
    if (typeof nested === 'number') return nested;
  }

  const content = Array.isArray(payload.content) ? payload.content : [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    const text = String(block.text || '').trim();
    if (!text) continue;
    try {
      const parsed = JSON.parse(stripMarkdownCodeFence(text));
      const nested = parseCurrentPortFromStatusPayload(parsed);
      if (typeof nested === 'number') return nested;
    } catch {
      // Ignore invalid JSON blocks.
    }
  }

  return undefined;
}

async function detectCurrentMcpPort(
  client: McpStdioClient,
  timeoutMs?: number,
): Promise<number | undefined> {
  try {
    const statusResult = await client.callTool('figma_get_status', {}, timeoutMs);
    return parseCurrentPortFromStatusPayload(statusResult);
  } catch {
    return undefined;
  }
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
          'The legacy stdio bridge is likely connected to another instance. Close duplicate MCP sessions or restart the legacy stdio bridge after starting this dashboard.',
      };
    }
    return {
      code: 'mcp.not_connected',
      message:
        'MCP server is running, but it is not connected to Figma Desktop (legacy stdio bridge or CDP unavailable).',
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
    const currentPort = options.detectPort !== false ? await detectCurrentMcpPort(client, timeoutMs) : undefined;
    everConnectedToBridgePlugin = true;
    return {
      ok: true,
      connected: true,
      everConnected: true,
      message: 'MCP connection is healthy.',
      currentPort,
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
          everConnected: everConnectedToBridgePlugin,
          code: classified.code,
          message: classified.message,
          currentPort: parseMcpDisconnectedDiagnostics(retryMessage)?.currentPort,
        };
      }
    }
    const classified = classifyMcpPingError(message);
    return {
      ok: false,
      connected: false,
      everConnected: everConnectedToBridgePlugin,
      code: classified.code,
      message: classified.message,
      currentPort: parseMcpDisconnectedDiagnostics(message)?.currentPort,
    };
  }
}

export function disposeSharedFigmaMcpClient(): void {
  disposeSharedClientState();
}

/**
 * Pre-warm the shared MCP client by creating it eagerly in the background.
 *
 * Call this at server startup so the legacy stdio bridge process is already
 * running (and the legacy stdio bridge can discover and connect to it) by
 * the time the user interacts with the UI.  Without pre-warming the client is
 * created lazily on the first ping request, which can cause a cold-start
 * timeout if npx needs to download a new version of legacy stdio bridge.
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
 * fresh legacy stdio bridge process — it reuses the one that the server
 * already manages (and that the legacy stdio bridge is connected to).
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

// ============================================================================
// MCP Tools Discovery
// ============================================================================

export interface McpToolInfo {
  name: string;
  description?: string;
}

export interface McpListToolsResult {
  ok: true;
  tools: McpToolInfo[];
  elapsedMs: number;
}

export interface McpListToolsError {
  ok: false;
  code: string;
  message: string;
  retryable?: boolean;
  elapsedMs?: number;
}

/**
 * List available MCP tools from the shared client.
 */
export async function listMcpTools(
  options: PingSharedFigmaMcpOptions = {},
): Promise<McpListToolsResult | McpListToolsError> {
  const startedAt = Date.now();
  const timeoutMs = resolveTimeoutMs(options);

  try {
    const client = await getOrCreateSharedMcpClient(options);

    // Use public listTools method (wraps sendRequest)
    const result = await client.listTools(timeoutMs);

    // Parse tools from response
    const tools = parseToolsFromContent(result);
    const elapsedMs = Date.now() - startedAt;

    // Validate: empty tools list indicates malformed payload
    if (tools.length === 0) {
      return {
        ok: false,
        code: 'mcp.list_tools_failed',
        message: 'MCP tools/list returned empty or malformed payload.',
        retryable: false,
        elapsedMs,
      };
    }

    return {
      ok: true,
      tools,
      elapsedMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const elapsedMs = Date.now() - startedAt;

    // Classify error
    if (message.toLowerCase().includes('timeout')) {
      return {
        ok: false,
        code: 'mcp.timeout',
        message: `MCP list tools timed out after ${timeoutMs}ms.`,
        retryable: true,
        elapsedMs,
      };
    }

    if (message.toLowerCase().includes('not connected') || message.toLowerCase().includes('disconnected')) {
      return {
        ok: false,
        code: 'mcp.not_connected',
        message,
        retryable: true,
        elapsedMs,
      };
    }

    if (message.toLowerCase().includes('method not found') || message.toLowerCase().includes('unknown method')) {
      return {
        ok: false,
        code: 'mcp.method_not_found',
        message: 'MCP tools/list method not available.',
        retryable: false,
        elapsedMs,
      };
    }

    return {
      ok: false,
      code: 'mcp.list_tools_failed',
      message: `MCP list tools failed: ${message}`,
      retryable: false,
      elapsedMs,
    };
  }
}

/**
 * Parse tools list from MCP response.
 * Handles both direct response from sendRequest and content from callTool.
 */
function parseToolsFromContent(response: unknown): McpToolInfo[] {
  if (!response) return [];

  // Direct response from sendRequest('tools/list'): { tools: [...] }
  if (typeof response === 'object' && !Array.isArray(response)) {
    const responseObj = response as Record<string, unknown>;
    const toolsData = responseObj.tools ?? responseObj.data ?? responseObj.result;
    
    if (Array.isArray(toolsData)) {
      return extractToolsFromParsed(toolsData);
    }
  }

  // Content array from callTool: [{ type: 'text', text: '...' }]
  if (Array.isArray(response)) {
    for (const entry of response) {
      if (!entry || typeof entry !== 'object') continue;
      const entryObj = entry as Record<string, unknown>;
      const text = String(entryObj.text || '').trim();
      if (!text) continue;

      // Try to parse JSON from text
      const normalized = stripMarkdownCodeFence(text);
      try {
        const parsed = JSON.parse(normalized);
        return extractToolsFromParsed(parsed);
      } catch {
        // keep scanning
      }
    }
  }

  return [];
}

/**
 * Extract tools from parsed JSON response.
 */
function extractToolsFromParsed(data: unknown): McpToolInfo[] {
  // Handle array directly
  if (Array.isArray(data)) {
    return data
      .filter(item => item && typeof item === 'object')
      .map(item => {
        const obj = item as Record<string, unknown>;
        return {
          name: String(obj.name || ''),
          description: obj.description ? String(obj.description) : undefined,
        };
      })
      .filter(tool => tool.name);
  }

  // Handle object with tools/data/result property
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const toolsData = obj.tools ?? obj.data ?? obj.result;
    if (Array.isArray(toolsData)) {
      return extractToolsFromParsed(toolsData);
    }
  }

  return [];
}

// ============================================================================
// MCP Design System Kit
// ============================================================================

export interface FetchDesignSystemKitOptions {
  fileUrl?: string;
  format?: 'compact' | 'summary' | 'full';
  include?: Array<'tokens' | 'styles' | 'components'>;
  timeoutMs?: number;
  connectWaitMs?: number;
}

export interface KitStyle {
  id: string;
  name: string;
  styleType: string;
  key?: string;
  description?: string;
}

export interface DesignSystemKitResult {
  ok: true;
  tokens?: { variables: Record<string, FigmaVariable>; variableCollections: Record<string, FigmaVariableCollection> };
  styles?: KitStyle[];
  components?: unknown[];
  elapsedMs: number;
}

export interface DesignSystemKitError {
  ok: false;
  code: string;
  message: string;
  retryable?: boolean;
  elapsedMs?: number;
}

function parseDesignSystemKitPayload(raw: unknown): Record<string, unknown> {
  return parseToolContentPayload(raw);
}

function normalizeKitTokens(raw: unknown): DesignSystemKitResult['tokens'] | undefined {
  if (!isRecord(raw)) return undefined;
  const variables = normalizeVariables(raw.variables ?? []);
  const variableCollections = normalizeCollections(raw.variableCollections ?? []);
  if (Object.keys(variables).length === 0 && Object.keys(variableCollections).length === 0) return undefined;
  return { variables, variableCollections };
}

function normalizeKitStyles(raw: unknown): KitStyle[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): KitStyle[] => {
    if (!isRecord(item)) return [];
    const id = String(item.id ?? '').trim();
    const name = String(item.name ?? '').trim();
    const styleType = String(item.styleType ?? item.type ?? '').trim();
    if (!id || !name) return [];
    return [{ id, name, styleType, key: item.key != null ? String(item.key) : undefined, description: item.description != null ? String(item.description) : undefined }];
  });
}

function classifyKitError(message: string, timeoutMs: number, startedAt: number): DesignSystemKitError {
  const elapsedMs = Date.now() - startedAt;
  const lower = message.toLowerCase();
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('timedout')) {
    return {
      ok: false,
      code: 'kit.timeout',
      message: `figma_get_design_system_kit timed out after ${timeoutMs}ms.`,
      retryable: true,
      elapsedMs,
    };
  }
  if (lower.includes('not connected') || lower.includes('disconnected')) return { ok: false, code: 'kit.not_connected', message, retryable: true, elapsedMs };
  if (lower.includes('method not found') || lower.includes('unknown method')) return { ok: false, code: 'kit.method_not_found', message: 'figma_get_design_system_kit not available in this MCP version.', retryable: false, elapsedMs };
  return { ok: false, code: 'kit.failed', message, retryable: false, elapsedMs };
}

export async function fetchDesignSystemKitFromSharedMcpClient(options: FetchDesignSystemKitOptions = {}): Promise<DesignSystemKitResult | DesignSystemKitError> {
  const timeoutMs = resolveTimeoutMs(options);
  const connectWaitMs = resolveConnectWaitMs(options);
  const startedAt = Date.now();
  const params: Record<string, unknown> = { format: options.format ?? 'summary', include: options.include ?? ['tokens', 'styles'] };
  if (options.fileUrl) params.fileUrl = options.fileUrl;

  const doFetch = async (): Promise<DesignSystemKitResult | DesignSystemKitError> => {
    const client = await getOrCreateSharedMcpClient(options);
    await ensureMcpConnectivity(client, connectWaitMs, timeoutMs);
    const toolResult = await client.callTool('figma_get_design_system_kit', params, timeoutMs);
    if (toolResult.isError === true) {
      return {
        ok: false,
        code: 'kit.tool_error',
        message: 'figma_get_design_system_kit returned isError=true.',
        retryable: false,
        elapsedMs: Date.now() - startedAt,
      };
    }
    const payload = parseDesignSystemKitPayload(toolResult);
    const tokens = normalizeKitTokens(payload.tokens ?? payload.meta);
    const styles = normalizeKitStyles(payload.styles);
    return {
      ok: true,
      tokens,
      styles,
      components: Array.isArray(payload.components) ? payload.components : undefined,
      elapsedMs: Date.now() - startedAt,
    };
  };

  try {
    return await doFetch();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (shouldRestartSharedClient(message)) {
      disposeSharedClientState();
      try { return await doFetch(); }
      catch (retryError) { return classifyKitError(retryError instanceof Error ? retryError.message : String(retryError), timeoutMs, startedAt); }
    }
    return classifyKitError(message, timeoutMs, startedAt);
  }
}
