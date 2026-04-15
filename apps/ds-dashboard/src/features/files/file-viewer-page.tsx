import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { fetchFile, fetchFileSnippet } from "@/lib/api";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";
import { ApiErrorMessage } from "@/components/api-error-message";
import { PageHeader } from "@/components/composites";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusAlert } from "@/components/ui/status-alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function parseLineParam(raw: string | null) {
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function FileViewerPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const filePath = searchParams.get("path") ?? searchParams.get("file") ?? "";
  const line = useMemo(() => parseLineParam(searchParams.get("line")), [searchParams]);

  const [content, setContent] = useState<string | null>(null);
  const [snippet, setSnippet] = useState<{
    startLine: number;
    endLine: number;
    line: number;
    snippet: string;
    matchedBy: "line" | "query";
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);
  const [showFull, setShowFull] = useState(!line);

  useEffect(() => {
    if (!filePath) return;
    setShowFull(!line);
  }, [filePath, line]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!filePath) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setContent(null);
      setSnippet(null);
      try {
        if (!showFull && line) {
          const payload = await fetchFileSnippet({ file: filePath, line, before: 4, after: 6 });
          if (!active) return;
          setSnippet({
            startLine: payload.startLine,
            endLine: payload.endLine,
            line: payload.line,
            snippet: payload.snippet,
            matchedBy: payload.matchedBy,
          });
          setLoading(false);
          return;
        }

        const payload = await fetchFile(filePath);
        if (!active) return;
        setContent(payload.content);
      } catch (cause) {
        if (!active) return;
        setError(
          toApiErrorDisplay(cause, {
            fallbackTitle: "File load failed",
            fallbackMessage: "Unable to load file content.",
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
  }, [filePath, line, showFull]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="File Viewer"
        description={filePath || "Open a file path with ?path=..."}
        actions={(
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            {filePath ? <Badge variant="neutral">{filePath}</Badge> : null}
          </div>
        )}
      />

      {!filePath ? (
        <StatusAlert variant="warning" description="Missing path query parameter." />
      ) : null}

      {error ? (
        <ApiErrorMessage error={error} />
      ) : null}

      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-end md:justify-end">
          {line ? (
            <div className="flex items-center gap-2">
              <Badge variant="neutral">L{line}</Badge>
              <Button variant="outline" size="sm" onClick={() => setShowFull((v) => !v)}>
                {showFull ? "Show snippet" : "Show full file"}
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : snippet ? (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                Lines {snippet.startLine}–{snippet.endLine} (matched by {snippet.matchedBy})
              </div>
              <pre className="max-h-[60vh] overflow-auto rounded border border-border bg-muted/40 p-4 text-xs">
                <code className="font-mono">{snippet.snippet}</code>
              </pre>
            </div>
          ) : content ? (
            <pre className="max-h-[60vh] overflow-auto rounded border border-border bg-muted/40 p-4 text-xs">
              <code className="font-mono">{content}</code>
            </pre>
          ) : (
            <div className="text-sm text-muted-foreground">No content.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
