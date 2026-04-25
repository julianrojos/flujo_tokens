import fs from "node:fs";
import path from "node:path";

const DIST_ASSETS_DIR = path.resolve(process.cwd(), "dist/assets");
const BLOCKED_MODULES = [
  "@anthropic-ai/sdk",
  "openai",
];
const BLOCKED_ENDPOINTS = [
  "api.openai.com",
  "api.anthropic.com",
  "anthropic.com",
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const BLOCKED_MODULE_PATTERNS = BLOCKED_MODULES.map((moduleName) => {
  const escaped = escapeRegExp(moduleName);
  return {
    moduleName,
    importFrom: new RegExp(`\\bfrom\\s*["']${escaped}["']`),
    dynamicImport: new RegExp(`\\bimport\\s*\\(\\s*["']${escaped}["']\\s*\\)`),
    commonJsRequire: new RegExp(`\\brequire\\s*\\(\\s*["']${escaped}["']\\s*\\)`),
    modulePath: new RegExp(`node_modules[\\\\/]${escaped.replace("/", "[\\\\/]")}`),
  };
});

if (!fs.existsSync(DIST_ASSETS_DIR)) {
  console.error("❌ dist/assets not found. Run `npm run build` first.");
  process.exit(1);
}

const files = fs
  .readdirSync(DIST_ASSETS_DIR)
  .filter((file) => file.endsWith(".js"))
  .map((file) => path.join(DIST_ASSETS_DIR, file));

if (files.length === 0) {
  console.error("❌ No client JS chunks found in dist/assets. Build output looks unexpected.");
  process.exit(1);
}

const violations = [];

function addViolation(filePath, kind, detail) {
  violations.push({
    filePath: path.basename(filePath),
    kind,
    detail,
  });
}

for (const filePath of files) {
  const content = fs.readFileSync(filePath, "utf8");

  for (const pattern of BLOCKED_MODULE_PATTERNS) {
    if (pattern.importFrom.test(content)) {
      addViolation(filePath, "import", `static import from "${pattern.moduleName}"`);
    }
    if (pattern.dynamicImport.test(content)) {
      addViolation(filePath, "import()", `dynamic import("${pattern.moduleName}")`);
    }
    if (pattern.commonJsRequire.test(content)) {
      addViolation(filePath, "require()", `require("${pattern.moduleName}")`);
    }
    if (pattern.modulePath.test(content)) {
      addViolation(filePath, "module-path", `path reference to ${pattern.moduleName} in node_modules`);
    }
  }

  for (const endpoint of BLOCKED_ENDPOINTS) {
    if (content.includes(endpoint)) {
      addViolation(filePath, "endpoint", `string "${endpoint}"`);
    }
  }

  const mapPath = `${filePath}.map`;
  if (fs.existsSync(mapPath)) {
    try {
      const mapJson = JSON.parse(fs.readFileSync(mapPath, "utf8"));
      const sources = Array.isArray(mapJson.sources) ? mapJson.sources : [];
      for (const source of sources) {
        const sourceText = String(source);
        if (sourceText.includes("node_modules/openai")) {
          addViolation(filePath, "sourcemap", "source map references node_modules/openai");
        }
        if (sourceText.includes("node_modules/@anthropic-ai/sdk")) {
          addViolation(filePath, "sourcemap", "source map references node_modules/@anthropic-ai/sdk");
        }
      }
    } catch (error) {
      console.error(`❌ Failed to parse source map: ${path.basename(mapPath)}`);
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
}

if (violations.length > 0) {
  console.error("❌ Bundle isolation check failed. Forbidden traces found in client chunks:");
  for (const { filePath, kind, detail } of violations) {
    console.error(`- [${kind}] ${filePath}: ${detail}`);
  }
  process.exit(1);
}

console.log("✅ Bundle isolation verified: no forbidden SDK imports, endpoints, or sourcemap traces.");
