import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import type {
  ContrastCheckResult,
  ElementType,
  SemanticColorOption,
  TextSize,
} from "./types";
import { ColorPreview } from "./color-preview";
import { ColorSelect } from "./color-select";
import { ContrastResult } from "./contrast-result";
import { ElementTypeSelector } from "./element-type-selector";
import { TextSizeSelector } from "./text-size-selector";

interface ContrastCheckerModalProps {
  open: boolean;
  onClose: () => void;
  backgroundOptions: SemanticColorOption[];
  foregroundOptions: SemanticColorOption[];
  backgroundTokenPath: string;
  foregroundTokenPath: string;
  onBackgroundChange: (tokenPath: string) => void;
  onForegroundChange: (tokenPath: string) => void;
  elementType: ElementType;
  onElementTypeChange: (elementType: ElementType) => void;
  textSize: TextSize;
  onTextSizeChange: (textSize: TextSize) => void;
  result: ContrastCheckResult | null;
  onReset: () => void;
}

function findByPath(
  options: SemanticColorOption[],
  tokenPath: string,
): SemanticColorOption | null {
  return options.find((option) => option.tokenPath === tokenPath) || null;
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
  elementType,
  onElementTypeChange,
  textSize,
  onTextSizeChange,
  result,
  onReset,
}: ContrastCheckerModalProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !isMounted) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [open, isMounted]);

  const selectedBackground = useMemo(
    () => findByPath(backgroundOptions, backgroundTokenPath),
    [backgroundOptions, backgroundTokenPath],
  );
  const selectedForeground = useMemo(
    () => findByPath(foregroundOptions, foregroundTokenPath),
    [foregroundOptions, foregroundTokenPath],
  );

  if (!open || !isMounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="color-accessibility-checker-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Close contrast checker modal"
        onClick={onClose}
      />

      <div className="relative z-10 flex min-h-full items-center justify-center p-4 md:p-6">
        <div className="max-h-[92vh] w-[min(920px,96vw)] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-start justify-between border-b border-border/70 p-5">
            <div>
              <h3 id="color-accessibility-checker-title" className="text-lg font-semibold">
                Color Accessibility Checker
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Compruebe el contraste de colores entre un fondo y un primer plano.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close dialog">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-4 p-5 md:grid-cols-2">
            <ColorSelect
              label="Background (Semantic)"
              options={backgroundOptions}
              value={backgroundTokenPath}
              onChange={onBackgroundChange}
            />
            <ColorSelect
              label="Foreground (Text/Icon Semantic)"
              options={foregroundOptions}
              value={foregroundTokenPath}
              onChange={onForegroundChange}
            />

            <div className="md:col-span-2">
              <ElementTypeSelector value={elementType} onChange={onElementTypeChange} />
            </div>

            <div className="md:col-span-2">
              <TextSizeSelector
                value={textSize}
                onChange={onTextSizeChange}
                disabled={elementType !== "text"}
              />
            </div>
          </div>

          <div className="border-t border-border/70 p-5 space-y-4">
            {selectedBackground && selectedForeground ? (
              <ColorPreview
                backgroundColor={selectedBackground.hexValue}
                foregroundColor={selectedForeground.hexValue}
                elementType={elementType}
              />
            ) : null}

            <ContrastResult result={result} />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onReset}>
                Reset
              </Button>
              <Button variant="default" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
