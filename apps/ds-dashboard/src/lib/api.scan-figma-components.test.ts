import assert from "node:assert/strict";
import test from "node:test";

import { scanFigmaComponents } from "./api";

const originalFetch = globalThis.fetch;
const originalLocalStorage = globalThis.localStorage;

const localStorageMock: Storage = {
  length: 0,
  clear() {},
  getItem() {
    return null;
  },
  key() {
    return null;
  },
  removeItem() {},
  setItem() {},
};

test.beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorageMock,
  });
});

test.afterEach(() => {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: originalFetch,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: originalLocalStorage,
  });
});

test("scanFigmaComponents normalizes malformed nextOffset values", async () => {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          success: true,
          components: [],
          count: 0,
          total: 10,
          hasMore: true,
          nextOffset: Number.NaN,
          truncated: false,
          totalIsEstimated: false,
          limit: 500,
        }),
      }) as Response,
  });

  const result = await scanFigmaComponents({
    figmaUrl: "https://www.figma.com/design/abc/Test",
  });

  assert.equal(result.nextOffset, null);
});

