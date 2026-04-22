import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface TokenRelationTrailItem {
  key?: string;
  label: ReactNode;
  href?: string;
  title?: string;
}

interface TokenRelationTrailProps {
  title: string;
  rootLabel: ReactNode;
  items: TokenRelationTrailItem[];
  className?: string;
  emptyText?: string;
  leadingConnector?: "left" | "right" | "none";
  itemConnector?: "left" | "right" | "comma" | "none";
  terminal?: {
    label: ReactNode;
    swatch?: string | null;
  };
  terminalConnector?: "left" | "right" | "none";
}

function renderConnector(kind: "left" | "right" | "comma" | "none") {
  if (kind === "left") return "←";
  if (kind === "right") return "→";
  if (kind === "comma") return ",";
  return null;
}

function RelationBadge({
  children,
  href,
  title,
  className,
}: {
  children: ReactNode;
  href?: string;
  title?: string;
  className?: string;
}) {
  const badge = (
    <Badge
      variant="neutral"
      className={cn(
        "border-status-success-border/50 bg-card font-mono text-xs text-status-success shadow-sm",
        className,
      )}
    >
      {children}
    </Badge>
  );

  if (!href) return badge;

  return (
    <Link
      to={href}
      className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={title}
    >
      {badge}
    </Link>
  );
}

function TrailBadge({
  children,
  href,
  title,
}: {
  children: ReactNode;
  href?: string;
  title?: string;
}) {
  const badge = (
    <Badge
      variant="neutral"
      className="font-mono text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {children}
    </Badge>
  );

  if (!href) return badge;

  return (
    <Link
      to={href}
      className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={title}
    >
      {badge}
    </Link>
  );
}

export function TokenRelationTrail({
  title,
  rootLabel,
  items,
  className,
  emptyText = "No related entries",
  leadingConnector = "right",
  itemConnector = "comma",
  terminal,
  terminalConnector = "right",
}: TokenRelationTrailProps) {
  const hasItems = items.length > 0;

  return (
    <div>
      <div className="text-xs text-muted-foreground">{title}</div>
      <div
        className={cn(
          "mt-1 inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1",
          className,
        )}
      >
        <RelationBadge>{rootLabel}</RelationBadge>
        {leadingConnector !== "none" && hasItems ? (
          <span className="text-muted-foreground">
            {renderConnector(leadingConnector)}
          </span>
        ) : null}
        {hasItems ? (
          items.map((item, index) => (
            <span
              key={item.key ?? index}
              className="inline-flex items-center gap-1"
            >
              <TrailBadge href={item.href} title={item.title}>
                {item.label}
              </TrailBadge>
              {index < items.length - 1 && itemConnector !== "none" ? (
                <span className="text-muted-foreground">
                  {renderConnector(itemConnector)}
                </span>
              ) : null}
            </span>
          ))
        ) : !terminal ? (
          <span className="text-sm text-muted-foreground">{emptyText}</span>
        ) : null}
        {terminal ? (
          <>
            {terminalConnector !== "none" && hasItems ? (
              <span className="text-muted-foreground">
                {renderConnector(terminalConnector)}
              </span>
            ) : null}
            {!hasItems && terminalConnector !== "none" ? (
              <span className="text-muted-foreground">
                {renderConnector(terminalConnector)}
              </span>
            ) : null}
            <div className="flex items-center gap-2">
              <Badge variant="neutral" className="font-mono text-xs">
                {terminal.label}
              </Badge>
              {terminal.swatch ? (
                <span
                  className="h-3.5 w-3.5 rounded border border-border shadow-sm"
                  style={{ backgroundColor: terminal.swatch }}
                  aria-label={`Color swatch ${terminal.swatch}`}
                />
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
