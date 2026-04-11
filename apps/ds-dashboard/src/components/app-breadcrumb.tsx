import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, matchPath, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchConsumer } from "@/lib/api";
import {
  onCachedConsumerLabelUpdate,
  readCachedConsumerLabel,
  writeCachedConsumerLabel,
} from "@/lib/consumer-label-cache";

type Crumb = {
  label: string;
  to?: string;
};

function decodeSafe(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function buildCrumbs(pathname: string, options?: { consumerDetailLabel?: string }): Crumb[] {
  if (pathname === "/system/new") {
    return [{ label: "System", to: "/system/admin" }, { label: "New System" }];
  }

  if (pathname === "/system/admin") {
    return [{ label: "System" }, { label: "Design Systems Admin" }];
  }

  if (pathname === "/health") {
    return [{ label: "Health" }];
  }

  if (pathname === "/ops") {
    return [{ label: "System" }, { label: "Operations" }];
  }

  if (pathname === "/tokens") {
    return [{ label: "Tokens" }];
  }

  const tokenGraphMatch = matchPath("/tokens/:tokenPath/graph", pathname);
  if (tokenGraphMatch?.params.tokenPath) {
    return [
      { label: "Tokens", to: "/tokens" },
      { label: decodeSafe(tokenGraphMatch.params.tokenPath), to: `/tokens/${tokenGraphMatch.params.tokenPath}` },
      { label: "Graph" },
    ];
  }

  const tokenMatch = matchPath("/tokens/:tokenPath", pathname);
  if (tokenMatch?.params.tokenPath) {
    return [
      { label: "Tokens", to: "/tokens" },
      { label: decodeSafe(tokenMatch.params.tokenPath) },
    ];
  }

  if (pathname === "/components") {
    return [{ label: "Components" }];
  }

  const componentEditDocsMatch = matchPath("/components/:slug/edit-docs", pathname);
  if (componentEditDocsMatch?.params.slug) {
    return [
      { label: "Components", to: "/components" },
      { label: decodeSafe(componentEditDocsMatch.params.slug), to: `/components/${componentEditDocsMatch.params.slug}` },
      { label: "Edit docs" },
    ];
  }

  const componentMatch = matchPath("/components/:slug", pathname);
  if (componentMatch?.params.slug) {
    return [
      { label: "Components", to: "/components" },
      { label: decodeSafe(componentMatch.params.slug) },
    ];
  }

  if (pathname === "/file") {
    return [{ label: "File Viewer" }];
  }

  if (pathname === "/consumers") {
    return [{ label: "Consumer Files" }];
  }

  const consumerMatch = matchPath("/consumers/:consumerId", pathname);
  if (consumerMatch?.params.consumerId) {
    const rawConsumerId = decodeSafe(consumerMatch.params.consumerId);
    return [
      { label: "Consumer Files", to: "/consumers" },
      { label: options?.consumerDetailLabel || rawConsumerId },
    ];
  }

  return [];
}

export function AppBreadcrumb({ className }: { className?: string }) {
  const location = useLocation();
  const consumerMatch = matchPath("/consumers/:consumerId", location.pathname);
  const consumerId = consumerMatch?.params.consumerId ? decodeSafe(consumerMatch.params.consumerId) : "";
  const [consumerLabel, setConsumerLabel] = useState(() => readCachedConsumerLabel(consumerId));

  useEffect(() => {
    // Don't subscribe if no consumerId (non-consumer routes)
    if (!consumerId) {
      setConsumerLabel("");
      return;
    }

    const unsubscribe = onCachedConsumerLabelUpdate(({ consumerId: updatedId, consumerName }) => {
      if (updatedId !== consumerId) return;
      setConsumerLabel(consumerName);
    });

    let cancelled = false;
    const cachedLabel = readCachedConsumerLabel(consumerId);
    if (cachedLabel) {
      setConsumerLabel(cachedLabel);
      return () => {
        cancelled = true;
        unsubscribe();
      };
    }

    async function loadConsumerLabel() {
      try {
        const response = await fetchConsumer(consumerId);
        const resolvedName = String(response?.data?.consumerName || "").trim();
        if (!cancelled && resolvedName) {
          setConsumerLabel(resolvedName);
          writeCachedConsumerLabel(consumerId, resolvedName);
          return;
        }
        if (!cancelled) setConsumerLabel(consumerId);
      } catch {
        if (!cancelled) {
          setConsumerLabel(consumerId);
        }
      }
    }

    void loadConsumerLabel();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [consumerId]);

  const crumbs = useMemo(
    () => buildCrumbs(location.pathname, { consumerDetailLabel: consumerLabel }),
    [location.pathname, consumerLabel],
  );

  if (crumbs.length === 0) return null;

  return (
    <div className={cn("rounded-lg border border-border/70 bg-card/70 px-3 py-2", className)}>
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs">
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;
            return (
              <Fragment key={`${crumb.label}:${index}`}>
                {index > 0 ? (
                  <li className="text-muted-foreground">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </li>
                ) : null}
                <li>
                  {crumb.to && !isLast ? (
                    <Link
                      to={crumb.to}
                      className="font-medium text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={isLast ? "font-semibold text-foreground" : "font-medium"}>
                      {crumb.label}
                    </span>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
