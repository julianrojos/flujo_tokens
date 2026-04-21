import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusAlert } from "@/components/ui/status-alert";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
} from "@/components/ui/overlay";
import { ApiErrorMessage } from "@/components/api-error-message";
import { ImpactLevelBadge } from "@/components/ui/impact-level-badge";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import { simulateVariableChange } from "@/lib/api";
import type { SimulationResult } from "@/types/consumers";
import { runSimulateChange } from "../lib/simulate-change-logic";

interface SimulateChangePanelProps {
  variableKey: string;
  dsFileKey: string;
  onClose: () => void;
}

export function SimulateChangePanel({
  variableKey,
  dsFileKey,
  onClose,
}: SimulateChangePanelProps) {
  const [proposedValue, setProposedValue] = useState("");
  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<ReturnType<typeof toApiErrorDisplay> | null>(null);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulating(true);
    setError(null);

    try {
      const response = await runSimulateChange(simulateVariableChange, {
        dsFileKey,
        variableKey,
        proposedValue: proposedValue.trim() || undefined,
      });
      if (response.ok) {
        setResult(response.data);
        return;
      }
      setError(toApiErrorDisplay(response.error, {
        fallbackTitle: "Simulation failed",
        fallbackMessage: "Unable to simulate variable change.",
      }));
    } catch (cause) {
      setError(toApiErrorDisplay(cause, {
        fallbackTitle: "Simulation failed",
        fallbackMessage: "Unable to simulate variable change.",
      }));
    } finally {
      setSimulating(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose}>
      <ModalContent size="md">
        <ModalHeader>
          <h2 className="text-lg font-titles font-semibold tracking-tight titles-color">Simulate Change</h2>
          <ModalCloseButton onClick={onClose} />
        </ModalHeader>

        <div className="overflow-y-auto p-4">
          {!result ? (
            <form onSubmit={handleSimulate} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Variable
                </label>
                <p className="rounded-md bg-muted px-3 py-2 text-sm font-mono">
                  {variableKey}
                </p>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="proposed-value"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Proposed value
                </label>
                <Input
                  id="proposed-value"
                  value={proposedValue}
                  onChange={(e) => setProposedValue(e.target.value)}
                  placeholder="Enter new value..."
                  disabled={simulating}
                />
              </div>

              <StatusAlert variant="info" title="What this does">
                Simulates changing this variable's value and shows which
                consumer files would be affected.
              </StatusAlert>

              {error ? <ApiErrorMessage error={error} /> : null}

              <Button
                type="submit"
                className="w-full"
                disabled={simulating}
              >
                {simulating ? "Simulating..." : "Simulate Change"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <ImpactLevelBadge level={result.impactLevel} />
                <span className="text-sm text-muted-foreground">
                  {result.impactLevel} impact
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded border border-border bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold">{result.totalNodes}</p>
                  <p className="text-xs text-muted-foreground">total nodes</p>
                </div>
                <div className="rounded border border-border bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold">{result.totalConsumers}</p>
                  <p className="text-xs text-muted-foreground">consumers</p>
                </div>
              </div>

              {result.warnings.length > 0 && (
                <StatusAlert variant="warning" title="Warnings">
                  <ul className="mt-1 list-disc pl-4 text-xs">
                    {result.warnings.map((warning, i) => (
                      <li key={i}>{warning.message}</li>
                    ))}
                  </ul>
                </StatusAlert>
              )}

              <div className="space-y-2">
                <h3 className="text-base font-titles font-semibold titles-color">Affected Consumers</h3>
                <div className="space-y-2">
                  {result.affectedConsumers.map((consumer) => (
                    <div
                      key={consumer.consumerId}
                      className="rounded border border-border bg-card p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {consumer.consumerName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {consumer.consumerFileKey}
                          </p>
                        </div>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                          {consumer.nodeCount} nodes
                        </span>
                      </div>
                      {consumer.sampleLinks.length > 0 && (
                        <a
                          href={consumer.sampleLinks[0]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-block text-xs text-primary hover:underline"
                        >
                          View in Figma →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <StatusAlert variant="info" title="Disclaimer">
                {result.disclaimer}
              </StatusAlert>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setResult(null);
                  setProposedValue("");
                }}
              >
                Simulate Another Value
              </Button>
            </div>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
}
