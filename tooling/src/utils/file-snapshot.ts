/**
 * File Snapshot Utility
 *
 * Captures and restores the state of a file on disk.
 * Used for rollbacks and validation.
 */

import * as fs from 'node:fs';

export interface FileSnapshot {
    exists: boolean;
    content: string;
}

/**
 * Captures current file existence and content.
 */
export function captureFileSnapshot(filePath: string): FileSnapshot {
    if (!filePath || !fs.existsSync(filePath)) {
        return { exists: false, content: '' };
    }
    return {
        exists: true,
        content: fs.readFileSync(filePath, 'utf8'),
    };
}

/**
 * Restores a file to a previous snapshot state.
 */
export function restoreFileSnapshot(filePath: string, snapshot: FileSnapshot): void {
    if (!filePath) return;
    if (!snapshot?.exists) {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        return;
    }
    fs.writeFileSync(filePath, snapshot.content || '', 'utf8');
}
