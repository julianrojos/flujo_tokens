import { splitComponentName } from "@/lib/component-identity";

export interface ComponentTableDisplayInfo {
  componentLabel: string;
  variantLabel: string;
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
