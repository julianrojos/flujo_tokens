import { Link, matchPath, useLocation, useParams } from "react-router-dom";

import { cn } from "@/lib/utils";
import { ROUTE_PATTERNS, toSystemConsumers, toSystemConsumersOverview } from "@/lib/routes";

type ConsumerViewId = "admin" | "overview";

const CONSUMER_VIEWS: Array<{ id: ConsumerViewId; label: string; to: (systemId: string) => string }> = [
  { id: "admin", label: "Admin", to: toSystemConsumers },
  { id: "overview", label: "Overview", to: toSystemConsumersOverview },
];

function resolveActiveConsumerView(pathname: string): ConsumerViewId {
  if (matchPath(ROUTE_PATTERNS.systemConsumersOverview, pathname)) return "overview";
  return "admin";
}

export function ConsumerViewsNav() {
  const location = useLocation();
  const { systemId } = useParams<{ systemId: string }>();
  const normalizedSystemId = String(systemId || "").trim();

  if (!normalizedSystemId) return null;

  const activeView = resolveActiveConsumerView(location.pathname);

  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Consumers views" role="tablist">
      {CONSUMER_VIEWS.map((view) => {
        const href = view.to(normalizedSystemId);
        const isActive = activeView === view.id;
        return (
          <Link
            key={view.id}
            to={href}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "rounded-t-md px-3 py-2 text-sm font-medium transition",
              isActive
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
