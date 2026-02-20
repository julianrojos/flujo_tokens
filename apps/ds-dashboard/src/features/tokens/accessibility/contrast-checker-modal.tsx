import { useEffect, useMemo } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { SemanticColorOption } from "./types";
import { evaluateWcagContrast } from "./wcag";

interface ContrastCheckerModalProps {
  open: boolean;
  onClose: () => void;
  backgroundOptions: SemanticColorOption[];
  foregroundOptions: SemanticColorOption[];
  backgroundTokenPath: string;
  foregroundTokenPath: string;
  onBackgroundChange: (tokenPath: string) => void;
  onForegroundChange: (tokenPath: string) => void;
}

function passBadge(condition: boolean) {
  return condition ? (
    <Badge variant="success">Pass</Badge>
  ) : (
    <Badge variant="warning">Fail</Badge>
  );
}

function findOptionByPath(options: SemanticColorOption[], tokenPath: string): SemanticColorOption | null {
  const match = options.find((option) => option.tokenPath === tokenPath);
  return match || null;
}

export function ContrastCheckerModal({
  open,
  onClose,
  backgroundOptions,
  foregroundOptions,
  backgroundTokenPath,
  foregroundTokenPath,
  onBackgroundChange,
  onForegroundChange,
}: ContrastCheckerModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const selectedBackground = useMemo(
    () => findOptionByPath(backgroundOptions, backgroundTokenPath),
    [backgroundOptions, backgroundTokenPath],
  );
  const selectedForeground = useMemo(
    () => findOptionByPath(foregroundOptions, foregroundTokenPath),
    [foregroundOptions, foregroundTokenPath],
  );

  const result = useMemo(() => {
    if (!selectedBackground || !selectedForeground) return null;
    return evaluateWcagContrast(
      selectedBackground.hexValue,
      selectedForeground.hexValue,
    );
  }, [selectedBackground, selectedForeground]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/35"
        aria-label="Close contrast checker modal"
        onClick={onClose}
      />

      <div className="absolute left-1/2 top-1/2 w-[min(920px,94vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between border-b border-border/70 p-5">
          <div>
            <h3 className="text-lg font-semibold">Color Accessibility Checker</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Compruebe el contraste de colores entre un fondo y un primer plano.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close dialog">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-semibold">Background (Semantic)</label>
            <Select
              value={backgroundTokenPath}
              onChange={(event) => onBackgroundChange(event.target.value)}
            >
              {backgroundOptions.map((option) => (
                <option key={option.tokenPath} value={option.tokenPath}>
                  {option.label}
                </option>
              ))}
            </Select>
            {selectedBackground ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className="inline-block h-4 w-4 rounded-sm border border-border"
                  style={{ backgroundColor: selectedBackground.hexValue }}
                  aria-hidden="true"
                />
                <span>{selectedBackground.hexValue}</span>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">Foreground (Text/Icon Semantic)</label>
            <Select
              value={foregroundTokenPath}
              onChange={(event) => onForegroundChange(event.target.value)}
            >
              {foregroundOptions.map((option) => (
                <option key={option.tokenPath} value={option.tokenPath}>
                  {option.label}
                </option>
              ))}
            </Select>
            {selectedForeground ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className="inline-block h-4 w-4 rounded-sm border border-border"
                  style={{ backgroundColor: selectedForeground.hexValue }}
                  aria-hidden="true"
                />
                <span>{selectedForeground.hexValue}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-border/70 p-5">
          {result && selectedBackground && selectedForeground ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/70 p-4">
                <p className="text-sm font-semibold">Preview</p>
                <div
                  className="mt-2 rounded-md border border-border/60 p-4"
                  style={{
                    backgroundColor: selectedBackground.hexValue,
                    color: selectedForeground.hexValue,
                  }}
                >
                  <p className="text-sm font-medium">Sample text</p>
                  <p className="mt-1 text-xs">Icon/Text contrast preview</p>
                </div>
              </div>

              <div className="rounded-lg border border-border/70 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">WCAG 2.2 Contrast</p>
                  <Badge variant="neutral">{result.ratio.toFixed(2)} : 1</Badge>
                </div>

                <div className="grid gap-2 text-sm">
                  <div className="rounded-md bg-muted/50 p-2">
                    <p className="font-semibold">Level A</p>
                    <p className="text-xs text-muted-foreground">
                      {result.levelA.message}
                    </p>
                  </div>

                  <div className="rounded-md bg-muted/50 p-2">
                    <p className="font-semibold">Level AA</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span>Normal text (≥ 4.5:1)</span>
                      {passBadge(result.levelAA.normalText)}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span>Large text (≥ 3:1)</span>
                      {passBadge(result.levelAA.largeText)}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span>UI components/icons (≥ 3:1)</span>
                      {passBadge(result.levelAA.nonTextUi)}
                    </div>
                  </div>

                  <div className="rounded-md bg-muted/50 p-2">
                    <p className="font-semibold">Level AAA</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span>Normal text (≥ 7:1)</span>
                      {passBadge(result.levelAAA.normalText)}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span>Large text (≥ 4.5:1)</span>
                      {passBadge(result.levelAAA.largeText)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
              Select one background and one foreground semantic token to evaluate contrast.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
