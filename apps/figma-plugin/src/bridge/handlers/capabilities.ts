/**
 * Bridge Capabilities Handler
 *
 * Returns the capabilities of the bridge/plugin for direct mode.
 */

import { PLUGIN_VERSION, PLUGIN_BUILD } from '../../version';
import { getSupportedMethods } from '../dispatcher';

export interface BridgeCapabilitiesResult {
  supportedMethods: string[];
  pluginVersion: string;
  pluginBuild: string;
  timestamp: number;
}

/**
 * Handle GET_BRIDGE_CAPABILITIES request.
 * Returns the list of supported bridge methods and plugin metadata.
 * Note: supportedMethods is derived from actually registered handlers, not the protocol enum.
 */
export async function handleGetBridgeCapabilities(): Promise<BridgeCapabilitiesResult> {
  return {
    supportedMethods: getSupportedMethods(),
    pluginVersion: PLUGIN_VERSION,
    pluginBuild: PLUGIN_BUILD,
    timestamp: Date.now(),
  };
}
