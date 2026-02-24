export function parseBooleanOption(rawValue, optionName, fallback = false) {
  const normalized = String(rawValue ?? fallback).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`Invalid ${optionName} value: ${rawValue}. Allowed: true, false.`);
}

export function parsePositiveNumber(rawValue, optionName, fallback) {
  const parsed = Number(rawValue ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid ${optionName} value: ${rawValue}. Expected a positive number.`,
    );
  }
  return parsed;
}

export function parseComponentKind(rawValue) {
  const normalized = String(rawValue || "component_set")
    .trim()
    .toLowerCase();
  if (
    normalized === "component_set" ||
    normalized === "component" ||
    normalized === "all"
  ) {
    return normalized;
  }
  throw new Error(
    `Invalid --component-kind value: ${rawValue}. Allowed: component_set, component, all.`,
  );
}

export function parseMainCaptureMode(rawValue) {
  const normalized = String(rawValue || "rest")
    .trim()
    .toLowerCase();
  if (normalized === "auto" || normalized === "agent" || normalized === "rest") {
    return normalized;
  }
  throw new Error(
    `Invalid --main-capture-mode value: ${rawValue}. Allowed: auto, agent, rest.`,
  );
}
