import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CandidateClient } from './candidate-client';
import { DESKTOP_BRIDGE_CODE_PATH, OracleClient } from './oracle-client';
import { COMPAT_CASES, DEFERRED_ORACLE_METHODS } from './cases/compat-cases';

const CONNECT_TIMEOUT_MS = 3_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

describe('Protocol Compatibility (Oracle vs Candidate)', () => {
  let oracle: OracleClient;
  let candidate: CandidateClient;

  beforeEach(async () => {
    oracle = new OracleClient();
    candidate = new CandidateClient();

    await withTimeout(oracle.connect(), CONNECT_TIMEOUT_MS, 'oracle.connect');
    await withTimeout(candidate.connect(), CONNECT_TIMEOUT_MS, 'candidate.connect');
  });

  afterEach(async () => {
    await candidate.disconnect();
    await oracle.disconnect();
  });

  for (const testCase of COMPAT_CASES) {
    it(`${testCase.id}: ${testCase.description}`, async () => {
      const [oracleResponse, candidateResponse] = await Promise.all([
        oracle.sendCommand(testCase.method, testCase.params),
        candidate.sendCommand(testCase.method, testCase.params),
      ]);

      // Assert case-specific parity
      testCase.assert(oracleResponse, candidateResponse);
    });
  }

  it('matrix sanity: all oracle methods are covered or deferred explicitly', () => {
    const source = fs.readFileSync(DESKTOP_BRIDGE_CODE_PATH, 'utf8');
    const oracleMethods = new Set(
      Array.from(source.matchAll(/msg\.type === '([A-Z_]+)'/g), (match) => match[1]),
    );
    const coveredMethods = new Set(COMPAT_CASES.map((testCase) => testCase.method));
    const deferredMethods = new Set(DEFERRED_ORACLE_METHODS);

    const missing = Array.from(oracleMethods).filter(
      (method) => !coveredMethods.has(method) && !deferredMethods.has(method),
    );
    const invalidDeferred = Array.from(deferredMethods).filter(
      (method) => !oracleMethods.has(method),
    );

    expect(missing, `Missing oracle parity cases: ${missing.join(', ')}`).toEqual([]);
    expect(
      invalidDeferred,
      `Deferred methods must exist in oracle source: ${invalidDeferred.join(', ')}`,
    ).toEqual([]);
    expect(COMPAT_CASES.length).toBeGreaterThanOrEqual(oracleMethods.size);
  });
});
