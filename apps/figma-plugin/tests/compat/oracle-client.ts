import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createMockFigma, type MockFigma } from './mock-figma';
import type { CompatResponse } from './candidate-client';

const MCP_MANAGEMENT_REPO_DIR = ['figma', 'console-mcp'].join('-');
export const DESKTOP_BRIDGE_CODE_PATH = `/tmp/${MCP_MANAGEMENT_REPO_DIR}/figma-desktop-bridge/code.js`;

function getOracleResultType(method: string): string {
  if (method === 'GET_COMPONENT') {
    return 'COMPONENT_DATA';
  }
  return `${method}_RESULT`;
}

export class OracleClient {
  private connected = false;
  private requestCounter = 0;
  private figmaInstance: MockFigma | null = null;
  private messages: Array<Record<string, unknown>> = [];

  async connect(): Promise<void> {
    if (!fs.existsSync(DESKTOP_BRIDGE_CODE_PATH)) {
      throw new Error(`Oracle bridge source not found at ${DESKTOP_BRIDGE_CODE_PATH}`);
    }

    this.messages = [];
    this.figmaInstance = createMockFigma((msg) => {
      this.messages.push(msg);
    });

    const sandbox = {
      figma: this.figmaInstance,
      __html__: '<div></div>',
      console,
      setTimeout,
      clearTimeout,
      Promise,
      Date,
      Array,
      Object,
      Uint8Array,
      Buffer,
    } as Record<string, unknown>;

    const source = fs.readFileSync(path.resolve(DESKTOP_BRIDGE_CODE_PATH), 'utf8');
    vm.runInNewContext(source, sandbox, {
      filename: 'desktop-bridge-code.js',
      timeout: 5_000,
    });

    // Allow startup async tasks (variables warmup, listeners registration)
    await new Promise((resolve) => setTimeout(resolve, 20));

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.messages = [];
    this.figmaInstance = null;
  }

  async sendCommand(method: string, params: Record<string, unknown>): Promise<CompatResponse> {
    if (!this.connected || !this.figmaInstance || !this.figmaInstance.ui.onmessage) {
      return {
        ok: false,
        errorCode: 'NOT_CONNECTED',
        errorMessage: 'Oracle client is disconnected',
        rawType: 'CLIENT_ERROR',
      };
    }

    const requestId = `oracle-${++this.requestCounter}`;
    const startIndex = this.messages.length;

    await this.figmaInstance.ui.onmessage({
      type: method,
      requestId,
      ...params,
    });

    return this.waitForResponse(method, requestId, startIndex);
  }

  private async waitForResponse(
    method: string,
    requestId: string,
    startIndex: number,
  ): Promise<CompatResponse> {
    const deadline = Date.now() + 1_000;
    const expectedType = getOracleResultType(method);

    while (Date.now() < deadline) {
      const slice = this.messages.slice(startIndex);
      for (const message of slice) {
        if (message.requestId !== requestId) {
          continue;
        }

        // GET_COMPONENT has different event naming in the original bridge implementation
        if (method === 'GET_COMPONENT') {
          if (message.type === 'COMPONENT_DATA') {
            const data =
              message.data && typeof message.data === 'object'
                ? (message.data as Record<string, unknown>)
                : {};
            return {
              ok: true,
              payload: data,
              rawType: 'COMPONENT_DATA',
            };
          }

          if (message.type === 'COMPONENT_ERROR') {
            const errorMessage = typeof message.error === 'string' ? message.error : 'Unknown error';
            return {
              ok: false,
              errorMessage,
              rawType: 'COMPONENT_ERROR',
            };
          }
        }

        if (message.type !== expectedType) {
          continue;
        }

        const success = Boolean(message.success);
        if (!success) {
          const errorMessage = typeof message.error === 'string' ? message.error : 'Unknown error';
          return {
            ok: false,
            errorMessage,
            rawType: String(message.type),
          };
        }

        const payload = { ...message };
        delete payload.type;
        delete payload.requestId;
        delete payload.success;

        return {
          ok: true,
          payload,
          rawType: String(message.type),
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    return {
      ok: false,
      errorCode: 'TIMEOUT',
      errorMessage: `No response from oracle for ${method}`,
      rawType: 'TIMEOUT',
    };
  }
}
