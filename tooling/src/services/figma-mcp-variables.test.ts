import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  fetchFigmaLocalVariablesViaMcp,
  resolveFigmaMcpCommand,
} from './figma-mcp-variables.js';

describe('figma-mcp-variables', () => {
  it('resolves default MCP command', () => {
    const command = resolveFigmaMcpCommand({ env: {} });
    assert.equal(command.command, 'npx');
    assert.deepEqual(command.args, ['-y', 'figma-console-mcp']);
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
      command: '/usr/local/bin/figma-console-mcp',
      args: ['--stdio'],
      env: {},
    });
    assert.equal(command.command, '/usr/local/bin/figma-console-mcp');
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
        FIGMA_MCP_COMMAND: 'C:\\Program Files\\Acme\\figma-console-mcp.exe',
      },
    });
    assert.equal(command.command, 'C:\\Program Files\\Acme\\figma-console-mcp.exe');
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


  it('fetches paginated variables from MCP stdio server', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-vars-'));
    const scriptPath = path.join(tempRoot, 'mock-mcp.js');
    const script = `
let buffer = Buffer.alloc(0);
let expectedLength = null;
function send(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  process.stdout.write('Content-Length: ' + body.length + '\\r\\n\\r\\n');
  process.stdout.write(body);
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
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    if (expectedLength === null) {
      const idx = buffer.indexOf('\\r\\n\\r\\n');
      if (idx < 0) return;
      const header = buffer.slice(0, idx).toString('utf8');
      const match = /content-length:\\s*(\\d+)/i.exec(header);
      if (!match) throw new Error('Missing content-length');
      expectedLength = Number(match[1]);
      buffer = buffer.slice(idx + 4);
    }
    if (buffer.length < expectedLength) return;
    const body = buffer.slice(0, expectedLength).toString('utf8');
    buffer = buffer.slice(expectedLength);
    expectedLength = null;
    const parsed = JSON.parse(body);
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

  it('does not fail connectivity check when transport.connected is missing', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-vars-status-'));
    const scriptPath = path.join(tempRoot, 'mock-mcp-status.js');
    const script = `
let buffer = Buffer.alloc(0);
let expectedLength = null;
function send(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  process.stdout.write('Content-Length: ' + body.length + '\\r\\n\\r\\n');
  process.stdout.write(body);
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
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    if (expectedLength === null) {
      const idx = buffer.indexOf('\\r\\n\\r\\n');
      if (idx < 0) return;
      const header = buffer.slice(0, idx).toString('utf8');
      const match = /content-length:\\s*(\\d+)/i.exec(header);
      if (!match) throw new Error('Missing content-length');
      expectedLength = Number(match[1]);
      buffer = buffer.slice(idx + 4);
    }
    if (buffer.length < expectedLength) return;
    const body = buffer.slice(0, expectedLength).toString('utf8');
    buffer = buffer.slice(expectedLength);
    expectedLength = null;
    const parsed = JSON.parse(body);
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

  it('does not apply text heuristics when status text is valid JSON and ignores non-object content blocks', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-vars-status-json-ok-'));
    const scriptPath = path.join(tempRoot, 'mock-mcp-status-json-ok.js');
    const script = `
let buffer = Buffer.alloc(0);
let expectedLength = null;
function send(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  process.stdout.write('Content-Length: ' + body.length + '\\r\\n\\r\\n');
  process.stdout.write(body);
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
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    if (expectedLength === null) {
      const idx = buffer.indexOf('\\r\\n\\r\\n');
      if (idx < 0) return;
      const header = buffer.slice(0, idx).toString('utf8');
      const match = /content-length:\\s*(\\d+)/i.exec(header);
      if (!match) throw new Error('Missing content-length');
      expectedLength = Number(match[1]);
      buffer = buffer.slice(idx + 4);
    }
    if (buffer.length < expectedLength) return;
    const body = buffer.slice(0, expectedLength).toString('utf8');
    buffer = buffer.slice(expectedLength);
    expectedLength = null;
    const parsed = JSON.parse(body);
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
let buffer = Buffer.alloc(0);
let expectedLength = null;
function send(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  process.stdout.write('Content-Length: ' + body.length + '\\r\\n\\r\\n');
  process.stdout.write(body);
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
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    if (expectedLength === null) {
      const idx = buffer.indexOf('\\r\\n\\r\\n');
      if (idx < 0) return;
      const header = buffer.slice(0, idx).toString('utf8');
      const match = /content-length:\\s*(\\d+)/i.exec(header);
      if (!match) throw new Error('Missing content-length');
      expectedLength = Number(match[1]);
      buffer = buffer.slice(idx + 4);
    }
    if (buffer.length < expectedLength) return;
    const body = buffer.slice(0, expectedLength).toString('utf8');
    buffer = buffer.slice(expectedLength);
    expectedLength = null;
    const parsed = JSON.parse(body);
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
let buffer = Buffer.alloc(0);
let expectedLength = null;
function send(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  process.stdout.write('Content-Length: ' + body.length + '\\r\\n\\r\\n');
  process.stdout.write(body);
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
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    if (expectedLength === null) {
      const idx = buffer.indexOf('\\r\\n\\r\\n');
      if (idx < 0) return;
      const header = buffer.slice(0, idx).toString('utf8');
      const match = /content-length:\\s*(\\d+)/i.exec(header);
      if (!match) throw new Error('Missing content-length');
      expectedLength = Number(match[1]);
      buffer = buffer.slice(idx + 4);
    }
    if (buffer.length < expectedLength) return;
    const body = buffer.slice(0, expectedLength).toString('utf8');
    buffer = buffer.slice(expectedLength);
    expectedLength = null;
    const parsed = JSON.parse(body);
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

  it('throws when MCP status text block contains JSON with connected=false', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-mcp-vars-disconnected-json-'));
    const scriptPath = path.join(tempRoot, 'mock-mcp-disconnected-json.js');
    const script = `
let buffer = Buffer.alloc(0);
let expectedLength = null;
function send(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  process.stdout.write('Content-Length: ' + body.length + '\\r\\n\\r\\n');
  process.stdout.write(body);
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
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    if (expectedLength === null) {
      const idx = buffer.indexOf('\\r\\n\\r\\n');
      if (idx < 0) return;
      const header = buffer.slice(0, idx).toString('utf8');
      const match = /content-length:\\s*(\\d+)/i.exec(header);
      if (!match) throw new Error('Missing content-length');
      expectedLength = Number(match[1]);
      buffer = buffer.slice(idx + 4);
    }
    if (buffer.length < expectedLength) return;
    const body = buffer.slice(0, expectedLength).toString('utf8');
    buffer = buffer.slice(expectedLength);
    expectedLength = null;
    const parsed = JSON.parse(body);
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
let buffer = Buffer.alloc(0);
let expectedLength = null;
function send(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  process.stdout.write('Content-Length: ' + body.length + '\\r\\n\\r\\n');
  process.stdout.write(body);
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
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    if (expectedLength === null) {
      const idx = buffer.indexOf('\\r\\n\\r\\n');
      if (idx < 0) return;
      const header = buffer.slice(0, idx).toString('utf8');
      const match = /content-length:\\s*(\\d+)/i.exec(header);
      if (!match) throw new Error('Missing content-length');
      expectedLength = Number(match[1]);
      buffer = buffer.slice(idx + 4);
    }
    if (buffer.length < expectedLength) return;
    const body = buffer.slice(0, expectedLength).toString('utf8');
    buffer = buffer.slice(expectedLength);
    expectedLength = null;
    const parsed = JSON.parse(body);
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
let buffer = Buffer.alloc(0);
let expectedLength = null;
function send(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  process.stdout.write('Content-Length: ' + body.length + '\\r\\n\\r\\n');
  process.stdout.write(body);
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
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    if (expectedLength === null) {
      const idx = buffer.indexOf('\\r\\n\\r\\n');
      if (idx < 0) return;
      const header = buffer.slice(0, idx).toString('utf8');
      const match = /content-length:\\s*(\\d+)/i.exec(header);
      if (!match) throw new Error('Missing content-length');
      expectedLength = Number(match[1]);
      buffer = buffer.slice(idx + 4);
    }
    if (buffer.length < expectedLength) return;
    const body = buffer.slice(0, expectedLength).toString('utf8');
    buffer = buffer.slice(expectedLength);
    expectedLength = null;
    const parsed = JSON.parse(body);
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
});
