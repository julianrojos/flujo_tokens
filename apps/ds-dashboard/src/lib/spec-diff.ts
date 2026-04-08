import type { SpecDiffEntry } from "../types/spec-editor";

type FlatSpecMap = Map<string, string>;

function toStableString(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => normalizeValue(item)));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort((left, right) =>
      left.localeCompare(right, "en", { sensitivity: "base" }),
    )) {
      normalized[key] = normalizeValue(record[key]);
    }
    return JSON.stringify(normalized);
  }
  return String(value);
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item));
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort((left, right) =>
    left.localeCompare(right, "en", { sensitivity: "base" }),
  )) {
    normalized[key] = normalizeValue(record[key]);
  }
  return normalized;
}

function appendObjectPath(basePath: string, key: string): string {
  return basePath ? `${basePath}.${key}` : key;
}

function appendArrayPath(basePath: string, index: number): string {
  return `${basePath}[${index}]`;
}

function flattenSpec(value: unknown, basePath = "", target: FlatSpecMap = new Map()) {
  if (Array.isArray(value)) {
    if (value.length === 0 && basePath) {
      target.set(basePath, "[]");
      return target;
    }
    value.forEach((item, index) => {
      flattenSpec(item, appendArrayPath(basePath, index), target);
    });
    return target;
  }

  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0 && basePath) {
      target.set(basePath, "{}");
      return target;
    }
    keys
      .sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }))
      .forEach((key) => {
        flattenSpec(
          (value as Record<string, unknown>)[key],
          appendObjectPath(basePath, key),
          target,
        );
      });
    return target;
  }

  if (basePath) {
    target.set(basePath, toStableString(value));
  }
  return target;
}

function classifyCategory(path: string): SpecDiffEntry["category"] {
  if (path === "name" || path === "status" || path.startsWith("version")) return "metadata";
  if (path.startsWith("figma")) return "figma";
  if (path.startsWith("summary")) return "summary";
  if (path.startsWith("properties")) return "properties";
  if (path.startsWith("token_mapping")) return "token_mapping";
  if (path.startsWith("accessibility")) return "accessibility";
  if (path.startsWith("content_guidelines") || path.startsWith("best_practices")) return "content";
  if (path.startsWith("qa")) return "qa";
  if (path.startsWith("related_components")) return "related_components";
  return "other";
}

function classifyRisk(path: string): SpecDiffEntry["risk"] {
  if (
    path === "name" ||
    path === "status" ||
    path.startsWith("figma.component_set_node_id") ||
    path.startsWith("properties") ||
    path.startsWith("token_mapping")
  ) {
    return "high";
  }
  if (path.startsWith("accessibility") || path.startsWith("figma")) {
    return "medium";
  }
  return "low";
}

export function buildSpecDiff(beforeSpec: unknown, afterSpec: unknown): SpecDiffEntry[] {
  const beforeMap = flattenSpec(beforeSpec);
  const afterMap = flattenSpec(afterSpec);
  const allPaths = new Set<string>([...beforeMap.keys(), ...afterMap.keys()]);

  const diffs: SpecDiffEntry[] = [];
  for (const path of Array.from(allPaths).sort((left, right) =>
    left.localeCompare(right, "en", { sensitivity: "base" }),
  )) {
    const beforeValue = beforeMap.get(path);
    const afterValue = afterMap.get(path);

    if (beforeValue === afterValue) continue;

    let kind: SpecDiffEntry["kind"] = "changed";
    if (beforeValue === undefined) kind = "added";
    if (afterValue === undefined) kind = "removed";

    diffs.push({
      kind,
      path,
      beforeValue: beforeValue ?? null,
      afterValue: afterValue ?? null,
      category: classifyCategory(path),
      risk: classifyRisk(path),
    });
  }

  return diffs;
}

