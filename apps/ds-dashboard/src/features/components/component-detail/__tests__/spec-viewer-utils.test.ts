import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deduplicateRelated,
  normalizeVariantName,
  slugToComponentRouteSlug,
  slugToDisplayName,
} from "../lib/spec-viewer-utils";

describe("spec-viewer-utils", () => {
  describe("slugToDisplayName", () => {
    it("convierte snake_case multi-word a Title Case", () => {
      assert.equal(slugToDisplayName("related_button"), "Related Button");
    });

    it("convierte word único a Title Case", () => {
      assert.equal(slugToDisplayName("icon"), "Icon");
    });

    it("humaniza kebab-case a Title Case", () => {
      assert.equal(slugToDisplayName("icon-button"), "Icon Button");
    });

    it("string vacío retorna string vacío", () => {
      assert.equal(slugToDisplayName(""), "");
    });
  });

  describe("normalizeVariantName", () => {
    it("normaliza espacios y mayúsculas", () => {
      assert.equal(normalizeVariantName("  Size=Large  "), "size=large");
    });

    it("normaliza solo mayúsculas", () => {
      assert.equal(normalizeVariantName("State=Hover"), "state=hover");
    });

    it("maneja string vacío", () => {
      assert.equal(normalizeVariantName(""), "");
    });

    it("maneja solo espacios", () => {
      assert.equal(normalizeVariantName("   "), "");
    });
  });

  describe("deduplicateRelated", () => {
    it("deduplica y excluye self", () => {
      const result = deduplicateRelated(["button", "button", "icon"], "button");
      assert.deepEqual(result, ["icon"]);
    });

    it("hace trim antes de comparar", () => {
      const result = deduplicateRelated(["  button  ", "icon"], "button");
      assert.deepEqual(result, ["icon"]);
    });

    it("compara selfSlug sin distinguir mayúsculas", () => {
      const result = deduplicateRelated(["Button", "icon"], "button");
      assert.deepEqual(result, ["icon"]);
    });

    it("deduplica slugs con casing mixto", () => {
      const result = deduplicateRelated(["Button", "button", "BUTTON", "icon"], "");
      assert.deepEqual(result, ["Button", "icon"]);
    });

    it("array vacío retorna array vacío", () => {
      const result = deduplicateRelated([], "x");
      assert.deepEqual(result, []);
    });

    it("solo self retorna array vacío", () => {
      const result = deduplicateRelated(["self"], "self");
      assert.deepEqual(result, []);
    });

    it("selfSlug vacío no excluye nada", () => {
      const result = deduplicateRelated(["a", "b"], "");
      assert.deepEqual(result, ["a", "b"]);
    });
  });

  describe("slugToComponentRouteSlug", () => {
    it("convierte snake_case a kebab-case", () => {
      assert.equal(slugToComponentRouteSlug("icon_button"), "icon-button");
    });

    it("normaliza acentos y separadores mixtos", () => {
      assert.equal(slugToComponentRouteSlug(" Botón_Primário "), "boton-primario");
    });
  });
});
