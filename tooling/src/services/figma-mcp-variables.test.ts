import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  disposeSharedFigmaMcpClient,
  getOrCreateSharedMcpClient,
  fetchFigmaLocalVariablesViaMcp,
  pingSharedFigmaMcp,
  resolveFigmaMcpCommand,
  setSharedMcpClientFactoryForTesting,
} from './figma-mcp-variables.js';

const LEGACY_STDIO_MCP_CLI = ['figma', 'console-mcp'].join('-');

describe('figma-mcp-variables', () => {
  it('throws direct-only error by default (legacy spawn disabled)', () => {
    assert.throws(
      () => resolveFigmaMcpCommand({ env: {} }),
      /Direct-only mode: Legacy MCP stdio spawn is disabled/
    );
  });

  it('resolves MCP command when DS_ALLOW_LEGACY_MCP_STDIO=true', () => {
    const command = resolveFigmaMcpCommand({
      env: { DS_ALLOW_LEGACY_MCP_STDIO: 'true' },
    });
    assert.equal(command.command, 'npx');
    assert.deepEqual(command.args, ['-y', LEGACY_STDIO_MCP_CLI]);
  });

  it('treats explicit command string as literal even when it contains spaces', () => {
    const command = resolveFigmaMcpCommand({
      command: 'C:\\Program Files\\My Binary\\test.exe',
      env: {},
    });
    assert.equal(command.command, 'C:\\Program Files\\My Binary\\test.exe');
    assert.deepEqual(command.args, []);
  });

  it('keeps explicit command untouched when explicit args are provided', () => {
    const command = resolveFigmaMcpCommand({
      command: `/usr/local/bin/${LEGACY_STDIO_MCP_CLI}`,
      args: ['--stdio'],
      env: {},
    });
    assert.equal(command.command, `/usr/local/bin/${LEGACY_STDIO_MCP_CLI}`);
    assert.deepEqual(command.args, ['--stdio']);
  });

  it('parses quoted values in env args', () => {
    const command = resolveFigmaMcpCommand({
      env: {
        FIGMA_MCP_BIN: 'node',
        FIGMA_MCP_ARGS: '--name "design tokens" --flag',
      },
    });
    assert.equal(command.command, 'node');
    assert.deepEqual(command.args, ['--name', 'design tokens', '--flag']);
  });

  it('treats FIGMA_MCP_COMMAND as literal even when path contains spaces', () => {
    const command = resolveFigmaMcpCommand({
      env: {
        FIGMA_MCP_COMMAND: `C:\\Program Files\\Acme\\${LEGACY_STDIO_MCP_CLI}.exe`,
      },
    });
    assert.equal(command.command, `C:\\Program Files\\Acme\\${LEGACY_STDIO_MCP_CLI}.exe`);
    assert.deepEqual(command.args, []);
  });

  it('throws on malformed quoted args', () => {
    assert.throws(
      () =>
        resolveFigmaMcpCommand({
          env: {
            FIGMA_MCP_BIN: 'node',
            FIGMA_MCP_ARGS: '--name "design tokens',
          },
        }),
      /unterminated quote/i,
    );
  });

  it('preserves literal explicit command paths with spaces', () => {
    const command = resolveFigmaMcpCommand({
      command: 'C:\\Program Files\\NodeJS\\node.exe',
      env: {},
    });
    assert.equal(command.command, 'C:\\Program Files\\NodeJS\\node.exe');
    assert.deepEqual(command.args, []);
  });

  it('preserves backslashes in quoted arguments', () => {
    const command = resolveFigmaMcpCommand({
      env: {
        FIGMA_MCP_BIN: 'node',
        FIGMA_MCP_ARGS: '--path "C:\\Users\\name\\file.txt"',
      },
    });
    assert.equal(command.command, 'node');
    assert.deepEqual(command.args, ['--path', 'C:\\Users\\name\\file.txt']);
  });

  it('warns when MCP child PID file persistence fails after the overwrite fallback fails', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-vars-pid-'));
    const scriptPath = path.join(tempRoot, 'mock-mcp-pid.js');
    const script = `
let buffer = '';
function send(payload) {
  process.stdout.write(JSON.stringify(payload) + '\\n');
}
function handleMessage(message) {
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: { name: 'mock', version: '1.0.0' },
      },
    });
  }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const idx = buffer.indexOf('\\n');
    if (idx < 0) return;
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const parsed = JSON.parse(line);
    handleMessage(parsed);
  }
});
`;
    fs.writeFileSync(scriptPath, script, 'utf8');

    const pidScope = fs.realpathSync(process.cwd());
    const pidFilePath = path.join(
      os.tmpdir(),
      `ds-dashboard-mcp-child-${createHash('sha1').update(pidScope).digest('hex').slice(0, 12)}.pid`,
    );
    fs.rmSync(pidFilePath, { recursive: true, force: true });
    fs.mkdirSync(pidFilePath, { recursive: true });

    const originalWarn = console.warn;
    const warnCalls: unknown[][] = [];
    console.warn = ((...args: unknown[]) => {
      warnCalls.push(args);
    }) as typeof console.warn;

    try {
      disposeSharedFigmaMcpClient();
      await getOrCreateSharedMcpClient({
        command: process.execPath,
        args: [scriptPath],
        timeoutMs: 2_000,
      });

      assert.equal(warnCalls.length, 1);
      assert.match(String(warnCalls[0][0]), /Failed to persist MCP child PID file/);
      assert.equal((warnCalls[0][1] as { stage?: string }).stage, 'fallback');
    } finally {
      disposeSharedFigmaMcpClient();
      console.warn = originalWarn;
      fs.rmSync(pidFilePath, { recursive: true, force: true });
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });


  it('fetches paginated variables from MCP stdio server', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-vars-'));
    const scriptPath = path.join(tempRoot, 'mock-mcp.js');
    const script = `
let buffer = '';
function send(payload) {
  process.stdout.write(JSON.stringify(payload) + '\\n');
}
function handleMessage(message) {
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: { name: 'mock', version: '1.0.0' },
      },
    });
    return;
  }
  if (message.method === 'tools/call') {
    const page = Number(message.params?.arguments?.page || 1);
    const hasNextPage = page < 2;
    const modeId = '1:0';
    const variables = page === 1
      ? [{ id: 'VariableID:1', name: 'color/primary', resolvedType: 'COLOR', variableCollectionId: 'Collection:1', valuesByMode: { [modeId]: { r: 1, g: 0, b: 0, a: 1 } } }]
      : [{ id: 'VariableID:2', name: 'size/md', resolvedType: 'FLOAT', variableCollectionId: 'Collection:1', valuesByMode: { [modeId]: 16 } }];
    const payload = {
      data: {
        variableCollections: [{ id: 'Collection:1', name: 'Primitives', modes: [{ modeId, name: 'Mode 1' }] }],
        variables,
      },
      pagination: { hasNextPage },
    };
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
      },
    });
  }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const idx = buffer.indexOf('\\n');
    if (idx < 0) return;
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const parsed = JSON.parse(line);
    handleMessage(parsed);
  }
});
`;
    fs.writeFileSync(scriptPath, script, 'utf8');

    try {
      const result = await fetchFigmaLocalVariablesViaMcp({
        command: process.execPath,
        args: [scriptPath],
        timeoutMs: 2_000,
      });

      assert.equal(Object.keys(result.meta.variableCollections).length, 1);
      assert.equal(Object.keys(result.meta.variables).length, 2);
      assert.equal(result.meta.variables['VariableID:1']?.name, 'color/primary');
      assert.equal(result.meta.variables['VariableID:2']?.name, 'size/md');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('reads timeout override from FIGMA_MCP_TIMEOUT_MS', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-vars-timeout-'));
    const scriptPath = path.join(tempRoot, 'mock-mcp-timeout.js');
    const script = `
let buffer = '';
function send(payload) {
  process.stdout.write(JSON.stringify(payload) + '\\n');
}
function handleMessage(message) {
  if (message.method === 'initialize') {
    setTimeout(() => {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'mock', version: '1.0.0' },
        },
      });
    }, 250);
    return;
  }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const idx = buffer.indexOf('\\n');
    if (idx < 0) return;
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const parsed = JSON.parse(line);
    handleMessage(parsed);
  }
});
`;
    fs.writeFileSync(scriptPath, script, 'utf8');

    try {
      await assert.rejects(
        fetchFigmaLocalVariablesViaMcp({
          command: process.execPath,
          args: [scriptPath],
          env: { FIGMA_MCP_TIMEOUT_MS: '100' },
        }),
        /timed out \(initialize\)/i,
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('does not fail connectivity check when transport.connected is missing', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-vars-status-'));
    const scriptPath = path.join(tempRoot, 'mock-mcp-status.js');
    const script = `
let buffer = '';
function send(payload) {
  process.stdout.write(JSON.stringify(payload) + '\\n');
}
function handleMessage(message) {
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: { name: 'mock', version: '1.0.0' },
      },
    });
    return;
  }
  if (message.method === 'tools/call') {
    const tool = String(message.params?.name || '');
    if (tool === 'figma_get_status') {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          connected: true,
          transport: { mode: 'websocket' },
          content: [{ type: 'text', text: 'connected' }],
        },
      });
      return;
    }
    if (tool === 'figma_get_variables') {
      const payload = {
        data: {
          variableCollections: [{ id: 'Collection:1', name: 'Primitives', modes: [{ modeId: '1:0', name: 'Mode 1' }] }],
          variables: [{ id: 'VariableID:1', name: 'size/md', resolvedType: 'FLOAT', variableCollectionId: 'Collection:1', valuesByMode: { '1:0': 16 } }],
        },
        pagination: { hasNextPage: false },
      };
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(payload) }],
        },
      });
      return;
    }
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        content: [{ type: 'text', text: '{}' }],
      },
    });
  }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const idx = buffer.indexOf('\\n');
    if (idx < 0) return;
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const parsed = JSON.parse(line);
    handleMessage(parsed);
  }
});
`;
    fs.writeFileSync(scriptPath, script, 'utf8');

    try {
      const result = await fetchFigmaLocalVariablesViaMcp({
        command: process.execPath,
        args: [scriptPath],
        timeoutMs: 2_000,
      });
      assert.equal(Object.keys(result.meta.variables).length, 1);
      assert.equal(result.meta.variables['VariableID:1']?.name, 'size/md');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('aborts the connectivity backoff when the caller aborts', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-vars-status-abort-'));
    const scriptPath = path.join(tempRoot, 'mock-mcp-status-abort.js');
    const script = `
let buffer = '';
function send(payload) {
  process.stdout.write(JSON.stringify(payload) + '\\n');
}
function handleMessage(message) {
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: { name: 'mock', version: '1.0.0' },
      },
    });
    return;
  }
  if (message.method === 'tools/call' && String(message.params?.name || '') === 'figma_get_status') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        content: [{ type: 'text', text: 'transport disconnected' }],
      },
    });
  }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const idx = buffer.indexOf('\\n');
    if (idx < 0) return;
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const parsed = JSON.parse(line);
    handleMessage(parsed);
  }
});
`;
    fs.writeFileSync(scriptPath, script, 'utf8');

    const controller = new AbortController();
    const startedAt = Date.now();
    const abortTimer = setTimeout(() => controller.abort(), 50);

    try {
      await assert.rejects(
        fetchFigmaLocalVariablesViaMcp({
          command: process.execPath,
          args: [scriptPath],
          timeoutMs: 2_000,
          connectWaitMs: 5_000,
          signal: controller.signal,
        }),
        /aborted/i,
      );
      const elapsedMs = Date.now() - startedAt;
      assert.ok(elapsedMs < 1_000, `expected abort to stop backoff quickly, got ${elapsedMs}ms`);
    } finally {
      clearTimeout(abortTimer);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('deduplicates concurrent shared MCP client initialization', async () => {
    let factoryCalls = 0;
    const sharedClient = {
      close() {},
    } as unknown as ReturnType<typeof getOrCreateSharedMcpClient> extends Promise<infer T> ? T : never;

    setSharedMcpClientFactoryForTesting(async () => {
      factoryCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return sharedClient;
    });

    try {
      const options = {
        command: process.execPath,
        args: ['-e', 'process.exit(0)'],
        timeoutMs: 1_000,
      };

      const [clientA, clientB] = await Promise.all([
        getOrCreateSharedMcpClient(options),
        getOrCreateSharedMcpClient(options),
      ]);

      assert.equal(factoryCalls, 1);
      assert.equal(clientA, sharedClient);
      assert.equal(clientB, sharedClient);
    } finally {
      setSharedMcpClientFactoryForTesting(null);
      disposeSharedFigmaMcpClient();
    }
  });

  it('does not apply text heuristics when status text is valid JSON and ignores non-object content blocks', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-vars-status-json-ok-'));
    const scriptPath = path.join(tempRoot, 'mock-mcp-status-json-ok.js');
    const script = `
let buffer = '';
function send(payload) {
  process.stdout.write(JSON.stringify(payload) + '\\n');
}
function handleMessage(message) {
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: { name: 'mock', version: '1.0.0' },
      },
    });
    return;
  }
  if (message.method === 'tools/call') {
    const tool = String(message.params?.name || '');
    if (tool === 'figma_get_status') {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [
            null,
            'unexpected',
            { type: 'text', text: '{"connected":true,"note":"disconnected previously"}' },
          ],
        },
      });
      return;
    }
    if (tool === 'figma_get_variables') {
      const payload = {
        data: {
          variableCollections: [{ id: 'Collection:1', name: 'Primitives', modes: [{ modeId: '1:0', name: 'Mode 1' }] }],
          variables: [{ id: 'VariableID:1', name: 'size/md', resolvedType: 'FLOAT', variableCollectionId: 'Collection:1', valuesByMode: { '1:0': 16 } }],
        },
        pagination: { hasNextPage: false },
      };
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(payload) }],
        },
      });
      return;
    }
  }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const idx = buffer.indexOf('\\n');
    if (idx < 0) return;
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const parsed = JSON.parse(line);
    handleMessage(parsed);
  }
});
`;
    fs.writeFileSync(scriptPath, script, 'utf8');

    try {
      const result = await fetchFigmaLocalVariablesViaMcp({
        command: process.execPath,
        args: [scriptPath],
        timeoutMs: 2_000,
      });
      assert.equal(Object.keys(result.meta.variables).length, 1);
      assert.equal(result.meta.variables['VariableID:1']?.name, 'size/md');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('prefers structured connected status from later JSON block over earlier unstructured disconnected text', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-vars-status-mixed-'));
    const scriptPath = path.join(tempRoot, 'mock-mcp-status-mixed.js');
    const script = `
let buffer = '';
function send(payload) {
  process.stdout.write(JSON.stringify(payload) + '\\n');
}
function handleMessage(message) {
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: { name: 'mock', version: '1.0.0' },
      },
    });
    return;
  }
  if (message.method === 'tools/call') {
    const tool = String(message.params?.name || '');
    if (tool === 'figma_get_status') {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [
            { type: 'text', text: 'disconnected from a previous session' },
            { type: 'text', text: '{"connected":true}' },
          ],
        },
      });
      return;
    }
    if (tool === 'figma_get_variables') {
      const payload = {
        data: {
          variableCollections: [{ id: 'Collection:1', name: 'Primitives', modes: [{ modeId: '1:0', name: 'Mode 1' }] }],
          variables: [{ id: 'VariableID:1', name: 'size/md', resolvedType: 'FLOAT', variableCollectionId: 'Collection:1', valuesByMode: { '1:0': 16 } }],
        },
        pagination: { hasNextPage: false },
      };
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(payload) }],
        },
      });
      return;
    }
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: { content: [{ type: 'text', text: '{}' }] },
    });
  }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const idx = buffer.indexOf('\\n');
    if (idx < 0) return;
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const parsed = JSON.parse(line);
    handleMessage(parsed);
  }
});
`;
    fs.writeFileSync(scriptPath, script, 'utf8');

    try {
      const result = await fetchFigmaLocalVariablesViaMcp({
        command: process.execPath,
        args: [scriptPath],
        timeoutMs: 2_000,
      });
      assert.equal(Object.keys(result.meta.variables).length, 1);
      assert.equal(result.meta.variables['VariableID:1']?.name, 'size/md');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('throws when MCP status reports connected=false', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-vars-disconnected-'));
    const scriptPath = path.join(tempRoot, 'mock-mcp-disconnected.js');
    const script = `
let buffer = '';
function send(payload) {
  process.stdout.write(JSON.stringify(payload) + '\\n');
}
function handleMessage(message) {
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: { name: 'mock', version: '1.0.0' },
      },
    });
    return;
  }
  if (message.method === 'tools/call') {
    const tool = String(message.params?.name || '');
    if (tool === 'figma_get_status') {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          connected: false,
          content: [{ type: 'text', text: 'disconnected' }],
        },
      });
      return;
    }
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: { content: [{ type: 'text', text: '{}' }] },
    });
  }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const idx = buffer.indexOf('\\n');
    if (idx < 0) return;
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const parsed = JSON.parse(line);
    handleMessage(parsed);
  }
});
`;
    fs.writeFileSync(scriptPath, script, 'utf8');

    try {
      await assert.rejects(
        async () => {
          await fetchFigmaLocalVariablesViaMcp({
            command: process.execPath,
            args: [scriptPath],
            timeoutMs: 2_000,
          });
        },
        /no Figma connection|disconnected/i,
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('retries MCP status during connect wait window and succeeds once connected', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-vars-connect-wait-'));
    const scriptPath = path.join(tempRoot, 'mock-mcp-connect-wait.js');
    const script = `
let buffer = '';
let statusCalls = 0;
function send(payload) {
  process.stdout.write(JSON.stringify(payload) + '\\n');
}
function handleMessage(message) {
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: { name: 'mock', version: '1.0.0' },
      },
    });
    return;
  }
  if (message.method === 'tools/call') {
    const tool = String(message.params?.name || '');
    if (tool === 'figma_get_status') {
      statusCalls += 1;
      if (statusCalls < 2) {
        send({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            connected: false,
            content: [{ type: 'text', text: 'disconnected' }],
          },
        });
        return;
      }
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          connected: true,
          content: [{ type: 'text', text: 'connected' }],
        },
      });
      return;
    }
    if (tool === 'figma_get_variables') {
      const payload = {
        data: {
          variableCollections: [{ id: 'Collection:1', name: 'Primitives', modes: [{ modeId: '1:0', name: 'Mode 1' }] }],
          variables: [{ id: 'VariableID:1', name: 'size/md', resolvedType: 'FLOAT', variableCollectionId: 'Collection:1', valuesByMode: { '1:0': 16 } }],
        },
        pagination: { hasNextPage: false },
      };
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(payload) }],
        },
      });
      return;
    }
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: { content: [{ type: 'text', text: '{}' }] },
    });
  }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const idx = buffer.indexOf('\\n');
    if (idx < 0) return;
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const parsed = JSON.parse(line);
    handleMessage(parsed);
  }
});
`;
    fs.writeFileSync(scriptPath, script, 'utf8');

    try {
      const result = await fetchFigmaLocalVariablesViaMcp({
        command: process.execPath,
        args: [scriptPath],
        timeoutMs: 2_000,
        connectWaitMs: 1_000,
      });
      assert.equal(Object.keys(result.meta.variables).length, 1);
      assert.equal(result.meta.variables['VariableID:1']?.name, 'size/md');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('throws when MCP status text block contains JSON with connected=false', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-vars-disconnected-json-'));
    const scriptPath = path.join(tempRoot, 'mock-mcp-disconnected-json.js');
    const script = `
let buffer = '';
function send(payload) {
  process.stdout.write(JSON.stringify(payload) + '\\n');
}
function handleMessage(message) {
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: { name: 'mock', version: '1.0.0' },
      },
    });
    return;
  }
  if (message.method === 'tools/call') {
    const tool = String(message.params?.name || '');
    if (tool === 'figma_get_status') {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{ type: 'text', text: '{"connected":false}' }],
        },
      });
      return;
    }
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: { content: [{ type: 'text', text: '{}' }] },
    });
  }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const idx = buffer.indexOf('\\n');
    if (idx < 0) return;
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const parsed = JSON.parse(line);
    handleMessage(parsed);
  }
});
`;
    fs.writeFileSync(scriptPath, script, 'utf8');

    try {
      await assert.rejects(
        async () => {
          await fetchFigmaLocalVariablesViaMcp({
            command: process.execPath,
            args: [scriptPath],
            timeoutMs: 2_000,
          });
        },
        /no Figma connection|disconnected/i,
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('accepts non-boolean isError values without failing tool call', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-vars-iserror-string-'));
    const scriptPath = path.join(tempRoot, 'mock-mcp-iserror-string.js');
    const script = `
let buffer = '';
function send(payload) {
  process.stdout.write(JSON.stringify(payload) + '\\n');
}
function handleMessage(message) {
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: { name: 'mock', version: '1.0.0' },
      },
    });
    return;
  }
  if (message.method === 'tools/call') {
    const tool = String(message.params?.name || '');
    if (tool === 'figma_get_status') {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          connected: true,
          content: [{ type: 'text', text: 'connected' }],
        },
      });
      return;
    }
    if (tool === 'figma_get_variables') {
      const payload = {
        data: {
          variableCollections: [{ id: 'Collection:1', name: 'Primitives', modes: [{ modeId: '1:0', name: 'Mode 1' }] }],
          variables: [{ id: 'VariableID:1', name: 'size/md', resolvedType: 'FLOAT', variableCollectionId: 'Collection:1', valuesByMode: { '1:0': 16 } }],
        },
        pagination: { hasNextPage: false },
      };
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          isError: 'false',
          content: [{ type: 'text', text: JSON.stringify(payload) }],
        },
      });
      return;
    }
  }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const idx = buffer.indexOf('\\n');
    if (idx < 0) return;
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const parsed = JSON.parse(line);
    handleMessage(parsed);
  }
});
`;
    fs.writeFileSync(scriptPath, script, 'utf8');

    try {
      const result = await fetchFigmaLocalVariablesViaMcp({
        command: process.execPath,
        args: [scriptPath],
        timeoutMs: 2_000,
      });
      assert.equal(Object.keys(result.meta.variables).length, 1);
      assert.equal(result.meta.variables['VariableID:1']?.name, 'size/md');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('throws when pagination exceeds maximum pages', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-vars-limit-'));
    const scriptPath = path.join(tempRoot, 'mock-mcp-limit.js');
    // Mock server that always returns hasNextPage: true
    const script = `
let buffer = '';
function send(payload) {
  process.stdout.write(JSON.stringify(payload) + '\\n');
}
function handleMessage(message) {
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: { name: 'mock', version: '1.0.0' },
      },
    });
    return;
  }
  if (message.method === 'tools/call') {
    // Always return hasNextPage: true to trigger limit
    const payload = {
      data: {
        variableCollections: [],
        variables: [{ id: 'VariableID:1', name: 'test', resolvedType: 'COLOR', variableCollectionId: 'C:1', valuesByMode: { '1:0': { r: 1, g: 0, b: 0, a: 1 } } }],
      },
      pagination: { hasNextPage: true },
    };
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
      },
    });
  }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const idx = buffer.indexOf('\\n');
    if (idx < 0) return;
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const parsed = JSON.parse(line);
    handleMessage(parsed);
  }
});
`;
    fs.writeFileSync(scriptPath, script, 'utf8');

    try {
      await assert.rejects(
        async () => {
          await fetchFigmaLocalVariablesViaMcp({
            command: process.execPath,
            args: [scriptPath],
            timeoutMs: 5_000,
          });
        },
        /MCP pagination exceeded maximum pages/,
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('reuses shared client across timeout overrides and applies per-request timeout budgets', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-shared-timeout-'));
    const scriptPath = path.join(tempRoot, 'mock-mcp-shared-timeout.js');
    const spawnCountPath = path.join(tempRoot, 'spawn-count.txt');
    const script = `
const fs = require('node:fs');
const countFile = process.env.MOCK_MCP_COUNT_FILE;
if (countFile) {
  fs.appendFileSync(countFile, '1\\n', 'utf8');
}
let buffer = '';
let statusCalls = 0;
function send(payload) {
  process.stdout.write(JSON.stringify(payload) + '\\n');
}
function handleMessage(message) {
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: { name: 'mock', version: '1.0.0' },
      },
    });
    return;
  }
  if (message.method === 'tools/call') {
    const tool = String(message.params?.name || '');
    if (tool === 'figma_get_status') {
      statusCalls += 1;
      const reply = () => {
        send({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            connected: true,
            content: [{ type: 'text', text: 'connected' }],
          },
        });
      };
      if (statusCalls === 1) {
        reply();
        return;
      }
      setTimeout(reply, 300);
      return;
    }
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        content: [{ type: 'text', text: '{}' }],
      },
    });
  }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const idx = buffer.indexOf('\\n');
    if (idx < 0) return;
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const parsed = JSON.parse(line);
    handleMessage(parsed);
  }
});
`;
    fs.writeFileSync(scriptPath, script, 'utf8');

    try {
      const firstPing = await pingSharedFigmaMcp({
        command: process.execPath,
        args: [scriptPath],
        timeoutMs: 1_000,
        env: { ...process.env, MOCK_MCP_COUNT_FILE: spawnCountPath },
      });
      assert.equal(firstPing.ok, true);
      assert.equal(firstPing.connected, true);

      const startedAt = Date.now();
      const secondPing = await pingSharedFigmaMcp({
        command: process.execPath,
        args: [scriptPath],
        timeoutMs: 100,
        env: { ...process.env, MOCK_MCP_COUNT_FILE: spawnCountPath },
      });
      const elapsedMs = Date.now() - startedAt;

      assert.equal(secondPing.ok, false);
      assert.equal(secondPing.connected, false);
      assert.equal(secondPing.code, 'mcp.timeout');
      assert.equal(elapsedMs < 500, true);

      const spawnCount = fs
        .readFileSync(spawnCountPath, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean).length;
      assert.equal(spawnCount, 1);
    } finally {
      disposeSharedFigmaMcpClient();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('does not kill foreign live MCP child owned by another process in same workspace', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-owner-live-'));
    const scriptPath = path.join(tempRoot, 'mock-mcp-owner-live.js');
    const scope = (() => {
      try {
        return fs.realpathSync(process.cwd());
      } catch {
        return process.cwd();
      }
    })();
    const pidHash = createHash('sha1').update(scope).digest('hex').slice(0, 12);
    const pidFile = path.join(os.tmpdir(), `ds-dashboard-mcp-child-${pidHash}.pid`);

    const ownerProc = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], {
      stdio: 'ignore',
    });
    const foreignMcpChild = spawn(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000);', LEGACY_STDIO_MCP_CLI],
      { stdio: 'ignore' },
    );

    const script = `
let buffer = '';
function send(payload) {
  process.stdout.write(JSON.stringify(payload) + '\\n');
}
function handleMessage(message) {
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: { name: 'mock', version: '1.0.0' },
      },
    });
    return;
  }
  if (message.method === 'tools/call') {
    const tool = String(message.params?.name || '');
    if (tool === 'figma_get_status') {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          connected: true,
          content: [{ type: 'text', text: 'connected' }],
        },
      });
      return;
    }
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        content: [{ type: 'text', text: '{}' }],
      },
    });
  }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const idx = buffer.indexOf('\\n');
    if (idx < 0) return;
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const parsed = JSON.parse(line);
    handleMessage(parsed);
  }
});
`;
    fs.writeFileSync(scriptPath, script, 'utf8');

    try {
      const ownerPid = ownerProc.pid;
      const childPid = foreignMcpChild.pid;
      assert.ok(ownerPid && ownerPid > 0);
      assert.ok(childPid && childPid > 0);

      fs.writeFileSync(
        pidFile,
        JSON.stringify({
          version: 1,
          ownerPid,
          childPid,
          timestamp: Date.now(),
        }),
        'utf8',
      );

      const ping = await pingSharedFigmaMcp({
        command: process.execPath,
        args: [scriptPath],
        timeoutMs: 1_000,
      });
      assert.equal(ping.ok, true);
      assert.equal(ping.connected, true);

      assert.doesNotThrow(() => {
        process.kill(childPid, 0);
      });
    } finally {
      disposeSharedFigmaMcpClient();
      if (foreignMcpChild.pid) {
        try {
          process.kill(foreignMcpChild.pid, 'SIGTERM');
        } catch {
          // no-op
        }
      }
      if (ownerProc.pid) {
        try {
          process.kill(ownerProc.pid, 'SIGTERM');
        } catch {
          // no-op
        }
      }
      try {
        fs.rmSync(pidFile, { force: true });
      } catch {
        // no-op
      }
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('proxies through dashboard when DS_DASHBOARD_INTERNAL_URL is set', async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      assert.equal(String(url), 'http://dashboard.local/api/figma-mcp-variables');
      assert.equal(init?.method, 'POST');
      assert.equal(
        (init?.headers as Record<string, string> | undefined)?.['x-ds-dashboard-internal-token'],
        'test-token-123',
      );
      assert.equal((init?.headers as Record<string, string> | undefined)?.['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(String(init?.body || '{}')), { figmaUrl: 'https://www.figma.com/design/abc123/Test' });
      return new Response(
        JSON.stringify({
          ok: true,
          meta: {
            variableCollections: {
              'Collection:1': {
                id: 'Collection:1',
                name: 'Primitives',
                modes: [{ modeId: '1:0', name: 'Mode 1' }],
              },
            },
            variables: {
              'VariableID:1': {
                id: 'VariableID:1',
                name: 'color/primary',
                resolvedType: 'COLOR',
                variableCollectionId: 'Collection:1',
                valuesByMode: { '1:0': { r: 1, g: 0, b: 0, a: 1 } },
              },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof globalThis.fetch;

    try {
      const result = await fetchFigmaLocalVariablesViaMcp({
        fileUrl: 'https://www.figma.com/design/abc123/Test',
        env: {
          DS_DASHBOARD_INTERNAL_URL: 'http://dashboard.local',
          DS_DASHBOARD_INTERNAL_TOKEN: 'test-token-123',
        } as unknown as NodeJS.ProcessEnv,
      });

      // Verify we got the proxied response
      assert.ok(result.meta);
      assert.ok(result.meta.variables['VariableID:1']);
      assert.equal(result.meta.variables['VariableID:1'].name, 'color/primary');
      assert.ok(result.meta.variableCollections['Collection:1']);
    } finally {
      globalThis.fetch = originalFetch;
      assert.equal(requests.length, 1);
    }
  });

  it('throws direct-only error when legacy spawn attempted without DS_ALLOW_LEGACY_MCP_STDIO flag', () => {
    assert.throws(
      () => resolveFigmaMcpCommand({ env: {} }),
      /Direct-only mode: Legacy MCP stdio spawn is disabled/
    );
  });

  it('allows legacy spawn when DS_ALLOW_LEGACY_MCP_STDIO=true', () => {
    const command = resolveFigmaMcpCommand({
      env: { DS_ALLOW_LEGACY_MCP_STDIO: 'true' },
    });
    assert.equal(command.command, 'npx');
    assert.deepEqual(command.args, ['-y', LEGACY_STDIO_MCP_CLI]);
  });

  it('rejects DS_ALLOW_LEGACY_MCP_STDIO with non-true value', () => {
    assert.throws(
      () => resolveFigmaMcpCommand({ env: { DS_ALLOW_LEGACY_MCP_STDIO: 'false' } }),
      /Direct-only mode: Legacy MCP stdio spawn is disabled/
    );
  });
});
