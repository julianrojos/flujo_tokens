import { dispatchRequest } from '../../src/bridge/dispatcher';
import type { BridgeMethod } from '../../src/bridge/protocol';
import { createMockFigma, type MockFigma } from './mock-figma';

export interface CompatResponse {
  ok: boolean;
  payload?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  rawType: string;
}

export class CandidateClient {
  private connected = false;
  private requestCounter = 0;
  private figmaInstance: MockFigma | null = null;

  async connect(): Promise<void> {
    this.figmaInstance = createMockFigma();
    (globalThis as unknown as { figma: MockFigma }).figma = this.figmaInstance;
    (globalThis as unknown as { __html__: string }).__html__ = '<div></div>';
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      delete (globalThis as unknown as { figma?: MockFigma }).figma;
      delete (globalThis as unknown as { __html__?: string }).__html__;
    }
    this.connected = false;
    this.figmaInstance = null;
  }

  async sendCommand(method: string, params: Record<string, unknown>): Promise<CompatResponse> {
    if (!this.connected) {
      return {
        ok: false,
        errorCode: 'NOT_CONNECTED',
        errorMessage: 'Candidate client is disconnected',
        rawType: 'CLIENT_ERROR',
      };
    }

    const requestId = `candidate-${++this.requestCounter}`;

    const response = await dispatchRequest({
      id: requestId,
      method: method as BridgeMethod,
      params,
    });

    if ('error' in response) {
      return {
        ok: false,
        errorCode: response.error.code,
        errorMessage: response.error.message,
        rawType: 'ERROR',
      };
    }

    const payload =
      response.result && typeof response.result === 'object'
        ? (response.result as Record<string, unknown>)
        : { value: response.result };

    return {
      ok: true,
      payload,
      rawType: 'RESULT',
    };
  }
}
