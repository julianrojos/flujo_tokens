/**
 * Figma URL Parser
 *
 * Extracts file key and node ID from Figma URLs.
 */

import { normalizeNodeId } from './figma-node-id.js';

export interface ParsedFigmaUrl {
    fileKey: string;
    nodeId: string;
}

/**
 * Parse a Figma URL to extract fileKey and nodeId.
 */
export function parseFigmaUrl(figmaUrl: string | null | undefined): ParsedFigmaUrl {
    if (!figmaUrl) return { fileKey: '', nodeId: '' };

    let url: URL;
    try {
        url = new URL(figmaUrl);
    } catch {
        return { fileKey: '', nodeId: '' };
    }

    const pathnameParts = url.pathname.split('/').filter(Boolean);
    const keyRootIndex = pathnameParts.findIndex(
        (part) => part === 'design' || part === 'file',
    );
    const fileKey =
        keyRootIndex >= 0 && pathnameParts[keyRootIndex + 1]
            ? pathnameParts[keyRootIndex + 1]
            : '';

    const nodeParamKeys = ['node-id', 'node_id', 'nodeId'];
    let rawNodeId = '';

    for (const key of nodeParamKeys) {
        const value = url.searchParams.get(key);
        if (value) {
            rawNodeId = value;
            break;
        }
    }

    if (!rawNodeId) {
        const hashRaw = String(url.hash || '').replace(/^#/, '');
        if (hashRaw) {
            const hashParams = new URLSearchParams(hashRaw.replace(/^[/?]+/, ''));
            for (const key of nodeParamKeys) {
                const value = hashParams.get(key);
                if (value) {
                    rawNodeId = value;
                    break;
                }
            }

            if (!rawNodeId) {
                const match = hashRaw.match(/(?:^|[?&])node-?id=([^&]+)/i);
                if (match && match[1]) {
                    rawNodeId = decodeURIComponent(match[1]);
                }
            }
        }
    }

    const nodeId = normalizeNodeId(rawNodeId);
    return { fileKey, nodeId };
}
