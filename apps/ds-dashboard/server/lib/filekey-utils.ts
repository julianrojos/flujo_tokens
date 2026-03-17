/**
 * FileKey Utilities
 *
 * Shared utilities for extracting fileKey from Figma URLs and resolving
 * fileKey with ambiguity guard for multi-connection scenarios.
 *
 * This module centralizes logic that was duplicated across multiple routes.
 */

import { getPluginConnectionManager } from '../services/plugin-connection-manager.ts';

/**
 * Extract fileKey from a Figma URL
 *
 * Supports both /file/ and /design/ URL formats:
 * - https://www.figma.com/file/ABC123...
 * - https://www.figma.com/design/ABC123...
 *
 * @param url - Figma URL to extract fileKey from
 * @returns The fileKey or null if not found
 */
export function extractFileKey(url: string): string | null {
    try {
        const match = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

/**
 * Error response structure for fileKey resolution failures
 */
export interface FileKeyError {
    ok: false;
    code: string;
    message: string;
}

/**
 * Plugin connection manager type
 */
type PluginConnectionManager = ReturnType<typeof getPluginConnectionManager>;

/**
 * Result of resolving a fileKey
 */
export type FileKeyResult =
    | { fileKey: string | null }
    | FileKeyError;

/**
 * Error code configuration for resolveFileKey
 */
export interface FileKeyErrorCodes {
    ambiguous: string;
    noSocket: string;
    ambiguousMessage: string;
    noSocketMessage: string;
}

/**
 * Resolve fileKey with ambiguity guard
 *
 * When no explicit fileUrl is provided, checks for single active connection.
 * Returns an error if multiple connections are active (ambiguity).
 * Returns the single active fileKey if only one connection exists.
 *
 * @param fileUrl - Optional Figma URL to extract fileKey from
 * @param manager - Plugin connection manager instance
 * @param errorCodes - Optional custom error codes (defaults to variables_v2.* for backwards compat)
 * @returns Resolved fileKey or error object
 */
export function resolveFileKey(
    fileUrl: string | undefined,
    manager: PluginConnectionManager,
    errorCodes?: FileKeyErrorCodes
): FileKeyResult {
    const fileKey = fileUrl ? extractFileKey(fileUrl) : null;

    if (fileKey) {
        return { fileKey };
    }

    // Ambiguity guard
    const connectionCount = manager.getConnectionCount();
    const activeFileKeys = manager.getActiveFileKeys();

    if (connectionCount === 0) {
        return {
            ok: false,
            code: errorCodes?.noSocket ?? 'variables_v2.no_socket',
            message: errorCodes?.noSocketMessage ?? 'No plugin connection available. Please ensure the Figma plugin is running.',
        };
    }

    // True ambiguity: multiple different files connected
    if (activeFileKeys.length > 1) {
        return {
            ok: false,
            code: errorCodes?.ambiguous ?? 'variables_v2.ambiguous_file_key',
            message: errorCodes?.ambiguousMessage ?? 'Multiple plugin connections for different files detected. Provide a fileUrl to specify which file to fetch from.',
        };
    }

    // Auto-resolve: single fileKey from active connections
    if (activeFileKeys.length === 1) {
        return { fileKey: activeFileKeys[0] };
    }

    // If activeFileKeys.length === 0 but connectionCount > 0:
    // - If connectionCount === 1: allow draft/unkeyed file (fileKey remains null)
    // - If connectionCount > 1: multiple unkeyed connections is ambiguous
    if (connectionCount > 1) {
        return {
            ok: false,
            code: errorCodes?.ambiguous ?? 'variables_v2.ambiguous_file_key',
            message: errorCodes?.ambiguousMessage ?? 'Multiple plugin connections without fileKey detected. Provide a fileUrl to specify which file to fetch from.',
        };
    }

    // Single unkeyed connection (draft file)
    return { fileKey: null };
}

/**
 * Type guard to check if a FileKeyResult is a success
 */
export function isFileKeySuccess(result: FileKeyResult): result is { fileKey: string | null } {
    return 'fileKey' in result;
}

/**
 * Resolve fileKey using the global plugin connection manager
 *
 * Convenience wrapper that uses the default getPluginConnectionManager().
 *
 * @param fileUrl - Optional Figma URL to extract fileKey from
 * @param errorCodes - Optional custom error codes
 * @returns Resolved fileKey or error object
 */
export function resolveFileKeyFromManager(
    fileUrl: string | undefined,
    errorCodes?: FileKeyErrorCodes
): FileKeyResult {
    const manager = getPluginConnectionManager();
    return resolveFileKey(fileUrl, manager, errorCodes);
}
