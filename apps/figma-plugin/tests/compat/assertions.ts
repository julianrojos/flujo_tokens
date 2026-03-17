import { expect } from 'vitest';
import type { CompatResponse } from './candidate-client';

export function expectBothSuccess(oracle: CompatResponse, candidate: CompatResponse): void {
  expect(oracle.ok, `oracle expected success but got ${oracle.errorMessage}`).toBe(true);
  expect(candidate.ok, `candidate expected success but got ${candidate.errorCode}:${candidate.errorMessage}`).toBe(true);
}

export function expectBothFailure(oracle: CompatResponse, candidate: CompatResponse): void {
  expect(oracle.ok).toBe(false);
  expect(candidate.ok).toBe(false);
}

export function expectSameStringField(
  oracleObject: Record<string, unknown>,
  candidateObject: Record<string, unknown>,
  field: string,
): void {
  expect(typeof oracleObject[field]).toBe('string');
  expect(candidateObject[field]).toBe(oracleObject[field]);
}

export function expectSameNumberField(
  oracleObject: Record<string, unknown>,
  candidateObject: Record<string, unknown>,
  field: string,
): void {
  expect(typeof oracleObject[field]).toBe('number');
  expect(candidateObject[field]).toBe(oracleObject[field]);
}

export function expectErrorIncludes(
  response: CompatResponse,
  expectedSnippet: string,
  label: 'oracle' | 'candidate',
): void {
  const message = response.errorMessage ?? '';
  expect(message, `${label} error should include: ${expectedSnippet}`).toContain(expectedSnippet);
}

export function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return {};
}
