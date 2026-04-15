import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, matchPath, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchConsumer } from '@/lib/api';
import { buildDocumentTitleFromBreadcrumbs } from '@/lib/app-title';
import { useDesignSystem } from '@/lib/design-system-context';
import {
  ROUTE_PATTERNS,
  toComponentDetail,
  toTokenDetail,
  toSystemOverview,
  toSystemAdmin,
} from '@/lib/routes';
import {
  onCachedConsumerLabelUpdate,
  readCachedConsumerLabel,
  writeCachedConsumerLabel,
} from '@/lib/consumer-label-cache';

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

type DesignSystemEntry = { id: string; name: string };

function buildCrumbs(
  pathname: string,
  options?: {
    consumerDetailLabel?: string;
    systems?: DesignSystemEntry[];
    activeSystemId?: string;
  },
): Crumb[] {
  if (pathname === ROUTE_PATTERNS.newSystem) {
    return [
      {
        label: 'System',
        to: options?.activeSystemId
          ? toSystemAdmin(options.activeSystemId)
          : undefined,
      },
      { label: 'New System' },
    ];
  }

  const systemOverviewMatch = matchPath('/system/:systemId/overview', pathname);
  const systemAdminMatch = matchPath('/system/:systemId/admin', pathname);
  const systemOpsMatch = matchPath(ROUTE_PATTERNS.systemOperations, pathname);

  if (systemOverviewMatch?.params.systemId) {
    const systemId = systemOverviewMatch.params.systemId;
    const systems = options?.systems ?? [];
    const system = systems.find((s) => s.id === systemId);
    const systemLabel = system?.name ?? systemId;
    return [{ label: 'System' }, { label: systemLabel }, { label: 'Overview' }];
  }

  if (systemAdminMatch?.params.systemId) {
    const systemId = systemAdminMatch.params.systemId;
    const systems = options?.systems ?? [];
    const system = systems.find((s) => s.id === systemId);
    const systemLabel = system?.name ?? systemId;
    return [
      { label: 'System' },
      { label: systemLabel },
      { label: 'Design Systems Admin' },
    ];
  }

  if (systemOpsMatch?.params.systemId) {
    const systemId = systemOpsMatch.params.systemId;
    const systems = options?.systems ?? [];
    const system = systems.find((s) => s.id === systemId);
    const systemLabel = system?.name ?? systemId;
    return [
      { label: 'System' },
      { label: systemLabel },
      { label: 'Operations' },
    ];
  }

  if (pathname === ROUTE_PATTERNS.tokens) {
    return [{ label: 'Tokens' }];
  }

  const tokenGraphMatch = matchPath(ROUTE_PATTERNS.tokenGraph, pathname);
  if (tokenGraphMatch?.params.tokenPath) {
    return [
      { label: 'Tokens', to: ROUTE_PATTERNS.tokens },
      {
        label: decodeSafe(tokenGraphMatch.params.tokenPath),
        to: toTokenDetail(tokenGraphMatch.params.tokenPath),
      },
      { label: 'Graph' },
    ];
  }

  const tokenMatch = matchPath(ROUTE_PATTERNS.tokenDetail, pathname);
  if (tokenMatch?.params.tokenPath) {
    return [
      { label: 'Tokens', to: ROUTE_PATTERNS.tokens },
      { label: decodeSafe(tokenMatch.params.tokenPath) },
    ];
  }

  if (pathname === ROUTE_PATTERNS.components) {
    return [{ label: 'Components' }];
  }

  const componentEditDocsMatch = matchPath(
    ROUTE_PATTERNS.componentEditDocs,
    pathname,
  );
  if (componentEditDocsMatch?.params.slug) {
    return [
      { label: 'Components', to: ROUTE_PATTERNS.components },
      {
        label: decodeSafe(componentEditDocsMatch.params.slug),
        to: toComponentDetail(componentEditDocsMatch.params.slug),
      },
      { label: 'Edit docs' },
    ];
  }

  const componentMatch = matchPath(ROUTE_PATTERNS.componentDetail, pathname);
  if (componentMatch?.params.slug) {
    return [
      { label: 'Components', to: ROUTE_PATTERNS.components },
      { label: decodeSafe(componentMatch.params.slug) },
    ];
  }

  if (pathname === ROUTE_PATTERNS.fileViewer) {
    return [{ label: 'File Viewer' }];
  }

  if (pathname === ROUTE_PATTERNS.consumers) {
    return [{ label: 'Consumer Files' }];
  }

  const consumerMatch = matchPath(ROUTE_PATTERNS.consumerDetail, pathname);
  if (consumerMatch?.params.consumerId) {
    const rawConsumerId = decodeSafe(consumerMatch.params.consumerId);
    return [
      { label: 'Consumer Files', to: ROUTE_PATTERNS.consumers },
      { label: options?.consumerDetailLabel || rawConsumerId },
    ];
  }

  return [];
}

export function AppBreadcrumb({ className }: { className?: string }) {
  const location = useLocation();
  const consumerMatch = matchPath(
    ROUTE_PATTERNS.consumerDetail,
    location.pathname,
  );
  const consumerId = consumerMatch?.params.consumerId
    ? decodeSafe(consumerMatch.params.consumerId)
    : '';
  const [consumerLabel, setConsumerLabel] = useState(() =>
    readCachedConsumerLabel(consumerId),
  );

  useEffect(() => {
    // Don't subscribe if no consumerId (non-consumer routes)
    if (!consumerId) {
      setConsumerLabel('');
      return;
    }

    const unsubscribe = onCachedConsumerLabelUpdate(
      ({ consumerId: updatedId, consumerName }) => {
        if (updatedId !== consumerId) return;
        setConsumerLabel(consumerName);
      },
    );

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
        const resolvedName = String(response?.data?.consumerName || '').trim();
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

  const { systems, activeSystem } = useDesignSystem();

  const crumbs = useMemo(
    () =>
      buildCrumbs(location.pathname, {
        consumerDetailLabel: consumerLabel,
        systems,
        activeSystemId: activeSystem,
      }),
    [location.pathname, consumerLabel, systems, activeSystem],
  );

  useEffect(() => {
    document.title = buildDocumentTitleFromBreadcrumbs(
      crumbs.map((crumb) => crumb.label),
    );
  }, [crumbs]);

  if (crumbs.length === 0) return null;

  return (
    <div className={cn('rounded bg-card/70 px-3 py-2 pl-0', className)}>
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
                    <span
                      className={
                        isLast ? 'font-semibold text-foreground' : 'font-medium'
                      }
                    >
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
