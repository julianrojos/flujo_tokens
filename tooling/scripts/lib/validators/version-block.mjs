import { isPlainObject } from "../is-plain-object.mjs";
import { isTbdMarker } from "../tbd.mjs";

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function validateOptionalVersionBlock({
  filePath,
  versionNode,
  allowedKeys,
  report,
  context,
}) {
  if (versionNode === undefined || versionNode === null || versionNode === "")
    return;

  if (!isPlainObject(versionNode)) {
    report.errors.push({
      code: "VER01",
      file: filePath,
      message: `${context} \`version\` must be an object when declared.`,
    });
    return;
  }

  for (const [key, rawValue] of Object.entries(versionNode)) {
    if (!allowedKeys.has(key)) {
      report.errors.push({
        code: "VER01",
        file: filePath,
        message: `${context} version key \`${key}\` is not allowed.`,
      });
      continue;
    }

    const value = String(rawValue ?? "").trim();
    if (!value || isTbdMarker(value) || !SEMVER_RE.test(value)) {
      report.errors.push({
        code: "VER01",
        file: filePath,
        message: `${context} version \`${key}\` must be a SemVer string (for example \`1.2.3\`).`,
      });
    }
  }
}
