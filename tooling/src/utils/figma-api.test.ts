import { describe, it } from "node:test";
import assert from "node:assert";
import {
  buildFigmaFileEndpoint,
  FigmaApiError,
  normalizeFileKey,
  sanitizeToken,
  normalizePositiveInteger,
  toFigmaErrorDetail,
} from "./figma-api.js";

describe("figma-api utils", () => {
  describe("normalizePositiveInteger", () => {
    it("returns fallback for undefined/null/empty", () => {
      assert.equal(normalizePositiveInteger(undefined, 10), 10);
      assert.equal(normalizePositiveInteger(null, 10), 10);
      assert.equal(normalizePositiveInteger("", 10), 10);
    });

    it("converts valid numbers", () => {
      assert.equal(normalizePositiveInteger(5, 10), 5);
      assert.equal(normalizePositiveInteger("5", 10), 5);
      assert.equal(normalizePositiveInteger(5.7, 10), 5);
    });

    it("throws for invalid values", () => {
      assert.throws(
        () => normalizePositiveInteger("abc", 10),
        /Invalid numeric value/
      );
      assert.throws(
        () => normalizePositiveInteger(-5, 10),
        /Expected a positive integer/
      );
      assert.throws(
        () => normalizePositiveInteger(0, 10),
        /Expected a positive integer/
      );
    });
  });

  describe("sanitizeToken", () => {
    it("returns trimmed token", () => {
      assert.equal(sanitizeToken("  mytoken  "), "mytoken");
    });

    it("throws for empty token", () => {
      assert.throws(
        () => sanitizeToken(""),
        /Missing Figma API token/
      );
      assert.throws(
        // Intentional type coercion to test runtime validation
        () => sanitizeToken(null as any),
        /Missing Figma API token/
      );
      assert.throws(
        // Intentional type coercion to test runtime validation
        () => sanitizeToken(undefined as any),
        /Missing Figma API token/
      );
    });
  });

  describe("normalizeFileKey", () => {
    it("returns trimmed file key", () => {
      assert.equal(normalizeFileKey("  abc123  "), "abc123");
    });

    it("throws for empty file key", () => {
      assert.throws(
        () => normalizeFileKey(""),
        /Missing Figma file key/
      );
      assert.throws(
        // Intentional type coercion to test runtime validation
        () => normalizeFileKey(null as any),
        /Missing Figma file key/
      );
    });
  });

  describe("buildFigmaFileEndpoint", () => {
    it("builds basic endpoint", () => {
      const result = buildFigmaFileEndpoint({ fileKey: "abc123" });
      assert.ok(result.includes("/v1/files/abc123"));
      assert.ok(result.startsWith("https://api.figma.com"));
    });

    it("adds depth parameter", () => {
      const result = buildFigmaFileEndpoint({ fileKey: "abc123", depth: 2 });
      assert.ok(result.includes("depth=2"));
    });

    it("adds branch_data parameter", () => {
      const result = buildFigmaFileEndpoint({ fileKey: "abc123", branchData: true });
      assert.ok(result.includes("branch_data=true"));
    });

    it("adds geometry parameter", () => {
      const result = buildFigmaFileEndpoint({ fileKey: "abc123", geometry: "paths" });
      assert.ok(result.includes("geometry=paths"));
    });

    it("combines multiple parameters", () => {
      const result = buildFigmaFileEndpoint({
        fileKey: "abc123",
        depth: 3,
        branchData: true,
        geometry: "paths",
      });
      assert.ok(result.includes("depth=3"));
      assert.ok(result.includes("branch_data=true"));
      assert.ok(result.includes("geometry=paths"));
    });

    it("throws for missing file key", () => {
      assert.throws(
        () => buildFigmaFileEndpoint({ fileKey: "" }),
        /Missing Figma file key/
      );
    });
  });

  describe("toFigmaErrorDetail", () => {
    it("returns null for non-FigmaApiError values", () => {
      assert.equal(toFigmaErrorDetail(new Error("boom")), null);
      assert.equal(toFigmaErrorDetail("boom"), null);
    });

    it("serializes FigmaApiError fields", () => {
      const error = new FigmaApiError({
        type: "figma_api_error",
        message: "Figma API error 404",
        endpoint: "https://api.figma.com/v1/files/abc123",
        fileKey: "abc123",
        status: 404,
        code: "Not found",
      });

      const detail = toFigmaErrorDetail(error);
      assert.ok(detail);
      assert.equal(detail?.type, "figma_api_error");
      assert.equal(detail?.status, 404);
      assert.equal(detail?.fileKey, "abc123");
      assert.equal(detail?.endpoint, "https://api.figma.com/v1/files/abc123");
      assert.equal(detail?.message, "Figma API error 404");
      assert.equal(detail?.code, "Not found");
    });
  });
});
