import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readStoredSuggestion } from '../hooks/use-ai-suggestion';

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

describe('useAiSuggestion storage validation', () => {
  const storage = new MemoryStorage();
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });
    storage.clear();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
  });

  it('returns suggestion when slug, scope, version and figma component id match', () => {
    const key = 'ai-suggestion-v2-sys-button';
    storage.setItem(key, JSON.stringify({
      version: 2,
      storageScope: 'sys',
      slug: 'button',
      figmaComponentId: '123:456',
      generatedAt: '2026-04-10T10:00:00.000Z',
      suggestion: {
        schemaVersion: 1,
        componentId: '123:456',
        title: 'Button',
        summary: 'Primary action button',
        variants: [],
        accessibilityNotes: [],
        markdown: '# Button',
        states: [],
        accessibilityFacts: [],
      },
    }));

    const suggestion = readStoredSuggestion(key, 'button', 'sys', '123:456');
    assert.ok(suggestion);
    assert.equal(suggestion?.title, 'Button');
  });

  it('invalidates suggestion when figma component id does not match', () => {
    const key = 'ai-suggestion-v2-sys-button';
    storage.setItem(key, JSON.stringify({
      version: 2,
      storageScope: 'sys',
      slug: 'button',
      figmaComponentId: '123:456',
      generatedAt: '2026-04-10T10:00:00.000Z',
      suggestion: {
        schemaVersion: 1,
        componentId: '123:456',
        title: 'Button',
        summary: 'Primary action button',
        variants: [],
        accessibilityNotes: [],
        markdown: '# Button',
        states: [],
        accessibilityFacts: [],
      },
    }));

    const suggestion = readStoredSuggestion(key, 'button', 'sys', '999:999');
    assert.equal(suggestion, null);
    assert.equal(storage.getItem(key), null);
  });

  it('does not invalidate stored suggestion before figma component id is resolved', () => {
    const key = 'ai-suggestion-v2-sys-button';
    storage.setItem(key, JSON.stringify({
      version: 2,
      storageScope: 'sys',
      slug: 'button',
      figmaComponentId: '123:456',
      generatedAt: '2026-04-10T10:00:00.000Z',
      suggestion: {
        schemaVersion: 1,
        componentId: '123:456',
        title: 'Button',
        summary: 'Primary action button',
        variants: [],
        accessibilityNotes: [],
        markdown: '# Button',
        states: [],
        accessibilityFacts: [],
      },
    }));

    const suggestion = readStoredSuggestion(key, 'button', 'sys', null);
    assert.equal(suggestion, null);
    assert.notEqual(storage.getItem(key), null);
  });

  it('does not load stored suggestion when figma component id is empty', () => {
    const key = 'ai-suggestion-v2-sys-button';
    storage.setItem(key, JSON.stringify({
      version: 2,
      storageScope: 'sys',
      slug: 'button',
      figmaComponentId: '123:456',
      generatedAt: '2026-04-10T10:00:00.000Z',
      suggestion: {
        schemaVersion: 1,
        componentId: '123:456',
        title: 'Button',
        summary: 'Primary action button',
        variants: [],
        accessibilityNotes: [],
        markdown: '# Button',
        states: [],
        accessibilityFacts: [],
      },
    }));

    const suggestion = readStoredSuggestion(key, 'button', 'sys', '');
    assert.equal(suggestion, null);
    assert.notEqual(storage.getItem(key), null);
  });
});
