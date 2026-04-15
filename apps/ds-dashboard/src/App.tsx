import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { NavLink, Route, Routes, Navigate, useLocation } from "react-router-dom";
import {
  Activity,
  Boxes,
  Layers3,
  Settings2,
  type LucideIcon,
  Search,
  Network,
} from "lucide-react";

import { HealthDashboardPage } from "@/features/health/health-dashboard-page";
import { AppBreadcrumb } from "@/components/app-breadcrumb";
import { SystemSwitcher } from "@/components/system-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useDesignSystem } from "@/lib/design-system-context";
import { Button } from "@/components/ui/button";
import { ROUTE_PATTERNS } from "@/lib/routes";

const GlobalCommandPalette = lazy(() =>
  import("@/features/command-palette/global-command-palette").then((module) => ({
    default: module.GlobalCommandPalette,
  })),
);

const NewSystemPage = lazy(() =>
  import("@/features/system/new-system-page").then((module) => ({
    default: module.NewSystemPage,
  })),
);

const DesignSystemsAdminPage = lazy(() =>
  import("@/features/system/design-systems-admin-page").then((module) => ({
    default: module.DesignSystemsAdminPage,
  })),
);

const OperationsPage = lazy(() =>
  import("@/features/ops/operations-page").then((module) => ({
    default: module.OperationsPage,
  })),
);

const ComponentsPage = lazy(() =>
  import("@/features/components/components-page").then((module) => ({
    default: module.ComponentsPage,
  })),
);

const ComponentDetailPage = lazy(() =>
  import("@/features/components/component-detail/component-detail-page").then((module) => ({
    default: module.ComponentDetailPage,
  })),
);

const EditComponentDocsPage = lazy(() =>
  import("@/features/components/edit-component-docs/edit-component-docs-page").then((module) => ({
    default: module.EditComponentDocsPage,
  })),
);

const TokensPage = lazy(() =>
  import("@/features/tokens/tokens-page").then((module) => ({
    default: module.TokensPage,
  })),
);

const TokenDetailPage = lazy(() =>
  import("@/features/tokens/token-detail/token-detail-page").then((module) => ({
    default: module.TokenDetailPage,
  })),
);

const TokenGraphPage = lazy(() =>
  import("@/features/tokens/token-graph/token-graph-page").then((module) => ({
    default: module.TokenGraphPage,
  })),
);

const FileViewerPage = lazy(() =>
  import("@/features/files/file-viewer-page").then((module) => ({
    default: module.FileViewerPage,
  })),
);

const ConsumersPage = lazy(() =>
  import("@/features/consumers/consumers-page").then((module) => ({
    default: module.ConsumersPage,
  })),
);

const ConsumerDetailPage = lazy(() =>
  import("@/features/consumers/consumer-detail-page").then((module) => ({
    default: module.ConsumerDetailPage,
  })),
);

function RouteLoadingFallback() {
  return null;
}

class RouteErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const errorId = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
    console.error(`[RouteErrorBoundary][${errorId}] Lazy route failed to load:`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-destructive/70 bg-destructive/10 p-6">
          <h3 className="text-lg font-semibold text-destructive">Failed to load view</h3>
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

class PaletteErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const errorId = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
    console.error(`[PaletteErrorBoundary][${errorId}] Command palette failed to load:`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    id: "system",
    label: "System",
    items: [
      {
        to: ROUTE_PATTERNS.health,
        label: "System",
        icon: Activity,
      },
      {
        to: ROUTE_PATTERNS.systemAdmin,
        label: "Design Systems Admin",
        icon: Settings2,
      },
      {
        to: ROUTE_PATTERNS.consumers,
        label: "Consumer Files",
        icon: Network,
      },
    ],
  },
  {
    id: "tokens",
    label: "Tokens",
    items: [
      {
        to: ROUTE_PATTERNS.tokens,
        label: "Tokens",
        icon: Layers3,
      },
    ],
  },
  {
    id: "components",
    label: "Components",
    items: [
      {
        to: ROUTE_PATTERNS.components,
        label: "Components",
        icon: Boxes,
      },
    ],
  },
];

const DEFAULT_PREFETCH_RETRY_COOLDOWN_MS = 5_000;
const PREFETCH_RETRY_COOLDOWN_MS = (() => {
  const configured = Number(import.meta.env.VITE_PREFETCH_RETRY_COOLDOWN_MS);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }
  return DEFAULT_PREFETCH_RETRY_COOLDOWN_MS;
})();

export default function App() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const componentsPrefetchedRef = useRef(false);
  const componentsPrefetchRetryAfterRef = useRef(0);
  const location = useLocation();
  const { systems } = useDesignSystem();
  const hasSystems = systems.length > 0;
  const shouldLockSidebar = !hasSystems;

  const prefetchComponentsRoutes = useCallback(() => {
    if (Date.now() < componentsPrefetchRetryAfterRef.current) return;
    if (componentsPrefetchedRef.current) return;
    componentsPrefetchedRef.current = true;
    void Promise.all([
      import("@/features/components/components-page"),
      import("@/features/components/component-detail/component-detail-page"),
    ]).catch(() => {
      componentsPrefetchedRef.current = false;
      componentsPrefetchRetryAfterRef.current = Date.now() + PREFETCH_RETRY_COOLDOWN_MS;
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen((previous) => !previous);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <div className="min-h-screen bg-background text-foreground">
        <SidebarProvider className="relative mx-auto min-h-screen w-full max-w-[1200px]">
          <Sidebar collapsed={sidebarCollapsed}>
            <SidebarHeader className="mb-1">
              <div className="mb-2 flex items-center justify-between">
                <SidebarTrigger
                  collapsed={sidebarCollapsed}
                  onClick={() => setSidebarCollapsed((value) => !value)}
                  aria-label="DS Graph sidebar toggle"
                />
              </div>
              <SystemSwitcher collapsed={sidebarCollapsed} />
            </SidebarHeader>

            <SidebarContent className={cn(shouldLockSidebar && "pointer-events-none opacity-40 grayscale")}>
              {navSections.map((section) => (
                <SidebarGroup key={section.id}>
                  <SidebarGroupLabel className={cn(sidebarCollapsed && "sr-only")}>
                    {section.label}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {section.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <SidebarMenuItem key={item.to}>
                            <NavLink
                              to={item.to}
                              className="block"
                              onMouseEnter={() => prefetchRoute(item.to)}
                              onFocus={() => prefetchRoute(item.to)}
                            >
                              {({ isActive }) => (
                                <SidebarMenuButton
                                  isActive={isActive}
                                  title={sidebarCollapsed ? item.label : undefined}
                                >
                                  <div
                                    className={cn(
                                      "flex items-center gap-3",
                                      sidebarCollapsed && "justify-center",
                                    )}
                                  >
                                    <span className="rounded-md bg-white/10 p-2 text-white/80 group-hover:text-white">
                                      <Icon className="h-4 w-4" />
                                    </span>
                                    <div className={cn(sidebarCollapsed && "hidden")}>
                                      <p className="text-sm font-semibold text-white">{item.label}</p>
                                    </div>
                                  </div>
                                </SidebarMenuButton>
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

          </Sidebar>

          <SidebarInset>
            <main className="w-full bg-white p-4 md:p-6 lg:p-8">
              <header className="mb-5 rounded-xl border border-border/70 bg-card/75 p-4 shadow-panel backdrop-blur-lg lg:hidden">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Menu
                </p>
                <div className="mt-3 space-y-3">
                  {navSections.map((section) => (
                    <div key={section.id} className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {section.label}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {section.items.map((item) => (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            onMouseEnter={() => prefetchRoute(item.to)}
                            onFocus={() => prefetchRoute(item.to)}
                            className={({ isActive }) =>
                              cn(
                                "rounded-md px-3 py-2 text-sm font-semibold transition",
                                isActive
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-foreground",
                              )
                            }
                          >
                            {item.label}
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="rounded-md border border-border px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground"
                    onClick={() => setCommandPaletteOpen(true)}
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
                <button
                  type="button"
                  className="hidden shrink-0 items-center justify-between gap-3 rounded border border-border/70 bg-card/70 px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground lg:flex"
                  onClick={() => setCommandPaletteOpen(true)}
                >
                  <span className="inline-flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    Search
                  </span>
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[11px]">
                    ⌘K
                  </kbd>
                </button>
              </div>

              <RouteErrorBoundary key={`${location.pathname}${location.search}${location.hash}`}>
                <Suspense fallback={<RouteLoadingFallback />}>
                  <Routes>
                    <Route path={ROUTE_PATTERNS.root} element={<Navigate to={ROUTE_PATTERNS.health} replace />} />
                    <Route path={ROUTE_PATTERNS.systemNew} element={<NewSystemPage />} />
                    <Route path={ROUTE_PATTERNS.systemAdmin} element={<DesignSystemsAdminPage />} />
                    <Route path={ROUTE_PATTERNS.health} element={<HealthDashboardPage />} />
                    <Route path={ROUTE_PATTERNS.systemOperations} element={<OperationsPage />} />
                    <Route path={ROUTE_PATTERNS.components} element={<ComponentsPage />} />
                    <Route path={ROUTE_PATTERNS.componentDetail} element={<ComponentDetailPage />} />
                    <Route path={ROUTE_PATTERNS.componentEditDocs} element={<EditComponentDocsPage />} />
                    <Route path={ROUTE_PATTERNS.tokens} element={<TokensPage />} />
                    <Route path={ROUTE_PATTERNS.tokenDetail} element={<TokenDetailPage />} />
                    <Route path={ROUTE_PATTERNS.tokenGraph} element={<TokenGraphPage />} />
                    <Route path={ROUTE_PATTERNS.fileViewer} element={<FileViewerPage />} />
                    <Route path={ROUTE_PATTERNS.consumers} element={<ConsumersPage />} />
                    <Route path={ROUTE_PATTERNS.consumerDetail} element={<ConsumerDetailPage />} />
                  </Routes>
                </Suspense>
              </RouteErrorBoundary>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </div>

      <PaletteErrorBoundary>
        <Suspense fallback={null}>
          <GlobalCommandPalette
            open={commandPaletteOpen}
            onOpenChange={setCommandPaletteOpen}
          />
        </Suspense>
      </PaletteErrorBoundary>
    </>
  );
}
