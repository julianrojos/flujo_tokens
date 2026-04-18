import fs from "node:fs";
import path from "node:path";

import { componentNameToSnakeCase, isSnakeCaseFileSlug } from "../component-name.mjs";
import { isPlainObject } from "../is-plain-object.mjs";
import { parseYamlDocument } from "../parse-frontmatter.mjs";
import {
  SPEC_PROPERTY_ALLOWED_TYPES,
  getSpecPropertyTypeInfo,
  normalizeSpecPropertyType,
  PROPERTY_FIELD_ORDER,
  hasCanonicalPropertyFieldOrder,
} from "../spec-property-types.mjs";
import { isTbdMarker } from "../tbd.mjs";
import {
  SPEC_ALLOWED_STATUS,
  SPEC_REQUIRED_TOP_LEVEL_FIELDS,
} from "../docs-config.mjs";
import { isValidNodeId } from "../node-id.mjs";

function splitSpecTokenValue(rawValue) {
  return String(rawValue || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function validateSpecPropertyContracts(filePath, specStatus, properties, report) {
  if (properties === undefined || properties === null) return { hasInvalidTypes: false };
  if (!Array.isArray(properties)) {
    report.errors.push({
      code: "SPEC01",
      file: filePath,
      message: "Field `properties` must be an array.",
    });
    return { hasInvalidTypes: true };
  }

  const allowedTypeList = Array.from(SPEC_PROPERTY_ALLOWED_TYPES).sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" }),
  );
  let hasInvalidTypes = false;

  for (let i = 0; i < properties.length; i += 1) {
    const prop = properties[i];
    if (!isPlainObject(prop)) {
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message: `Property entry at index ${i} must be an object.`,
      });
      continue;
    }

    const propName = String(prop.name || "").trim();
    if (!propName) {
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message: `Property entry at index ${i} is missing \`name\`.`,
      });
      continue;
    }

    const rawType = prop.type;
    const normalizedType = normalizeSpecPropertyType(rawType);
    const typeInfo = getSpecPropertyTypeInfo(rawType);
    if (!typeInfo) {
      hasInvalidTypes = true;
      const suggested =
        normalizedType === "variant"
          ? "enum"
          : normalizedType === "instance-swap"
            ? "instance_swap"
            : "";
      const suggestionText = suggested
        ? ` Suggested: \`type: ${suggested}\`.`
        : "";
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message:
          `Invalid property type for \`${propName}\`: \`${String(rawType ?? "").trim() || "missing"}\`. ` +
          `Expected one of: ${allowedTypeList.map((t) => `\`${t}\``).join(", ")}.` +
          suggestionText,
      });
      continue;
    }

    if (!("default" in prop)) {
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message: `Property \`${propName}\` is missing required field: \`default\`.`,
      });
    }

    if (!("required" in prop)) {
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message: `Property \`${propName}\` is missing required field: \`required\`.`,
      });
    } else if (typeof prop.required !== "boolean") {
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message: `Property \`${propName}\` field \`required\` must be a boolean.`,
      });
    }

    if (!("description" in prop)) {
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message: `Property \`${propName}\` is missing required field: \`description\`.`,
      });
    } else if (
      typeof prop.description !== "string" ||
      String(prop.description).trim().length === 0
    ) {
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message: `Property \`${propName}\` field \`description\` must be a non-empty string.`,
      });
    }

    if (typeInfo.requiresValues) {
      if (!("values" in prop)) {
        report.errors.push({
          code: "SPEC01",
          file: filePath,
          message: `Enum property \`${propName}\` is missing required field: \`values\`.`,
        });
      } else if (!Array.isArray(prop.values)) {
        report.errors.push({
          code: "SPEC01",
          file: filePath,
          message: `Enum property \`${propName}\` field \`values\` must be an array of strings.`,
        });
      } else {
        const values = prop.values.map((value) => String(value ?? "").trim());
        if (values.length === 0) {
          report.errors.push({
            code: "SPEC01",
            file: filePath,
            message: `Enum property \`${propName}\` field \`values\` must not be empty.`,
          });
        }
        const invalid = values.find((value) => !value || isTbdMarker(value));
        if (invalid) {
          report.errors.push({
            code: "SPEC01",
            file: filePath,
            message: `Enum property \`${propName}\` field \`values\` must contain concrete non-TBD strings.`,
            details: invalid,
          });
        }

        if ("default" in prop) {
          const defaultValue = prop.default;
          const defaultAsString = String(defaultValue ?? "").trim();
          const isDefaultTbd =
            typeof defaultValue === "string" && isTbdMarker(defaultAsString);
          if (specStatus === "ready" && isDefaultTbd) {
            report.errors.push({
              code: "SPEC01",
              file: filePath,
              message: `Spec is \`ready\` but enum property \`${propName}\` has \`default: TBD\`.`,
            });
          } else if (!isDefaultTbd && defaultAsString && !values.includes(defaultAsString)) {
            report.errors.push({
              code: "SPEC01",
              file: filePath,
              message:
                `Enum property \`${propName}\` has default \`${defaultAsString}\` not listed in \`values\`.`,
            });
          }
        }
      }
    } else if ("values" in prop && prop.values !== undefined) {
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message: `Property \`${propName}\` must omit \`values\` unless \`type: enum\`.`,
      });
    }

    if ("default" in prop) {
      const defaultValue = prop.default;
      const defaultAsString = typeof defaultValue === "string" ? defaultValue.trim() : "";
      const isDefaultTbd = typeof defaultValue === "string" && isTbdMarker(defaultAsString);
      if (specStatus === "ready" && isDefaultTbd) {
        report.errors.push({
          code: "SPEC01",
          file: filePath,
          message: `Spec is \`ready\` but property \`${propName}\` has \`default: TBD\`.`,
        });
      }

      if (!isDefaultTbd) {
        if (normalizedType === "boolean" && typeof defaultValue !== "boolean") {
          report.errors.push({
            code: "SPEC01",
            file: filePath,
            message: `Boolean property \`${propName}\` field \`default\` must be \`true\` or \`false\` (unquoted).`,
          });
        }
        if (
          (normalizedType === "text" || normalizedType === "instance_swap") &&
          typeof defaultValue !== "string"
        ) {
          report.errors.push({
            code: "SPEC01",
            file: filePath,
            message: `Property \`${propName}\` field \`default\` must be a string or \`TBD\`.`,
          });
        }
      }
    }
  }

  return { hasInvalidTypes };
}

function validateSpecPropertyOrder(filePath, properties, report, options = {}) {
  if (properties === undefined || properties === null) return;
  if (!Array.isArray(properties)) return;

  const skipGroupOrder = options.skipGroupOrder === true;
  let previousGroup = -1;
  const seenNames = new Set();

  for (let i = 0; i < properties.length; i += 1) {
    const prop = properties[i];
    if (!isPlainObject(prop)) continue;

    const propName = String(prop.name || "").trim();
    if (propName) {
      const nameKey = propName.toLowerCase();
      if (seenNames.has(nameKey)) {
        report.errors.push({
          code: "DET01",
          file: filePath,
          message: `Duplicate property name in spec properties: \`${propName}\`.`,
        });
      } else {
        seenNames.add(nameKey);
      }
    }

    if (skipGroupOrder) continue;

    const typeInfo = getSpecPropertyTypeInfo(prop.type);
    const currentGroup = typeInfo ? typeInfo.orderingGroup : 5;
    if (currentGroup < previousGroup) {
      report.errors.push({
        code: "DET01",
        file: filePath,
        message:
          "Properties must follow canonical type group order: " +
          "enum -> text -> boolean -> instance_swap -> other.",
      });
      break;
    }
    previousGroup = currentGroup;
  }

  if (!hasCanonicalPropertyFieldOrder(properties)) {
    report.errors.push({
      code: "DET01",
      file: filePath,
      message:
        "Property fields must follow canonical order: " +
        PROPERTY_FIELD_ORDER.join(", ") +
        ". Reorder the fields to match the canonical spec property order.",
    });
  }
}

function validateSpecTokenMapping(
  filePath,
  tokenMapping,
  registryIndexes,
  report,
  resolveTokenCandidate,
) {
  if (tokenMapping === undefined || tokenMapping === null) return;
  if (!isPlainObject(tokenMapping)) {
    report.errors.push({
      code: "SPEC01",
      file: filePath,
      message: "Field `token_mapping` must be an object.",
    });
    return;
  }

  const walk = (node, keyPath) => {
    if (typeof node === "string") {
      const values = splitSpecTokenValue(node);
      if (values.length === 0) {
        report.errors.push({
          code: "SPEC01",
          file: filePath,
          message: `Token mapping \`token_mapping.${keyPath}\` is empty.`,
        });
        return;
      }

      for (const tokenValue of values) {
        if (isTbdMarker(tokenValue)) continue;
        if (!tokenValue.includes("/") && !tokenValue.includes(".")) {
          report.errors.push({
            code: "SPEC01",
            file: filePath,
            message: `Token mapping \`token_mapping.${keyPath}\` is not a valid token path: \`${tokenValue}\`.`,
          });
          continue;
        }

        const resolution = resolveTokenCandidate(tokenValue, registryIndexes);
        if (!resolution.ok) {
          report.errors.push({
            code: "SPEC01",
            file: filePath,
            message: `Token mapping \`token_mapping.${keyPath}\`: ${resolution.message}`,
            suggested: resolution.suggested,
          });
        }
      }
      return;
    }

    if (isPlainObject(node)) {
      for (const [key, value] of Object.entries(node)) {
        const nextPath = keyPath ? `${keyPath}.${key}` : key;
        walk(value, nextPath);
      }
      return;
    }

    if (node === undefined || node === null) {
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message: `Token mapping \`token_mapping.${keyPath}\` is missing a token value.`,
      });
      return;
    }

    report.errors.push({
      code: "SPEC01",
      file: filePath,
      message: `Token mapping \`token_mapping.${keyPath}\` must be a string or object.`,
    });
  };

  walk(tokenMapping, "");
}

function validateSpecYamlFile({
  filePath,
  report,
  registryIndexes,
  resolveTokenCandidate,
  specComponentsDir,
  validateOptionalVersionBlock,
}) {
  let parsed;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    parsed = parseYamlDocument(raw, `spec YAML (${path.basename(filePath)})`);
  } catch (error) {
    report.errors.push({
      code: "SPEC01",
      file: filePath,
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  for (const field of SPEC_REQUIRED_TOP_LEVEL_FIELDS) {
    if (!(field in parsed)) {
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message: `Missing required top-level field: \`${field}\`.`,
      });
    }
  }

  const status = String(parsed.status || "").trim();
  if (!SPEC_ALLOWED_STATUS.has(status)) {
    report.errors.push({
      code: "SPEC01",
      file: filePath,
      message: "Field `status` must be one of: draft, ready.",
    });
  }

  const figma = parsed.figma;
  if (!figma || typeof figma !== "object" || Array.isArray(figma)) {
    report.errors.push({
      code: "SPEC01",
      file: filePath,
      message: "Field `figma` must be an object.",
    });
  } else {
    for (const key of ["file", "page", "component_set"]) {
      const value = String(figma[key] ?? "").trim();
      if (!value) {
        report.errors.push({
          code: "SPEC01",
          file: filePath,
          message: `Field figma.${key} is required.`,
        });
      }
    }

    const rawNodeId = String(figma.component_set_node_id ?? "").trim();
    const hasConcreteNodeId = rawNodeId && !isTbdMarker(rawNodeId);
    if (hasConcreteNodeId && !isValidNodeId(rawNodeId)) {
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message:
          "Field figma.component_set_node_id must use Figma node-id format `123:456` when declared.",
      });
    }
    if (status === "ready" && !hasConcreteNodeId) {
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message:
          "Field figma.component_set_node_id is required for `ready` specs to guarantee deterministic Figma placement.",
      });
    }
  }

  if (registryIndexes) {
    validateSpecTokenMapping(
      filePath,
      parsed.token_mapping,
      registryIndexes,
      report,
      resolveTokenCandidate,
    );
  }

  validateOptionalVersionBlock({
    filePath,
    versionNode: parsed.version,
    allowedKeys: new Set(["spec", "component"]),
    report,
    context: "Spec",
  });

  const propertyContracts = validateSpecPropertyContracts(
    filePath,
    String(parsed.status || "").trim(),
    parsed.properties,
    report,
  );
  validateSpecPropertyOrder(filePath, parsed.properties, report, {
    skipGroupOrder: Boolean(propertyContracts && propertyContracts.hasInvalidTypes),
  });

  const specBase = path.basename(filePath, path.extname(filePath));
  if (!isSnakeCaseFileSlug(specBase)) {
    const suggestedBase = componentNameToSnakeCase(specBase);
    const suggestedPath = suggestedBase
      ? path.join(path.dirname(filePath), `${suggestedBase}.yml`)
      : null;
    report.errors.push({
      code: "NAME01",
      file: filePath,
      message:
        "Component spec filename must be snake_case (example: `status_bar.yml`).",
      suggested: suggestedPath
        ? path.relative(process.cwd(), suggestedPath)
        : undefined,
    });
  }

  const specDisplayName = String(parsed.name || "").trim();
  if (specDisplayName && !isTbdMarker(specDisplayName)) {
    const expectedBase = componentNameToSnakeCase(specDisplayName);
    if (expectedBase && expectedBase !== specBase) {
      report.errors.push({
        code: "NAME02",
        file: filePath,
        message:
          `Spec \`name: ${specDisplayName}\` does not match filename. ` +
          `Expected \`${expectedBase}.yml\`.`,
        suggested: path.relative(
          process.cwd(),
          path.join(path.dirname(filePath), `${expectedBase}.yml`),
        ),
      });
    }
  }
}

export function validateSpecYamlFiles({
  specRoot,
  report,
  registryIndexes,
  explicitSpecFilePath = null,
  collectSpecFiles,
  resolveTokenCandidate,
  specComponentsDir,
  validateOptionalVersionBlock,
}) {
  const files = explicitSpecFilePath
    ? [path.resolve(explicitSpecFilePath)]
    : collectSpecFiles(specRoot);

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) {
      report.errors.push({
        code: "SPEC01",
        file: filePath,
        message: "Spec YAML file not found.",
      });
      continue;
    }
    report.summary.specFilesChecked += 1;
    validateSpecYamlFile({
      filePath,
      report,
      registryIndexes,
      resolveTokenCandidate,
      specComponentsDir,
      validateOptionalVersionBlock,
    });
  }
}
