import { normalizeComponentLookupKey, splitComponentName } from "@/lib/component-identity";

export interface ComponentTableDisplayInfo {
  componentLabel: string;
  variantLabel: string;
}

function normalizePathSegment(value: string): string {
  const normalized = normalizeComponentLookupKey(value);
  if (normalized.length > 3 && normalized.endsWith("s") && !normalized.endsWith("ss")) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function splitComponentPath(value: string): string[] {
  return String(value || "")
    .trim()
    .split("/")
    .map((segment) => String(segment || "").trim())
    .filter(Boolean);
}

function isEquivalentPathPrefix(rawSegments: string[], canonicalSegments: string[]): boolean {
  if (canonicalSegments.length === 0 || rawSegments.length < canonicalSegments.length) {
    return false;
  }

  for (let index = 0; index < canonicalSegments.length; index += 1) {
    if (normalizePathSegment(rawSegments[index] || "") !== normalizePathSegment(canonicalSegments[index] || "")) {
      return false;
    }
  }

  return true;
}

/**
 * Derive the text shown in the By Component table.
 *
 * `displayName` is the canonical parent label from the component catalog when available.
 * Falling back to the parsed parent name keeps the table usable while catalog data loads.
 */
export function getComponentTableDisplayInfo(args: {
  componentName: string;
  parentDisplayName?: string | null;
}): ComponentTableDisplayInfo {
  const { componentName, parentDisplayName } = args;
  const rawName = String(componentName || "").trim();
  const canonicalParent = String(parentDisplayName || "").trim();
  const fallback = splitComponentName(rawName);

  if (!rawName) {
    return {
      componentLabel: canonicalParent,
      variantLabel: "",
    };
  }

  const rawSegments = splitComponentPath(rawName);
  const canonicalSegments = splitComponentPath(canonicalParent);

  if (canonicalParent && rawName.startsWith(`${canonicalParent}/`)) {
    return {
      componentLabel: canonicalParent,
      variantLabel: rawName.slice(canonicalParent.length + 1),
    };
  }

  if (canonicalParent && rawName.startsWith(`${canonicalParent},`)) {
    return {
      componentLabel: canonicalParent,
      variantLabel: rawName.slice(canonicalParent.length + 1).trim(),
    };
  }

  if (canonicalParent && isEquivalentPathPrefix(rawSegments, canonicalSegments)) {
    const variantSegments = rawSegments.slice(canonicalSegments.length);
    return {
      componentLabel: canonicalParent,
      variantLabel: variantSegments.join("/"),
    };
  }

  if (canonicalParent && !fallback.variantLabel) {
    if (rawName === canonicalParent) {
      return {
        componentLabel: canonicalParent,
        variantLabel: "",
      };
    }
    return {
      componentLabel: canonicalParent,
      variantLabel: rawName,
    };
  }

  return {
    componentLabel: canonicalParent || fallback.parentName,
    variantLabel: fallback.variantLabel,
  };
}
