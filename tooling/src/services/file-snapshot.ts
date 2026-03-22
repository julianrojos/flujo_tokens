/**
 * File snapshot utilities.
 * 
 * Provides simple file content capture and restore functionality
 * for temporary backups and atomic operations.
 */

import * as fs from "node:fs";
import type { FileSnapshot } from "../types/file-snapshot.js";

/**
 * Capture a snapshot of a file's content.
 * 
 * Returns a FileSnapshot with exists=false if the file doesn't exist or is not a file.
 */
export function captureFileSnapshot(filePath: string): FileSnapshot {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return { exists: false, content: "" };
  }
  return {
    exists: true,
    content: fs.readFileSync(filePath, "utf8"),
  };
}

/**
 * Restore a file from a snapshot.
 * 
 * If the snapshot indicates the file didn't exist (exists=false),
 * the file will be deleted if it currently exists.
 */
export function restoreFileSnapshot(filePath: string, snapshot: FileSnapshot): void {
  if (!filePath) return;
  
  if (!snapshot?.exists) {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true, recursive: true });
    }
    return;
  }
  
  const content = typeof snapshot.content === 'string' ? snapshot.content : "";
  fs.writeFileSync(filePath, content, "utf8");
}
