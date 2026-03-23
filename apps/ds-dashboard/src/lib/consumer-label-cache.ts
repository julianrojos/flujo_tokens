const PREFIX = "consumer-label:";
const LABEL_UPDATED_EVENT = "consumer-label-updated";

function keyFor(id: string): string {
  return `${PREFIX}${id}`;
}

export function readCachedConsumerLabel(consumerId: string): string {
  if (!consumerId || typeof window === "undefined") return "";
  try {
    return String(window.sessionStorage.getItem(keyFor(consumerId)) || "").trim();
  } catch {
    return "";
  }
}

export function writeCachedConsumerLabel(consumerId: string, consumerName: string): void {
  if (!consumerId || !consumerName || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(keyFor(consumerId), consumerName);
    window.dispatchEvent(
      new CustomEvent(LABEL_UPDATED_EVENT, {
        detail: { consumerId, consumerName },
      }),
    );
  } catch {
    // no-op
  }
}

export function onCachedConsumerLabelUpdate(
  handler: (payload: { consumerId: string; consumerName: string }) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ consumerId?: string; consumerName?: string }>).detail;
    const consumerId = String(detail?.consumerId || "").trim();
    const consumerName = String(detail?.consumerName || "").trim();
    if (!consumerId || !consumerName) return;
    handler({ consumerId, consumerName });
  };
  window.addEventListener(LABEL_UPDATED_EVENT, listener);
  return () => window.removeEventListener(LABEL_UPDATED_EVENT, listener);
}
