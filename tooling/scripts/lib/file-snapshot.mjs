import fs from "node:fs";

export function captureFileSnapshot(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { exists: false, content: "" };
  }
  return {
    exists: true,
    content: fs.readFileSync(filePath, "utf8"),
  };
}

export function restoreFileSnapshot(filePath, snapshot) {
  if (!filePath) return;
  if (!snapshot?.exists) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return;
  }
  fs.writeFileSync(filePath, snapshot.content || "", "utf8");
}
