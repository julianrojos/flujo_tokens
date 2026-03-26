/**
 * Plugin Version Information
 *
 * Centralized version constants for the Figma plugin.
 *
 * Note: PLUGIN_BUILD is manually updated to reflect the current development phase.
 * In CI environments, consider deriving this from git commit hash or manifest.json version.
 * For local development, this fallback ensures consistent identification.
 */

/**
 * Plugin semantic version
 * Synced with manifest.json version when applicable.
 */
export const PLUGIN_VERSION = '1.0.0';

/**
 * Plugin build identifier (used for tracking builds in logs).
 * Manual update required when major protocol/architecture changes occur.
 * Current: direct-ws mode (no external DS Graph dependency).
 */
export const PLUGIN_BUILD = 'direct-ws-v1';
