import type { PluginWebSocket } from '../services/plugin-connection-manager.ts';

export function createMockConnInfo() {
  return {
    remote: {
      address: '127.0.0.1',
      port: 3000,
      addressType: 'IPv4',
    },
  };
}

export function createMockPluginSocket(): PluginWebSocket {
  return {
    readyState: 1,
    protocol: '',
    send: () => {},
    close: () => {},
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
  };
}

export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
