export function normalizeNodeId(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.includes(":")) return value;
  if (value.includes("-")) {
    const parts = value.split("-").filter(Boolean);
    if (parts.length === 2) return `${parts[0]}:${parts[1]}`;
  }
  return value;
}
