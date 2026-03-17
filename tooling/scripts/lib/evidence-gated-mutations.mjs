import { isPlainObject } from "./is-plain-object.mjs";

const UNKNOWN_STRING_MARKER =
  /^(?:tbd|unknown|unverified|not[-_\s]?defined|n\/a|na)$/i;

function isScalar(value) {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function scalarToComparable(value) {
  if (value === undefined) return "";
  if (value === null) return "";
  if (typeof value === "number" && Number.isNaN(value)) return "NaN";
  if (typeof value === "string") return value.trim();
  return String(value);
}

function isUnknownScalar(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return true;
    return UNKNOWN_STRING_MARKER.test(trimmed);
  }
  return false;
}

function pushPath(prefix, key) {
  if (!prefix) return String(key);
  if (/^\[\d+\]$/.test(String(key))) return `${prefix}${key}`;
  return `${prefix}.${key}`;
}

function flattenScalars(node, prefix = "", output = new Map()) {
  if (isScalar(node)) {
    output.set(prefix || "$", node);
    return output;
  }

  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      flattenScalars(node[index], pushPath(prefix, `[${index}]`), output);
    }
    return output;
  }

  if (isPlainObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      flattenScalars(value, pushPath(prefix, key), output);
    }
    return output;
  }

  output.set(prefix || "$", scalarToComparable(node));
  return output;
}

function isAllowedKnownToKnown(pathKey, allowedPrefixes) {
  for (const prefixRaw of allowedPrefixes || []) {
    const prefix = String(prefixRaw || "").trim();
    if (!prefix) continue;
    if (pathKey === prefix) return true;
    if (pathKey.startsWith(`${prefix}.`)) return true;
    if (pathKey.startsWith(`${prefix}[`)) return true;
  }
  return false;
}

function formatViolation(violation) {
  return (
    `- [${violation.kind}] ${violation.path}: ` +
    `\`${scalarToComparable(violation.before)}\` -> \`${scalarToComparable(violation.after)}\``
  );
}

export function assertEvidenceGatedScalarChanges({
  before,
  after,
  allowedKnownToKnownPrefixes = [],
  label = "document",
}) {
  const beforeMap = flattenScalars(before);
  const afterMap = flattenScalars(after);
  const allPaths = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const violations = [];

  for (const pathKey of allPaths) {
    const beforeValue = beforeMap.get(pathKey);
    const afterValue = afterMap.get(pathKey);
    const beforeComparable = scalarToComparable(beforeValue);
    const afterComparable = scalarToComparable(afterValue);
    if (beforeComparable === afterComparable) continue;

    const beforeUnknown = isUnknownScalar(beforeValue);
    const afterUnknown = isUnknownScalar(afterValue);

    if (!beforeUnknown && afterUnknown) {
      violations.push({
        kind: "known_to_unknown",
        path: pathKey,
        before: beforeValue,
        after: afterValue,
      });
      continue;
    }

    if (!beforeUnknown && !afterUnknown) {
      if (!isAllowedKnownToKnown(pathKey, allowedKnownToKnownPrefixes)) {
        violations.push({
          kind: "non_evidence_update",
          path: pathKey,
          before: beforeValue,
          after: afterValue,
        });
      }
    }
  }

  if (violations.length === 0) return;

  const details = violations.map((item) => formatViolation(item)).join("\n");
  throw new Error(
    `Evidence-gated mutation policy violation in ${label}.\n` +
      "Known values can only change with evidence-backed paths.\n" +
      `${details}`,
  );
}

export function readDocStatus(frontmatter) {
  if (!isPlainObject(frontmatter)) return "";
  return String(frontmatter.doc_status || "").trim();
}

export function assertDocStatusStable({
  beforeFrontmatter,
  afterFrontmatter,
  allowDocStatusChange = false,
  label = "markdown frontmatter",
}) {
  if (allowDocStatusChange) return;
  const beforeStatus = readDocStatus(beforeFrontmatter);
  const afterStatus = readDocStatus(afterFrontmatter);
  if (!beforeStatus || !afterStatus || beforeStatus === afterStatus) return;

  throw new Error(
    `Evidence-gated mutation policy violation in ${label}: ` +
      `doc_status changed from \`${beforeStatus}\` to \`${afterStatus}\` without explicit override.`,
  );
}
