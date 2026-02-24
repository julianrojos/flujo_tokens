import { createHash } from "node:crypto";

export function createDevRuntimeChecker(env = process.env) {
  return function isDevRuntime() {
    return env.NODE_ENV === "development";
  };
}

export function createSha256TextHasher() {
  return function sha256Text(value) {
    return createHash("sha256").update(value, "utf8").digest("hex");
  };
}

export function createSystemContextResolver(designSystemRepository) {
  return function getSystemContext(systemHeader) {
    return designSystemRepository.resolveDashboardSystemContext(systemHeader);
  };
}
