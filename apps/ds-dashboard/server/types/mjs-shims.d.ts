/**
 * Minimal ambient shims for third-party modules without bundled types.
 */

declare module '@hono/node-server/conninfo' {
  export function getConnInfo(c: unknown): {
    remote: {
      address: string;
      port?: number;
      addressType?: string;
    };
  };

  export interface ConnInfo {
    remote: {
      address: string;
      port?: number;
      addressType?: string;
    };
  }
}
