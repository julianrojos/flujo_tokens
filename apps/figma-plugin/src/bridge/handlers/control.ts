/**
 * Control Handlers
 *
 * Handlers for control methods:
 * - CLEAR_CONSOLE (no-op controlled)
 * - RELOAD_UI
 */

import {
  ClearConsoleParams,
  ClearConsoleResult,
  ReloadUIParams,
  ReloadUIResult,
  createBridgeError,
  ERROR_CODES,
} from '../protocol';

/**
 * CLEAR_CONSOLE - No-op control for console buffer management.
 * Console buffer is maintained server-side.
 */
export function handleClearConsole(
  _params: ClearConsoleParams
): ClearConsoleResult {
  // This is a no-op - console buffer management is server-side
  return {
    cleared: true,
  };
}

/**
 * RELOAD_UI - Reload the plugin UI iframe.
 * Uses figma.showUI(__html__) to reload without restarting code.ts
 */
export async function handleReloadUI(
  _params: ReloadUIParams
): Promise<ReloadUIResult> {
  try {
    console.log('[Bridge] Reloading plugin UI');

    // Short delay to let the response message be sent before reload
    setTimeout(() => {
      const pluginGlobal = globalThis as typeof globalThis & {
        figma?: { showUI: (html: string, options: { width: number; height: number }) => void };
        __html__?: string;
      };
      if (!pluginGlobal.figma || typeof pluginGlobal.figma.showUI !== 'function') {
        return;
      }
      pluginGlobal.figma.showUI(pluginGlobal.__html__ ?? '', {
        width: 320,
        height: 460,
      });
    }, 100);

    return {
      success: true,
    };
  } catch (error) {
    throw createBridgeError(
      ERROR_CODES.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'Failed to reload UI'
    );
  }
}
