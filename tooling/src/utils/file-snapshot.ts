/**
 * File Snapshot Utilities
 *
 * Utilities for capturing and restoring file snapshots.
 * Used for rollback on failed operations.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export interface FileSnapshot {
  exists: boolean;
  content: string;
}

/**
 * Capture a snapshot of a file's current content.
 *
 * @param filePath - Path to the file to snapshot
 * @returns Snapshot object with exists flag and content
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
 * Restore a file from a previously captured snapshot.
 *
 * @param filePath - Path to the file to restore
 * @param snapshot - Snapshot object to restore from
 */
export function restoreFileSnapshot(filePath: string, snapshot: FileSnapshot): void {
  if (!filePath) return;
  if (!snapshot?.exists) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return;
  }
  fs.writeFileSync(filePath, snapshot.content || '', 'utf8');
}

/**
 * Write JSON to file atomically using temp file + rename.
 *
 * @param filePath - Path to the JSON file
 * @param payload - Data to write as JSON
 */
export function writeJsonAtomic(filePath: string, payload: unknown): void {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const uniqueId = crypto.randomBytes(4).toString('hex');
  const tempPath = `${resolved}.${process.pid}.${Date.now()}.${uniqueId}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, resolved);
}
