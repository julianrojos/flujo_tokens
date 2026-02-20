#!/usr/bin/env node

/**
 * Idempotent spec property sorter.
 * Sorts the `properties` array in component spec YAML files to canonical order:
 *   Group 1: enum      (VARIANT)
 *   Group 2: text      (TEXT)
 *   Group 3: boolean   (BOOLEAN)
 *   Group 4: instance_swap (INSTANCE_SWAP)
 *   Group 5: other/unknown
 *
 * Within each group, original Figma/source order is preserved (stable sort).
 * Property object field order is normalized to: name, type, values, default, required, description.
 *
 * Ordering rules are sourced from tooling/lib/property-type-map.json.
 * See component-spec-properties-order.mdc for the full rule definition.
 *
 * Usage:
 *   npm run ds:sort-spec -- --file <path>   # Sort a single spec file
 *   npm run ds:sort-spec -- --all           # Sort all spec files
 *   npm run ds:sort-spec -- --check         # Check only, exit 1 if any file needs sorting
 *   npm run ds:sort-spec -- --check --file <path>
 *
 * Options:
 *   --file <path>   Spec YAML file to sort (may be repeated)
 *   --all           Sort all files in docs/_spec/components/*.yml
 *   --check         Dry-run: report unsorted files, exit 1 if any found
 *   --json          Output JSON result
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import yaml from "js-yaml";

import { parseArgs } from "./lib/parse-args.mjs";
import { DOCS_SPEC_DIR } from "./lib/paths.mjs";
import { isPlainObject } from "./lib/is-plain-object.mjs";
import {
  normalizeSpecPropertyType,
  getSpecPropertyTypeInfo,
  PROPERTY_FIELD_ORDER,
  hasCanonicalPropertyFieldOrder,
} from "./lib/spec-property-types.mjs";

const require = createRequire(import.meta.url);
const TYPE_MAP = require("../lib/property-type-map.json");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export { PROPERTY_FIELD_ORDER };

/** Max ordering group (unknown/other types). */
const UNKNOWN_GROUP = Object.keys(TYPE_MAP.type_metadata).length + 1;

// ---------------------------------------------------------------------------
// Sort logic
// ---------------------------------------------------------------------------

/**
 * Returns the ordering group number for a given property type string.
 * Unknown types get group UNKNOWN_GROUP (5).
 */
function groupFor(rawType) {
  const typeInfo = getSpecPropertyTypeInfo(rawType);
  return typeInfo ? typeInfo.orderingGroup : UNKNOWN_GROUP;
}

/**
 * Normalize field order within a single property object.
 * Canonical order defined by PROPERTY_FIELD_ORDER (spec-property-types.mjs).
 * Extra keys are preserved, appended after the canonical keys.
 */
function normalizePropertyFieldOrder(prop) {
  if (!isPlainObject(prop)) return prop;
  const result = {};
  for (const key of PROPERTY_FIELD_ORDER) {
    if (key in prop) result[key] = prop[key];
  }
  for (const [key, value] of Object.entries(prop)) {
    if (!(key in result)) result[key] = value;
  }
  return result;
}

/**
 * Sort properties array to canonical group order. Stable within each group.
 * Returns a new array; does not mutate the original.
 */
function sortProperties(properties) {
  if (!Array.isArray(properties)) return properties;
  return properties
    .map((prop, originalIndex) => ({ prop, originalIndex }))
    .sort((a, b) => {
      const groupA = groupFor(a.prop && a.prop.type);
      const groupB = groupFor(b.prop && b.prop.type);
      if (groupA !== groupB) return groupA - groupB;
      return a.originalIndex - b.originalIndex; // stable within group
    })
    .map(({ prop }) => normalizePropertyFieldOrder(prop));
}

/**
 * Check if two property arrays are in canonical order (types only, not fields).
 * Returns true if already sorted (no reordering needed).
 */
export function isAlreadySorted(properties) {
  if (!Array.isArray(properties)) return true;
  let previousGroup = -1;
  for (const prop of properties) {
    if (!isPlainObject(prop)) continue;
    const g = groupFor(prop.type);
    if (g < previousGroup) return false;
    previousGroup = g;
  }
  return true;
}

/**
 * Check if property field order matches canonical order.
 * Delegates to spec-property-types.mjs (single source of truth).
 */
export function hasCanonicalFieldOrder(properties) {
  return hasCanonicalPropertyFieldOrder(properties);
}

// ---------------------------------------------------------------------------
// YAML serialization
// ---------------------------------------------------------------------------

const YAML_DUMP_OPTS = {
  lineWidth: 120,
  noRefs: true,
  sortKeys: false,
  indent: 2,
  quotingType: '"',
};

/**
 * Serialise a spec object back to YAML string, preserving top-level key order.
 */
function dumpSpec(spec) {
  return yaml.dump(spec, YAML_DUMP_OPTS);
}

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

/**
 * Sort a single spec file. Returns a result descriptor.
 * If check=true, does not write the file.
 */
function processSpecFile(filePath, { check = false } = {}) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    return { file: filePath, status: "error", error: err.message };
  }

  let spec;
  try {
    spec = yaml.load(raw);
  } catch (err) {
    return { file: filePath, status: "error", error: `YAML parse error: ${err.message}` };
  }

  if (!isPlainObject(spec)) {
    return { file: filePath, status: "skip", reason: "not a plain object" };
  }

  if (!Array.isArray(spec.properties)) {
    return { file: filePath, status: "skip", reason: "no properties array" };
  }

  const groupsOk = isAlreadySorted(spec.properties);
  const fieldsOk = hasCanonicalFieldOrder(spec.properties);
  const alreadyOk = groupsOk && fieldsOk;

  if (alreadyOk) {
    return { file: filePath, status: "ok", changed: false };
  }

  if (check) {
    return {
      file: filePath,
      status: "needs-sort",
      changed: true,
      groupsOk,
      fieldsOk,
    };
  }

  spec.properties = sortProperties(spec.properties);
  const newYaml = dumpSpec(spec);

  try {
    fs.writeFileSync(filePath, newYaml, "utf8");
  } catch (err) {
    return { file: filePath, status: "error", error: `Write error: ${err.message}` };
  }

  return { file: filePath, status: "sorted", changed: true };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    string: ["file"],
    boolean: ["all", "check", "json"],
    alias: { f: "file", a: "all", c: "check" },
  });

  const hasFile = !!args.file;
  const hasAll = !!args.all;

  if (!hasFile && !hasAll) {
    console.error("ERROR: --file <path> or --all is required.");
    console.error("Usage:");
    console.error("  npm run ds:sort-spec -- --file <path>");
    console.error("  npm run ds:sort-spec -- --all [--check]");
    process.exit(1);
  }

  // Resolve list of files to process
  let files = [];
  if (hasAll) {
    const specDir = path.join(DOCS_SPEC_DIR, "components");
    if (!fs.existsSync(specDir)) {
      console.error(`ERROR: Spec dir not found: ${specDir}`);
      process.exit(1);
    }
    files = fs
      .readdirSync(specDir)
      .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
      .map((f) => path.join(specDir, f));
  } else {
    const rawFile = Array.isArray(args.file) ? args.file : [args.file];
    files = rawFile.map((f) => path.resolve(f));
  }

  if (files.length === 0) {
    console.error("ERROR: No spec files found.");
    process.exit(1);
  }

  const results = files.map((f) => processSpecFile(f, { check: args.check }));

  const needsSort = results.filter((r) => r.status === "needs-sort");
  const sorted = results.filter((r) => r.status === "sorted");
  const ok = results.filter((r) => r.status === "ok");
  const errors = results.filter((r) => r.status === "error");
  const skipped = results.filter((r) => r.status === "skip");

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          check: args.check,
          total: files.length,
          ok: ok.length,
          sorted: sorted.length,
          needsSort: needsSort.length,
          errors: errors.length,
          skipped: skipped.length,
          results,
        },
        null,
        2,
      ),
    );
  } else {
    const rel = (f) => path.relative(process.cwd(), f);

    if (args.check) {
      if (needsSort.length === 0 && errors.length === 0) {
        console.log(`✓ All ${ok.length} spec file(s) have canonical property order.`);
      } else {
        if (needsSort.length > 0) {
          console.error(`✗ ${needsSort.length} spec file(s) need sorting:`);
          for (const r of needsSort) {
            const issues = [];
            if (!r.groupsOk) issues.push("group order");
            if (!r.fieldsOk) issues.push("field order");
            console.error(`  ${rel(r.file)}  [${issues.join(", ")}]`);
          }
          console.error(`\n  Fix: npm run ds:sort-spec -- --all`);
        }
        if (errors.length > 0) {
          console.error(`\n✗ ${errors.length} error(s):`);
          for (const r of errors) console.error(`  ${rel(r.file)}: ${r.error}`);
        }
      }
    } else {
      if (sorted.length > 0) {
        console.log(`✓ Sorted ${sorted.length} spec file(s):`);
        for (const r of sorted) console.log(`  ${rel(r.file)}`);
      }
      if (ok.length > 0) {
        console.log(`✓ Already sorted: ${ok.length} file(s)`);
      }
      if (errors.length > 0) {
        console.error(`✗ Errors in ${errors.length} file(s):`);
        for (const r of errors) console.error(`  ${rel(r.file)}: ${r.error}`);
      }
      if (skipped.length > 0) {
        console.log(`  Skipped: ${skipped.length} file(s) (${skipped.map((r) => r.reason).join(", ")})`);
      }
    }
  }

  // Exit codes: 0 = clean, 1 = needs-sort or errors
  if (args.check && (needsSort.length > 0 || errors.length > 0)) {
    process.exit(1);
  }
  if (!args.check && errors.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
