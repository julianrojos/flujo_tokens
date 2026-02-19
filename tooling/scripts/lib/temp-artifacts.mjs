import fs from "node:fs";
import path from "node:path";

function resolveFilePath(filePath) {
  const normalized = String(filePath || "").trim();
  if (!normalized) return "";
  return path.resolve(normalized);
}

export class TempArtifactManager {
  constructor({ keep = false } = {}) {
    this.keep = Boolean(keep);
    this.trackedFiles = new Set();
    this._hooksAttached = false;
  }

  attachProcessHooks() {
    if (this._hooksAttached) return;
    this._hooksAttached = true;
    process.once("exit", () => {
      this.cleanup();
    });
  }

  track(filePath) {
    const resolved = resolveFilePath(filePath);
    if (!resolved) return "";
    this.trackedFiles.add(resolved);
    return resolved;
  }

  writeTrackedFile(filePath, content, encoding = "utf8") {
    const resolved = this.track(filePath);
    if (!resolved) {
      throw new Error("Cannot write tracked temp artifact: missing file path.");
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, String(content || ""), encoding);
    return resolved;
  }

  remove(filePath) {
    const resolved = resolveFilePath(filePath);
    if (!resolved) return false;
    if (!fs.existsSync(resolved)) return false;
    const stats = fs.statSync(resolved);
    if (!stats.isFile()) return false;
    fs.unlinkSync(resolved);
    this.trackedFiles.delete(resolved);
    return true;
  }

  purgeMatching({ dir, matcher }) {
    const resolvedDir = path.resolve(String(dir || ""));
    if (!resolvedDir || !fs.existsSync(resolvedDir)) return [];
    const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
    const removed = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const absolutePath = path.join(resolvedDir, entry.name);
      if (!matcher(entry.name, absolutePath)) continue;
      fs.unlinkSync(absolutePath);
      this.trackedFiles.delete(absolutePath);
      removed.push(absolutePath);
    }
    return removed;
  }

  cleanup() {
    if (this.keep) return { removed: [], kept: Array.from(this.trackedFiles) };
    const removed = [];
    for (const filePath of this.trackedFiles) {
      if (!fs.existsSync(filePath)) continue;
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) continue;
      fs.unlinkSync(filePath);
      removed.push(filePath);
    }
    this.trackedFiles.clear();
    return { removed, kept: [] };
  }
}
