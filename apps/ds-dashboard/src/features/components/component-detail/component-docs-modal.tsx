import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

import { ApiErrorMessage } from "@/components/api-error-message";
import { Button } from "@/components/ui/button";
import {
  Modal,
  ModalContent,
  ModalHeader,
} from "@/components/ui/overlay";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
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
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);

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

  return (
    <Modal open={open} onClose={onClose} zIndex={1003}>
      <ModalContent size="lg" className="max-h-[92vh] overflow-hidden">
        <ModalHeader>
          <div>
            <h3 id="component-docs-modal-title" className="text-lg font-semibold">
              Docs · {displayName}
            </h3>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{filePath}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close docs dialog">
            <X className="h-4 w-4" />
          </Button>
        </ModalHeader>

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
            <MarkdownViewer content={content || "No content."} />
          ) : null}
        </div>
      </ModalContent>
    </Modal>
  );
}
