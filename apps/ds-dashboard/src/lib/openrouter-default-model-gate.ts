export interface OpenRouterDefaultModelGate {
  markTouched(): void;
  cancelPendingRequest(): void;
  beginRequest(): number | null;
  canApply(requestSeq: number): boolean;
  syncInitialModel(initialModel?: string | null): void;
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(String(value || '').trim());
}

export function createOpenRouterDefaultModelGate(
  initialModel?: string | null,
): OpenRouterDefaultModelGate {
  let modelTouched = hasText(initialModel);
  let requestSeq = 0;

  return {
    markTouched() {
      modelTouched = true;
      requestSeq += 1;
    },
    cancelPendingRequest() {
      requestSeq += 1;
    },
    beginRequest() {
      if (modelTouched) {
        return null;
      }
      requestSeq += 1;
      return requestSeq;
    },
    canApply(candidateRequestSeq: number) {
      return !modelTouched && candidateRequestSeq === requestSeq;
    },
    syncInitialModel(nextInitialModel) {
      modelTouched = hasText(nextInitialModel);
      requestSeq += 1;
    },
  };
}
