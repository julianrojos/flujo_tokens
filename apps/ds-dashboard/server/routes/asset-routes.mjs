import fs from "node:fs/promises";
import path from "node:path";

import { guessContentType } from "../lib/request-file-helpers.mjs";

const ALLOWED_VISUAL_PROOF_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"]);

function isAllowedVisualProofAsset(repoRoot, absPath) {
  const ext = path.extname(absPath).toLowerCase();
  if (!ALLOWED_VISUAL_PROOF_EXTENSIONS.has(ext)) return false;

  const relativePath = path.relative(repoRoot, absPath).split(path.sep).join("/");
  if (relativePath.startsWith("../") || relativePath === "..") return false;
  return (
    relativePath.startsWith("design-systems/") &&
    relativePath.includes("/docs/_generated/visual-proofs/")
  );
}

function getSystemRepoRoot(deps, systemHeader) {
  return deps.getSystemContext(systemHeader).then((context) => {
    if (!context || typeof context !== "object") {
      throw new TypeError("assetDeps.getSystemContext must return an object");
    }
    const repoRoot = String(context.repoRoot || "").trim();
    if (!repoRoot) {
      throw new TypeError("assetDeps.getSystemContext.repoRoot must be a string");
    }
    return repoRoot;
  });
}

export function registerAssetRoutes(app, deps) {
  app.get("/api/asset", async (c) => {
    const requested = c.req.query("path") ?? c.req.query("file") ?? "";
    const requestedSystem = c.req.query("system") ?? "";
    const raw = String(requested || "").trim();
    if (!raw) {
      return deps.failJson(c, 400, {
        code: "asset.invalid_path",
        userMessage: "Invalid asset path.",
        recoverable: true,
        context: { requested: raw },
      });
    }

    let repoRoot = "";
    try {
      repoRoot = await getSystemRepoRoot(
        deps,
        String(requestedSystem || c.req.header("x-ds-system") || ""),
      );
    } catch (error) {
      return deps.failJson(c, 500, {
        code: "asset.repo_context_failed",
        userMessage: "Unable to resolve asset repository context.",
        recoverable: true,
        context: {
          requested: raw,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }

    let absPath = deps.resolveRepoFilePath(repoRoot, raw);
    if (!absPath) {
      return deps.failJson(c, 400, {
        code: "asset.invalid_path",
        userMessage: "Invalid asset path.",
        recoverable: true,
        context: { requested: raw },
      });
    }

    try {
      const stat = await fs.stat(absPath);
      if (!stat.isFile()) {
        return deps.failJson(c, 404, {
          code: "asset.not_found",
          userMessage: "Asset not found.",
          recoverable: true,
          context: { requested: raw },
        });
      }

      if (!isAllowedVisualProofAsset(repoRoot, absPath)) {
        return deps.failJson(c, 403, {
          code: "asset.forbidden",
          userMessage: "Asset not allowed.",
          recoverable: true,
          context: { requested: raw },
        });
      }

      const buffer = await fs.readFile(absPath);
      return c.body(buffer, 200, {
        "Content-Type": guessContentType(absPath),
        "Cache-Control": "no-store",
      });
    } catch (error) {
      return deps.failJson(c, 404, {
        code: "asset.not_found",
        userMessage: "Asset not found.",
        recoverable: true,
        context: {
          requested: raw,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}
