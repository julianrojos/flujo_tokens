/**
 * Contract test for stripDiacritics implementations
 * Ensures consistency across different runtime environments
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Import TypeScript implementation
import { stripDiacritics as tsStripDiacritics } from './strip-diacritics.js';

// Define test cases that should work identically across all implementations
const testCases = [
  // Basic Latin diacritics
  { input: 'á', expected: 'a' },
  { input: 'é', expected: 'e' },
  { input: 'í', expected: 'i' },
  { input: 'ó', expected: 'o' },
  { input: 'ú', expected: 'u' },
  
  // Grave accents
  { input: 'à', expected: 'a' },
  { input: 'è', expected: 'e' },
  { input: 'ì', expected: 'i' },
  { input: 'ò', expected: 'o' },
  { input: 'ù', expected: 'u' },
  
  // Circumflex
  { input: 'â', expected: 'a' },
  { input: 'ê', expected: 'e' },
  { input: 'î', expected: 'i' },
  { input: 'ô', expected: 'o' },
  { input: 'û', expected: 'u' },
  
  // Tilde
  { input: 'ã', expected: 'a' },
  { input: 'õ', expected: 'o' },
  { input: 'ñ', expected: 'n' },
  
  // Umlaut/diaeresis
  { input: 'ä', expected: 'a' },
  { input: 'ë', expected: 'e' },
  { input: 'ï', expected: 'i' },
  { input: 'ö', expected: 'o' },
  { input: 'ü', expected: 'u' },
  
  // Uppercase diacritics
  { input: 'Á', expected: 'A' },
  { input: 'É', expected: 'E' },
  { input: 'Í', expected: 'I' },
  { input: 'Ó', expected: 'O' },
  { input: 'Ú', expected: 'U' },
  { input: 'Ü', expected: 'U' },
  { input: 'Ñ', expected: 'N' },
  
  // Real-world component names
  { input: 'Botón', expected: 'Boton' },
  { input: 'Botón Primário', expected: 'Boton Primario' },
  { input: 'niño', expected: 'nino' },
  { input: 'Español', expected: 'Espanol' },
  { input: 'pingüino', expected: 'pinguino' },
  { input: 'Acción', expected: 'Accion' },
  { input: 'Tipografía', expected: 'Tipografia' },
  { input: 'tamaño', expected: 'tamano' },
  
  // Edge cases
  { input: '', expected: '' },
  { input: 'hello world', expected: 'hello world' },
  { input: 'Button123', expected: 'Button123' },
  { input: 'test-123', expected: 'test-123' },
  { input: 'component_01', expected: 'component_01' },
];

describe('stripDiacritics contract tests', () => {
  describe('TypeScript implementation', () => {
    testCases.forEach(({ input, expected }, index) => {
      it(`case ${index + 1}: "${input}" → "${expected}"`, () => {
        const result = tsStripDiacritics(input);
        assert.equal(result, expected, `TypeScript stripDiacritics failed for "${input}"`);
      });
    });
  });

  describe('Integration with component-name', () => {
    it('should work correctly with component-name functions', async () => {
      const { componentNameToSnakeCase } = await import('./component-name.js');
      
      // Test cases that would be affected by stripDiacritics
      const diacriticTestCases = [
        { input: 'Botón', expected: 'boton' },
        { input: 'niño', expected: 'nino' },
        { input: 'Español', expected: 'espanol' },
        { input: 'Acción', expected: 'accion' },
        { input: 'Tipografía', expected: 'tipografia' },
      ];
      
      diacriticTestCases.forEach(({ input, expected }, index) => {
        const result = componentNameToSnakeCase(input);
        assert.equal(result, expected, `component-name integration failed for case ${index + 1}: "${input}"`);
      });
    });
  });

  describe('Performance and edge cases', () => {
    it('should handle empty and null inputs consistently', () => {
      assert.equal(tsStripDiacritics(''), '');
      assert.equal(tsStripDiacritics(null as unknown as string), '');
      assert.equal(tsStripDiacritics(undefined as unknown as string), '');
    });

    it('should handle non-string inputs gracefully', () => {
      assert.equal(tsStripDiacritics(123 as unknown as string), '');
      assert.equal(tsStripDiacritics({} as unknown as string), '');
      assert.equal(tsStripDiacritics([] as unknown as string), '');
    });

    it('should handle strings with only diacritics', () => {
      assert.equal(tsStripDiacritics('áéí'), 'aei');
      assert.equal(tsStripDiacritics('ÁÉÍÓÚ'), 'AEIOU');
    });

    it('should preserve non-Latin characters', () => {
      // Chinese characters should be preserved (they're not diacritics)
      assert.equal(tsStripDiacritics('测试'), '测试');
      
      // Emoji should be preserved
      assert.equal(tsStripDiacritics('🎨'), '🎨');
      
      // Numbers and symbols should be preserved
      assert.equal(tsStripDiacritics('test-123!@#'), 'test-123!@#');
    });
  });
});
