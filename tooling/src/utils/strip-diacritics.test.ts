import { describe, it } from 'node:test';
import assert from 'node:assert';
import { stripDiacritics } from './strip-diacritics.js';

describe('stripDiacritics', () => {
    describe('basic Latin diacritics', () => {
        it('removes acute accents (áéíóú)', () => {
            assert.equal(stripDiacritics('á'), 'a');
            assert.equal(stripDiacritics('é'), 'e');
            assert.equal(stripDiacritics('í'), 'i');
            assert.equal(stripDiacritics('ó'), 'o');
            assert.equal(stripDiacritics('ú'), 'u');
        });

        it('removes grave accents (àèìòù)', () => {
            assert.equal(stripDiacritics('à'), 'a');
            assert.equal(stripDiacritics('è'), 'e');
            assert.equal(stripDiacritics('ì'), 'i');
            assert.equal(stripDiacritics('ò'), 'o');
            assert.equal(stripDiacritics('ù'), 'u');
        });

        it('removes circumflex (âêîôû)', () => {
            assert.equal(stripDiacritics('â'), 'a');
            assert.equal(stripDiacritics('ê'), 'e');
            assert.equal(stripDiacritics('î'), 'i');
            assert.equal(stripDiacritics('ô'), 'o');
            assert.equal(stripDiacritics('û'), 'u');
        });

        it('removes tilde (ãõñ)', () => {
            assert.equal(stripDiacritics('ã'), 'a');
            assert.equal(stripDiacritics('õ'), 'o');
            assert.equal(stripDiacritics('ñ'), 'n');
        });

        it('removes umlaut/diaeresis (äëïöü)', () => {
            assert.equal(stripDiacritics('ä'), 'a');
            assert.equal(stripDiacritics('ë'), 'e');
            assert.equal(stripDiacritics('ï'), 'i');
            assert.equal(stripDiacritics('ö'), 'o');
            assert.equal(stripDiacritics('ü'), 'u');
        });
    });

    describe('Spanish characters', () => {
        it('normalizes Spanish ñ', () => {
            assert.equal(stripDiacritics('niño'), 'nino');
            assert.equal(stripDiacritics('Español'), 'Espanol');
            assert.equal(stripDiacritics('niña'), 'nina');
        });

        it('normalizes Spanish ü', () => {
            assert.equal(stripDiacritics('pingüino'), 'pinguino');
            assert.equal(stripDiacritics('cvehículo'), 'cvehiculo');
        });
    });

    describe('uppercase diacritics', () => {
        it('removes uppercase diacritics', () => {
            assert.equal(stripDiacritics('Á'), 'A');
            assert.equal(stripDiacritics('É'), 'E');
            assert.equal(stripDiacritics('Í'), 'I');
            assert.equal(stripDiacritics('Ó'), 'O');
            assert.equal(stripDiacritics('Ú'), 'U');
            assert.equal(stripDiacritics('Ü'), 'U');
            assert.equal(stripDiacritics('Ñ'), 'N');
        });
    });

    describe('mixed case and text', () => {
        it('normalizes mixed case words', () => {
            assert.equal(stripDiacritics('Botón'), 'Boton');
            assert.equal(stripDiacritics('Botón Primário'), 'Boton Primario');
            assert.equal(stripDiacritics('ÁNADE'), 'ANADE');
        });

        it('preserves regular ASCII letters', () => {
            assert.equal(stripDiacritics('hello world'), 'hello world');
            assert.equal(stripDiacritics('Button123'), 'Button123');
        });

        it('preserves numbers and special chars', () => {
            assert.equal(stripDiacritics('test-123'), 'test-123');
            assert.equal(stripDiacritics('component_01'), 'component_01');
        });
    });

    describe('edge cases', () => {
        it('returns empty string for empty input', () => {
            assert.equal(stripDiacritics(''), '');
        });

        it('returns empty string for non-string input', () => {
            assert.equal(stripDiacritics(null as unknown as string), '');
            assert.equal(stripDiacritics(undefined as unknown as string), '');
        });

        it('handles strings with only diacritics', () => {
            assert.equal(stripDiacritics('áéí'), 'aei');
        });

        it('handles strings with no diacritics', () => {
            assert.equal(stripDiacritics('hello'), 'hello');
        });
    });

    describe('real-world component names', () => {
        it('normalizes Figma component names with accents', () => {
            assert.equal(stripDiacritics('Botón'), 'Boton');
            assert.equal(stripDiacritics('Botón Primário'), 'Boton Primario');
            assert.equal(stripDiacritics('Alerta'), 'Alerta');
            assert.equal(stripDiacritics('Tarjeta'), 'Tarjeta');
            assert.equal(stripDiacritics('Íconos'), 'Iconos');
            assert.equal(stripDiacritics('Acción'), 'Accion');
        });
    });
});
