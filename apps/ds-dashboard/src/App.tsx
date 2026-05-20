import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import {
  NavLink,
  Route,
  Routes,
  Navigate,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import {
  Activity,
  Boxes,
  Layers3,
  Search,
  type LucideIcon,
} from 'lucide-react';

import { HealthDashboardPage } from '@/features/health/health-dashboard-page';
import { SystemTabsLayout } from '@/features/system/system-tabs-layout';
import { AppBreadcrumb } from '@/components/app-breadcrumb';
import {
  FigmaConnectionModal,
  FigmaConnectionSidebarButton,
} from '@/components/figma-connection';
import { SystemSwitcher } from '@/components/system-switcher';
import { useFigmaMcpStatus } from '@/lib/figma-mcp-status-context';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarInset,
  SidebarMenu,
  SidebarNavItem,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { useDesignSystem } from '@/lib/design-system-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Modal, ModalCloseButton, ModalContent } from '@/components/ui/overlay';
import { fetchComponentCatalog, fetchTokenCatalog } from '@/lib/api';
import {
  ROUTE_PATTERNS,
  toComponentDetail,
  toSystemOverview,
  toSystemConsumers,
  toTokenDetail,
} from '@/lib/routes';

const NewSystemPage = lazy(() =>
  import('@/features/system/new-system-page').then((module) => ({
    default: module.NewSystemPage,
  })),
);

const DesignSystemsAdminPage = lazy(() =>
  import('@/features/system/design-systems-admin-page').then((module) => ({
    default: module.DesignSystemsAdminPage,
  })),
);

const ComponentsPage = lazy(() =>
  import('@/features/components/components-page').then((module) => ({
    default: module.ComponentsPage,
  })),
);

const ComponentDetailPage = lazy(() =>
  import('@/features/components/component-detail/component-detail-page').then(
    (module) => ({
      default: module.ComponentDetailPage,
    }),
  ),
);

const EditComponentDocsPage = lazy(() =>
  import('@/features/components/edit-component-docs/edit-component-docs-page').then(
    (module) => ({
      default: module.EditComponentDocsPage,
    }),
  ),
);

const TokensPage = lazy(() =>
  import('@/features/tokens/tokens-page').then((module) => ({
    default: module.TokensPage,
  })),
);

const TokenDetailPage = lazy(() =>
  import('@/features/tokens/token-detail/token-detail-page').then((module) => ({
    default: module.TokenDetailPage,
  })),
);

const ConsumersPage = lazy(() =>
  import('@/features/consumers/consumers-page').then((module) => ({
    default: module.ConsumersPage,
  })),
);

const ConsumerDetailPage = lazy(() =>
  import('@/features/consumers/consumer-detail-page').then((module) => ({
    default: module.ConsumerDetailPage,
  })),
);

function RouteLoadingFallback() {
  return null;
}

class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const errorId = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
    console.error(
      `[RouteErrorBoundary][${errorId}] Lazy route failed to load:`,
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-destructive/70 bg-destructive/10 p-6">
          <h3 className="text-base font-titles font-semibold titles-color">
            Failed to load view
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Please refresh and try again.
          </p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Refresh
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  isSystemPrimary?: boolean;
};

type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

type SearchItem = {
  id: string;
  label: string;
  section: string;
  to: string;
  icon: 'route' | 'token' | 'component';
  searchText: string;
};

const navSections: NavSection[] = [
  {
    id: 'system',
    label: 'System',
    items: [
      {
        to: '__system_overview__',
        label: 'System',
        icon: Activity,
        isSystemPrimary: true,
      },
    ],
  },
  {
    id: 'tokens',
    label: 'Tokens',
    items: [
      {
        to: ROUTE_PATTERNS.tokens,
        label: 'Tokens',
        icon: Layers3,
      },
    ],
  },
  {
    id: 'components',
    label: 'Components',
    items: [
      {
        to: ROUTE_PATTERNS.components,
        label: 'Components',
        icon: Boxes,
      },
    ],
  },
];

function isSystemPrimaryNavItem(section: NavSection, item: NavItem): boolean {
  return section.id === 'system' && item.isSystemPrimary === true;
}

const DEFAULT_PREFETCH_RETRY_COOLDOWN_MS = 5_000;
const PREFETCH_RETRY_COOLDOWN_MS = (() => {
  const configured = Number(import.meta.env.VITE_PREFETCH_RETRY_COOLDOWN_MS);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }
  return DEFAULT_PREFETCH_RETRY_COOLDOWN_MS;
})();

function SystemEntryRedirect() {
  const { systems, activeSystem } = useDesignSystem();
  if (!systems.length) {
    return <Navigate to={ROUTE_PATTERNS.newSystem} replace />;
  }
  const activeSystemExists = systems.some(
    (system) => system.id === activeSystem,
  );
  const targetId = activeSystemExists ? activeSystem : systems[0].id;
  return <Navigate to={toSystemOverview(targetId)} replace />;
}

function SystemConsumersRedirect() {
  const { systems, activeSystem } = useDesignSystem();
  if (!systems.length) {
    return <Navigate to={ROUTE_PATTERNS.newSystem} replace />;
  }
  const activeSystemExists = systems.some(
    (system) => system.id === activeSystem,
  );
  const targetId = activeSystemExists ? activeSystem : systems[0].id;
  return <Navigate to={toSystemConsumers(targetId)} replace />;
}

export default function App() {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isFigmaConnectionModalOpen, setIsFigmaConnectionModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tokenSearchItems, setTokenSearchItems] = useState<SearchItem[]>([]);
  const [componentSearchItems, setComponentSearchItems] = useState<SearchItem[]>(
    [],
  );
  const [searchIndexLoading, setSearchIndexLoading] = useState(false);
  const [searchIndexError, setSearchIndexError] = useState<string | null>(null);
  const [searchIndexWarning, setSearchIndexWarning] = useState<string | null>(null);
  const { connectionState } = useFigmaMcpStatus();
  const indexLoadedForSystemRef = useRef<string | null>(null);
  const componentsPrefetchedRef = useRef(false);
  const componentsPrefetchRetryAfterRef = useRef(0);
  const location = useLocation();
  const { systems, activeSystem } = useDesignSystem();
  const hasSystems = systems.length > 0;
  const shouldLockSidebar = !hasSystems;

  const systemNavItems = useMemo(() => {
    if (systems.length === 0) {
      return [
        {
          to: ROUTE_PATTERNS.newSystem,
          label: 'System',
          icon: Activity,
          isSystemPrimary: true,
        },
      ];
    }
    const activeSystemExists = systems.some(
      (system) => system.id === activeSystem,
    );
    const systemId = activeSystemExists ? activeSystem : systems[0].id;
    return [
      {
        to: toSystemOverview(systemId),
        label: 'System',
        icon: Activity,
        isSystemPrimary: true,
      },
    ];
  }, [activeSystem, systems]);

  const prefetchComponentsRoutes = useCallback(() => {
    if (Date.now() < componentsPrefetchRetryAfterRef.current) return;
    if (componentsPrefetchedRef.current) return;
    componentsPrefetchedRef.current = true;
    void Promise.all([
      import('@/features/components/components-page'),
      import('@/features/components/component-detail/component-detail-page'),
    ]).catch(() => {
      componentsPrefetchedRef.current = false;
      componentsPrefetchRetryAfterRef.current =
        Date.now() + PREFETCH_RETRY_COOLDOWN_MS;
    });
  }, []);

  const prefetchRoute = useCallback(
    (to: string) => {
      if (to === ROUTE_PATTERNS.components) {
        prefetchComponentsRoutes();
        return;
      }
    },
    [prefetchComponentsRoutes],
  );

  const resolvedNavSections = useMemo(
    () =>
      navSections.map((section) => {
        if (section.id === 'system') {
          return {
            ...section,
            items: section.items.map((item) => {
              if (item.to === '__system_overview__') {
                return {
                  ...item,
                  to: systemNavItems[0]?.to || '',
                };
              }
              return item;
            }),
          };
        }
        return section;
      }),
    [systemNavItems],
  );

  const routeSearchItems = useMemo<SearchItem[]>(
    () =>
      resolvedNavSections.flatMap((section) =>
        section.items.map((item) => ({
          id: `${section.id}:${item.to}`,
          label: item.label,
          section: section.label,
          to: item.to,
          icon: 'route',
          searchText: `${item.label} ${section.label}`,
        })),
      ),
    [resolvedNavSections],
  );

  const loadSearchIndex = useCallback(async () => {
    const cacheKey = String(activeSystem || '');
    setSearchIndexLoading(true);
    setSearchIndexError(null);
    setSearchIndexWarning(null);
    const [tokenCatalogResult, componentCatalogResult] = await Promise.allSettled(
      [fetchTokenCatalog(), fetchComponentCatalog()],
    );

    if (tokenCatalogResult.status === 'fulfilled') {
      setTokenSearchItems(
        (tokenCatalogResult.value.entries ?? []).map((entry) => ({
          id: `token:${entry.path}`,
          label: entry.path,
          section: 'Tokens',
          to: toTokenDetail(entry.path),
          icon: 'token',
          searchText: `${entry.path} ${entry.slashPath} ${entry.cssVar} ${entry.collection} ${entry.type}`,
        })),
      );
    } else {
      setTokenSearchItems([]);
    }

    if (componentCatalogResult.status === 'fulfilled') {
      setComponentSearchItems(
        (componentCatalogResult.value.components ?? []).map((item) => ({
          id: `component:${item.slug}`,
          label: item.display_name,
          section: 'Components',
          to: toComponentDetail(item.slug),
          icon: 'component',
          searchText: `${item.display_name} ${item.slug}`,
        })),
      );
    } else {
      setComponentSearchItems([]);
    }

    if (
      tokenCatalogResult.status === 'rejected' &&
      componentCatalogResult.status === 'rejected'
    ) {
      indexLoadedForSystemRef.current = null;
      setSearchIndexError('Search index unavailable. Please retry.');
    } else {
      if (
        tokenCatalogResult.status === 'rejected' ||
        componentCatalogResult.status === 'rejected'
      ) {
        const failedSource =
          tokenCatalogResult.status === 'rejected' ? 'tokens' : 'components';
        setSearchIndexWarning(
          `Partial results: ${failedSource} search data is temporarily unavailable.`,
        );
      }
      indexLoadedForSystemRef.current = cacheKey;
    }

    setSearchIndexLoading(false);
  }, [activeSystem]);

  useEffect(() => {
    if (!searchOpen) return;
    const cacheKey = String(activeSystem || '');
    if (
      indexLoadedForSystemRef.current === cacheKey &&
      !searchIndexError
    ) {
      return;
    }
    void loadSearchIndex();
  }, [searchOpen, activeSystem, loadSearchIndex, searchIndexError]);

  const searchItems = useMemo<SearchItem[]>(
    () => [...routeSearchItems, ...componentSearchItems, ...tokenSearchItems],
    [routeSearchItems, componentSearchItems, tokenSearchItems],
  );

  const filteredSearchItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return routeSearchItems;
    return searchItems
      .filter((item) => item.searchText.toLowerCase().includes(query))
      .slice(0, 120);
  }, [routeSearchItems, searchItems, searchQuery]);

  const isSystemSectionActive = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    const systemId = segments[0];
    if (!systemId) return false;
    const systemExists = systems.some((system) => system.id === systemId);
    if (!systemExists) return false;
    if (segments.length === 1) return true;
    return ['overview', 'admin', 'consumers'].includes(segments[1] || '');
  }, [location.pathname, systems]);

  return (
    <>
      <div className="min-h-screen text-foreground">
        <SidebarProvider className="relative mx-auto min-h-screen w-full max-w-[1200px] border-x border-border-soft bg-surface-1">
          <Sidebar collapsed={sidebarCollapsed}>
            <SidebarHeader className="mb-0 pb-2">
              <div className="mb-2 flex items-center justify-between gap-3">
                <SidebarTrigger
                  collapsed={sidebarCollapsed}
                  onClick={() => setSidebarCollapsed((value) => !value)}
                  aria-label="DS Graph sidebar toggle"
                />
              </div>
              <SystemSwitcher collapsed={sidebarCollapsed} />
            </SidebarHeader>

            <SidebarContent
              className={cn(
                shouldLockSidebar && 'pointer-events-none opacity-40 grayscale',
              )}
            >
              {resolvedNavSections.map((section) => (
                <SidebarGroup key={section.id}>
                  {section.label === 'System' ||
                  section.label === 'Tokens' ||
                  section.label === 'Components' ? null : (
                    <SidebarGroupLabel
                      className={cn(sidebarCollapsed && 'sr-only')}
                    >
                      {section.label}
                    </SidebarGroupLabel>
                  )}
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {section.items.map((item) => {
                        const Icon = item.icon;
                        const isPrimarySystemItem = isSystemPrimaryNavItem(section, item);
                        return (
                          <SidebarMenuItem key={item.to}>
                            <NavLink
                              to={item.to}
                              className="block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onMouseEnter={() => prefetchRoute(item.to)}
                              onFocus={() => prefetchRoute(item.to)}
                            >
                              {({ isActive }) => (
                                <SidebarNavItem
                                  isActive={isActive || (isPrimarySystemItem && isSystemSectionActive)}
                                  title={
                                    sidebarCollapsed ? item.label : undefined
                                  }
                                >
                                  <div
                                    className={cn(
                                      'flex items-center gap-3',
                                      sidebarCollapsed && 'justify-center',
                                    )}
                                  >
                                    <span className="rounded-md bg-white/10 p-2 text-white/80 group-hover:text-white">
                                      <Icon className="h-4 w-4" />
                                    </span>
                                    {!sidebarCollapsed ? (
                                      <p className="text-sm font-semibold text-white">
                                        {item.label}
                                      </p>
                                    ) : null}
                                  </div>
                                </SidebarNavItem>
                              )}
                            </NavLink>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </SidebarContent>

            <SidebarFooter className="flex justify-center">
              <FigmaConnectionSidebarButton
                onClick={() => setIsFigmaConnectionModalOpen(true)}
                connectionState={connectionState}
                collapsed={sidebarCollapsed}
              />
            </SidebarFooter>
          </Sidebar>

          <SidebarInset>
            <main className="w-full p-4 md:p-6 lg:p-8">
              <header className="mb-5 rounded-xl border border-border/70 bg-card/75 p-4 shadow-panel backdrop-blur-lg lg:hidden">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Menu
                </p>
                <div className="mt-3 space-y-3">
                  {resolvedNavSections.map((section) => (
                    <div key={section.id} className="space-y-2">
                      {section.label === 'System' ||
                      section.label === 'Tokens' ||
                      section.label === 'Components' ? null : (
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {section.label}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {section.items.map((item) => (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            onMouseEnter={() => prefetchRoute(item.to)}
                            onFocus={() => prefetchRoute(item.to)}
                            className={({ isActive }) => {
                              const isPrimarySystemItem = isSystemPrimaryNavItem(section, item);
                              const effectiveActive =
                                isActive || (isPrimarySystemItem && isSystemSectionActive);
                              return (
                              cn(
                                'rounded-md px-3 py-2 text-sm font-semibold transition',
                                effectiveActive
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-foreground',
                              )
                              );
                            }}
                          >
                            {item.label}
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-accent hover:text-white"
                    onClick={() => setSearchOpen(true)}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      Search
                    </span>
                  </button>
                </div>
              </header>

              <div className="mb-4 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <AppBreadcrumb />
                </div>
                <div className="hidden shrink-0 items-center gap-2 lg:flex">
                  <button
                    type="button"
                    className="items-center justify-between gap-3 rounded border border-border/70 bg-white px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-white lg:flex"
                    onClick={() => setSearchOpen(true)}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      Search
                    </span>
                  </button>
                </div>
              </div>

              <RouteErrorBoundary
                key={`${location.pathname}${location.search}${location.hash}`}
              >
                <Suspense fallback={<RouteLoadingFallback />}>
                  <Routes>
                    <Route
                      path={ROUTE_PATTERNS.newSystem}
                      element={<NewSystemPage />}
                    />
                    <Route path="/:systemId" element={<SystemTabsLayout />}>
                      <Route
                        path="overview"
                        element={<HealthDashboardPage />}
                      />
                      <Route
                        path="admin"
                        element={<DesignSystemsAdminPage />}
                      />
                      <Route
                        path="consumers"
                        element={<ConsumersPage />}
                      />
                    </Route>
                    <Route path={ROUTE_PATTERNS.consumers} element={<SystemConsumersRedirect />} />
                    <Route
                      path={ROUTE_PATTERNS.root}
                      element={<SystemEntryRedirect />}
                    />
                    <Route
                      path={ROUTE_PATTERNS.components}
                      element={<ComponentsPage />}
                    />
                    <Route
                      path={ROUTE_PATTERNS.componentDetail}
                      element={<ComponentDetailPage />}
                    />
                    <Route
                      path={ROUTE_PATTERNS.componentEditDocs}
                      element={<EditComponentDocsPage />}
                    />
                    <Route
                      path={ROUTE_PATTERNS.tokens}
                      element={<TokensPage />}
                    />
                    <Route
                      path={ROUTE_PATTERNS.tokenDetail}
                      element={<TokenDetailPage />}
                    />
                    <Route
                      path={ROUTE_PATTERNS.consumerDetail}
                      element={<ConsumerDetailPage />}
                    />
                  </Routes>
                </Suspense>
              </RouteErrorBoundary>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </div>

      <FigmaConnectionModal
        open={isFigmaConnectionModalOpen}
        onClose={() => setIsFigmaConnectionModalOpen(false)}
      />

      <Modal
        open={searchOpen}
        onClose={() => {
          setSearchOpen(false);
          setSearchQuery('');
          setSearchIndexError(null);
          setSearchIndexWarning(null);
        }}
      >
        <ModalContent size="md">
          <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search sections and pages..."
              className="border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
              autoFocus
            />
            <ModalCloseButton
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery('');
              }}
              label="Close search"
            />
          </div>
          <div className="max-h-[50vh] overflow-y-auto p-2">
            {searchIndexLoading ? (
              <div className="rounded-md border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
                Building search index...
              </div>
            ) : null}
            {!searchIndexLoading && searchIndexError ? (
              <div className="mb-2 rounded-md border border-status-error/30 bg-status-error-bg/20 p-3 text-sm text-status-error">
                <p>{searchIndexError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void loadSearchIndex()}
                >
                  Retry
                </Button>
              </div>
            ) : null}
            {!searchIndexLoading && !searchIndexError && searchIndexWarning ? (
              <div className="mb-2 rounded-md border border-status-warning/30 bg-status-warning-bg/20 p-3 text-sm text-status-warning">
                {searchIndexWarning}
              </div>
            ) : null}
            {!searchIndexLoading && filteredSearchItems.length === 0 ? (
              <div className="rounded-md border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
                No results found for "{searchQuery}".
              </div>
            ) : (
              <div className="space-y-1">
                {filteredSearchItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-start gap-3 rounded-md border border-transparent px-3 py-2 text-left transition hover:border-border/70 hover:bg-accent/50"
                    onClick={() => {
                      setSearchOpen(false);
                      setSearchQuery('');
                      navigate(item.to);
                    }}
                  >
                    <span className="mt-0.5 rounded-md border border-border/70 bg-background p-1.5 text-muted-foreground">
                      {item.icon === 'token' ? (
                        <Layers3 className="h-3.5 w-3.5" />
                      ) : item.icon === 'component' ? (
                        <Boxes className="h-3.5 w-3.5" />
                      ) : (
                        <Search className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {item.label}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.section}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </ModalContent>
      </Modal>
    </>
  );
}
