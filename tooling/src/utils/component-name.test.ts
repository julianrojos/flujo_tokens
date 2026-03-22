import { describe, it } from "node:test";
import assert from "node:assert";
import {
  componentNameToSnakeCase,
  componentNameToDisplayName,
  normalizeComponentName,
  componentNameFromFilePath,
  isSnakeCaseFileSlug,
} from "./component-name.js";

describe("component-name utils", () => {
  describe("componentNameToSnakeCase", () => {
    it("converts simple names", () => {
      assert.equal(componentNameToSnakeCase("Button"), "button");
      assert.equal(componentNameToSnakeCase("button"), "button");
      assert.equal(componentNameToSnakeCase("BUTTON"), "button");
    });

    it("converts camelCase", () => {
      assert.equal(componentNameToSnakeCase("alertBanner"), "alert_banner");
      assert.equal(componentNameToSnakeCase("userProfile"), "user_profile");
    });

    it("converts PascalCase", () => {
      assert.equal(componentNameToSnakeCase("AlertBanner"), "alert_banner");
      assert.equal(componentNameToSnakeCase("UserProfile"), "user_profile");
    });

    it("converts snake_case", () => {
      assert.equal(componentNameToSnakeCase("alert_banner"), "alert_banner");
    });

    it("converts kebab-case", () => {
      assert.equal(componentNameToSnakeCase("alert-banner"), "alert_banner");
    });

    it("handles numbers", () => {
      assert.equal(componentNameToSnakeCase("Button2"), "button2");
      assert.equal(componentNameToSnakeCase(123), "123");
    });

    it("removes file extensions", () => {
      assert.equal(componentNameToSnakeCase("button.tsx"), "button");
      assert.equal(componentNameToSnakeCase("alert-banner.mjs"), "alert_banner");
    });

    it("returns empty string for invalid input", () => {
      assert.equal(componentNameToSnakeCase(""), "");
      assert.equal(componentNameToSnakeCase(null), "");
      assert.equal(componentNameToSnakeCase(undefined), "");
      assert.equal(componentNameToSnakeCase({}), "");
    });

    it("normalizes diacritics to ASCII", () => {
      assert.equal(componentNameToSnakeCase("Botón"), "boton");
      assert.equal(componentNameToSnakeCase("Botón Primário"), "boton_primario");
      assert.equal(componentNameToSnakeCase("niño"), "nino");
      assert.equal(componentNameToSnakeCase("Español"), "espanol");
      assert.equal(componentNameToSnakeCase("pingüino"), "pinguino");
      assert.equal(componentNameToSnakeCase("Acción"), "accion");
    });
  });

  describe("componentNameToDisplayName", () => {
    it("converts simple names", () => {
      assert.equal(componentNameToDisplayName("button"), "Button");
      assert.equal(componentNameToDisplayName("BUTTON"), "BUTTON");
    });

    it("converts snake_case", () => {
      assert.equal(componentNameToDisplayName("alert_banner"), "AlertBanner");
      assert.equal(componentNameToDisplayName("user_profile"), "UserProfile");
    });

    it("converts kebab-case", () => {
      assert.equal(componentNameToDisplayName("alert-banner"), "AlertBanner");
    });

    it("converts camelCase", () => {
      assert.equal(componentNameToDisplayName("alertBanner"), "AlertBanner");
    });

    it("preserves acronyms", () => {
      assert.equal(componentNameToDisplayName("XMLParser"), "XMLParser");
      assert.equal(componentNameToDisplayName("SVGIcon"), "SVGIcon");
      assert.equal(componentNameToDisplayName("APIButton"), "APIButton");
    });

    it("preserves numbers", () => {
      assert.equal(componentNameToDisplayName("Header2"), "Header2");
      assert.equal(componentNameToDisplayName("API2"), "API2");
    });

    it("returns empty string for invalid input", () => {
      assert.equal(componentNameToDisplayName(""), "");
      assert.equal(componentNameToDisplayName(null), "");
    });

    it("normalizes diacritics to ASCII", () => {
      assert.equal(componentNameToDisplayName("botón"), "Boton");
      assert.equal(componentNameToDisplayName("Botón Primário"), "BotonPrimario");
      assert.equal(componentNameToDisplayName("niño"), "Nino");
      assert.equal(componentNameToDisplayName("Español"), "Espanol");
      assert.equal(componentNameToDisplayName("pingüino"), "Pinguino");
    });
  });

  describe("normalizeComponentName", () => {
    it("returns both displayName and fileSlug", () => {
      const result = normalizeComponentName("AlertBanner");
      assert.equal(result.displayName, "AlertBanner");
      assert.equal(result.fileSlug, "alert_banner");
    });

    it("handles snake_case input", () => {
      const result = normalizeComponentName("alert_banner");
      assert.equal(result.displayName, "AlertBanner");
      assert.equal(result.fileSlug, "alert_banner");
    });

    it("handles kebab-case input", () => {
      const result = normalizeComponentName("alert-banner");
      assert.equal(result.displayName, "AlertBanner");
      assert.equal(result.fileSlug, "alert_banner");
    });
  });

  describe("componentNameFromFilePath", () => {
    it("extracts name from path", () => {
      const result = componentNameFromFilePath("/path/to/Button.tsx");
      assert.equal(result.displayName, "Button");
      assert.equal(result.fileSlug, "button");
    });

    it("handles nested paths", () => {
      const result = componentNameFromFilePath("/components/ui/alert-banner.mjs");
      assert.equal(result.displayName, "AlertBanner");
      assert.equal(result.fileSlug, "alert_banner");
    });

    it("handles file with number", () => {
      const result = componentNameFromFilePath("/components/Header2.tsx");
      assert.equal(result.displayName, "Header2");
      assert.equal(result.fileSlug, "header2");
    });
  });

  describe("isSnakeCaseFileSlug", () => {
    it("returns true for valid snake_case", () => {
      assert.equal(isSnakeCaseFileSlug("button"), true);
      assert.equal(isSnakeCaseFileSlug("alert_banner"), true);
      assert.equal(isSnakeCaseFileSlug("user_profile_2"), true);
    });

    it("returns false for PascalCase", () => {
      assert.equal(isSnakeCaseFileSlug("Button"), false);
      assert.equal(isSnakeCaseFileSlug("AlertBanner"), false);
    });

    it("returns false for kebab-case", () => {
      assert.equal(isSnakeCaseFileSlug("alert-banner"), false);
    });

    it("returns false for mixed case", () => {
      assert.equal(isSnakeCaseFileSlug("Alert_banner"), false);
    });

    it("handles non-string input", () => {
      assert.equal(isSnakeCaseFileSlug(null), false);
      assert.equal(isSnakeCaseFileSlug(undefined), false);
      // Note: numbers convert to strings, so 123 becomes "123" which is valid snake_case
      assert.equal(isSnakeCaseFileSlug(123), true);
      assert.equal(isSnakeCaseFileSlug({}), false);
    });
  });
});
