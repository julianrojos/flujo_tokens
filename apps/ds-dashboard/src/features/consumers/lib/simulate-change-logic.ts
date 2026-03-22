import type { SimulateChangePayload, SimulationResponse } from "@/lib/api";
import type { SimulationResult } from "@/types/consumers";

export type SimulateChangeApiFn = (payload: SimulateChangePayload) => Promise<SimulationResponse>;

export type SimulateChangeResult =
  | { ok: true; data: SimulationResult }
  | { ok: false; error: unknown };

export async function runSimulateChange(
  apiCall: SimulateChangeApiFn,
  payload: SimulateChangePayload,
): Promise<SimulateChangeResult> {
  try {
    const response = await apiCall(payload);
    return { ok: true, data: response.data };
  } catch (error) {
    return { ok: false, error };
  }
}

