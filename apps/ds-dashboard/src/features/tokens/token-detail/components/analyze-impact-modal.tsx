/**
 * Analyze Impact Modal — launch point for token impact analysis.
 * Navigates to /tokens/:tokenPath/impact with optional newValue and depth params.
 */

import { useId, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Target } from "lucide-react";
import { normalizeToHex6 } from "@/lib/color-utils";
import type { TokenEntry } from "@/types/token-registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalFooter,
} from "@/components/ui/overlay/modal";

interface AnalyzeImpactModalProps {
  token: TokenEntry;
  open: boolean;
  onClose: () => void;
}

const TITLE_ID = "analyze-impact-modal-title";

function parseDepth(raw: string | null) {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed)) return 4;
  return Math.max(0, Math.min(8, parsed));
}

export function AnalyzeImpactModal({ token, open, onClose }: AnalyzeImpactModalProps) {
  const navigate = useNavigate();
  const titleId = useId() || TITLE_ID;

  const [newValue, setNewValue] = useState("");
  const [depth, setDepth] = useState(4);

  const typedColor = useMemo(() => normalizeToHex6(newValue), [newValue]);

  function handleAnalyze() {
    const params = new URLSearchParams({ depth: String(depth) });
    if (newValue.trim()) params.set("newValue", newValue.trim());
    void navigate(`/tokens/${encodeURIComponent(token.path)}/impact?${params.toString()}`);
    onClose();
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter") handleAnalyze();
  }

  return (
    <Modal open={open} onClose={onClose} aria-labelledby={titleId}>
      <ModalContent size="md">
        <ModalHeader>
          <div>
            <h2
              id={titleId}
              className="flex items-center gap-2 text-base font-semibold"
            >
              <Target className="h-4 w-4 text-primary" />
              Impact Explorer
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              What is affected if a token changes: transitive dependencies,
              component usage, and WCAG simulation.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            ✕
          </button>
        </ModalHeader>

        <div className="space-y-4 p-5" onKeyDown={handleKeyDown}>
          {/* Token — read-only */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Token
            </label>
            <Input
              className="mt-2 font-mono text-xs"
              value={token.path}
              readOnly
              tabIndex={-1}
            />
          </div>

          {/* New value — optional */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              New value{" "}
              <span className="normal-case tracking-normal font-normal text-muted-foreground/70">
                (optional)
              </span>
            </label>
            <div className="mt-2 flex gap-2">
              <Input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="#RRGGBB or any value"
                autoFocus
              />
              <input
                type="color"
                value={typedColor ?? "#000000"}
                onChange={(e) => setNewValue(e.target.value)}
                className="h-10 w-11 rounded-md border border-border bg-transparent p-1"
                aria-label="Choose new color value"
              />
            </div>
          </div>

          {/* Depth */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Depth
            </label>
            <Select
              className="mt-2 w-full"
              value={String(depth)}
              onChange={(e) => setDepth(parseDepth(e.target.value))}
            >
              {Array.from({ length: 9 }).map((_, i) => (
                <option key={i} value={String(i)}>
                  {i}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <ModalFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleAnalyze}>Analyze</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
