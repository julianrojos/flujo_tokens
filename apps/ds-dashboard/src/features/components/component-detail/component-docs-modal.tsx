import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";

import { ApiErrorMessage } from "@/components/api-error-message";
import { Button } from "@/components/ui/button";
import { MarkdownPreview } from "@/components/markdown/markdown-preview";
import { fetchFile } from "@/lib/api";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";

interface ComponentDocsModalProps {
  open: boolean;
  onClose: () => void;
  filePath: string;
  displayName: string;
}

export function ComponentDocsModal({
  open,
  onClose,
  filePath,
  displayName,
}: ComponentDocsModalProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !isMounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isMounted, onClose]);

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

  useEffect(() => {
    if (!open) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      setContent(null);
      try {
        const payload = await fetchFile(filePath);
        if (!active) return;
        setContent(payload.content);
      } catch (cause) {
        if (!active) return;
        setError(
          toApiErrorDisplay(cause, {
            fallbackTitle: "Docs load failed",
            fallbackMessage: "Unable to load component docs.",
          }),
        );
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [open, filePath]);

  if (!open || !isMounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1003]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="component-docs-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Close docs modal"
        onClick={onClose}
      />

      <div className="relative z-10 flex min-h-full items-center justify-center p-4 md:p-6">
        <div className="max-h-[92vh] w-[min(1040px,96vw)] overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-start justify-between border-b border-border/70 p-5">
            <div>
              <h3 id="component-docs-modal-title" className="text-lg font-semibold">
                Docs · {displayName}
              </h3>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{filePath}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close docs dialog">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="max-h-[74vh] overflow-auto p-5">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading docs...
              </div>
            ) : null}

            {!loading && error ? (
              <ApiErrorMessage error={error} />
            ) : null}

            {!loading && !error ? (
              <MarkdownPreview content={content || "No content."} />
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
