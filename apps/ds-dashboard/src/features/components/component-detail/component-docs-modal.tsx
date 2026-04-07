import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

import { ApiErrorMessage } from "@/components/api-error-message";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/composites/empty-state";
import { StatusAlert } from "@/components/ui/status-alert";
import {
  Modal,
  ModalContent,
  ModalHeader,
} from "@/components/ui/overlay";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";

// S-06: Response shape from GET /api/components/:slug/docs/markdown
interface DocsResponse {
  ok: true;
  markdown: string | null;
  source: "fresh" | "cache";
  syncedAt: number | null;
  stale: boolean;
}

interface ComponentDocsModalProps {
  open: boolean;
  onClose: () => void;
  slug: string;
  displayName: string;
}

export function ComponentDocsModal({
  open,
  onClose,
  slug,
  displayName,
}: ComponentDocsModalProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      setContent(null);
      setStale(false);
      try {
        const res = await fetch(`/api/components/${encodeURIComponent(slug)}/docs/markdown`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const data: DocsResponse = await res.json();
        if (!active) return;
        setContent(data.markdown);
        setStale(data.stale);
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
  }, [open, slug]);

  return (
    <Modal open={open} onClose={onClose} zIndex={1003}>
      <ModalContent size="lg" className="max-h-[92vh] overflow-hidden">
        <ModalHeader>
          <div>
            <h3 id="component-docs-modal-title" className="text-lg font-semibold">
              Docs · {displayName}
            </h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close docs dialog">
            <X className="h-4 w-4" />
          </Button>
        </ModalHeader>

        <div className="max-h-[74vh] overflow-auto p-5">
          {stale && (
            <StatusAlert
              variant="warning"
              title="Figma data may be outdated"
              description="Sync from the component detail page to refresh."
              className="mb-4"
            />
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading docs...
            </div>
          ) : null}

          {!loading && error ? (
            <ApiErrorMessage error={error} />
          ) : null}

          {!loading && !error && content === null ? (
            <EmptyState
              title="Sin documentación"
              description="Genera y aplica documentación con IA desde la sección AI Docs"
            />
          ) : null}

          {!loading && !error && content !== null ? (
            <MarkdownViewer content={content} />
          ) : null}
        </div>
      </ModalContent>
    </Modal>
  );
}
