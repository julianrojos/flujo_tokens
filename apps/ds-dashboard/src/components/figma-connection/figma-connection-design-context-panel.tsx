import type { FigmaMcpDesignContextCompactResponse } from '@/lib/api';
import { cn } from '@/lib/utils';

interface FigmaConnectionDesignContextPanelProps {
  contextState: {
    isLoadingContext: boolean;
    contextResult: FigmaMcpDesignContextCompactResponse | null;
    contextTokens: Array<{ id: string; name: string; isAlias: boolean; modeId?: string | null }>;
    aliasCount: number;
  };
}

export function FigmaConnectionDesignContextPanel({
  contextState,
}: FigmaConnectionDesignContextPanelProps) {
  const { isLoadingContext, contextResult, contextTokens, aliasCount } = contextState;

  return (
    <div className="space-y-1.5 rounded-md border border-border/70 bg-muted/25 p-2.5 text-[11px]">
      {isLoadingContext ? (
        <p className="text-muted-foreground">Inspecting current Figma selection…</p>
      ) : contextResult?.ok === true ? (
        <>
          <p className="font-medium text-foreground/90">
            Selection context
            {contextResult.targetNodeId ? ` · ${contextResult.targetNodeId}` : ''}
          </p>
          <p className="text-muted-foreground">
            {contextResult.selection?.count ?? 0} selected
            {contextResult.selection?.page ? ` · ${contextResult.selection.page}` : ''}
            {contextResult.component
              ? ` · ${contextResult.component.type} ${contextResult.component.name}`
              : contextResult.node
                ? ` · ${contextResult.node.type} ${contextResult.node.name}`
                : ''}
          </p>
          <p className="text-muted-foreground">
            Token bindings: {contextResult.tokens?.count ?? 0}
            {aliasCount > 0 ? ` · aliases ${aliasCount}` : ''}
            {(contextResult.tokens?.missingCount ?? 0) > 0
              ? ` · missing ${contextResult.tokens?.missingCount ?? 0}`
              : ''}
            {(contextResult.tokens?.modeFallbackCount ?? 0) > 0
              ? ` · mode fallback ${contextResult.tokens?.modeFallbackCount ?? 0}`
              : ''}
          </p>
          {contextTokens.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {contextTokens.slice(0, 6).map((token) => (
                <span
                  key={`${token.id}:${token.modeId ?? 'none'}`}
                  className={cn(
                    'rounded border px-1.5 py-0.5 font-mono',
                    token.isAlias
                      ? 'border-status-warning/40 text-status-warning'
                      : 'border-border text-muted-foreground',
                  )}
                >
                  {token.name}
                </span>
              ))}
              {contextTokens.length > 6 ? (
                <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">
                  +{contextTokens.length - 6} more
                </span>
              ) : null}
            </div>
          ) : null}
          {Array.isArray(contextResult.warnings) && contextResult.warnings.length > 0 ? (
            <p className="text-status-warning">{contextResult.warnings[0]}</p>
          ) : null}
        </>
      ) : (
        <p className="text-status-error">
          Could not inspect selection
          {contextResult?.message ? ` — ${contextResult.message}` : ''}
        </p>
      )}
    </div>
  );
}
