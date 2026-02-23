import { useEffect, useState } from "react";
import { NavLink, Route, Routes, Navigate, useLocation } from "react-router-dom";
import {
  Activity,
  ArrowLeftRight,
  Boxes,
  GitBranch,
  Layers3,
  NotebookPen,
  type LucideIcon,
  Search,
  Zap,
} from "lucide-react";

import { ComponentsPage } from "@/features/components/components-page";
import { ComponentDetailPage } from "@/features/components/component-detail/component-detail-page";
import { GlobalCommandPalette } from "@/features/command-palette/global-command-palette";
import { HealthDashboardPage } from "@/features/health/health-dashboard-page";
import { ImpactExplorerPage } from "@/features/impact/impact-explorer-page";
import { FileViewerPage } from "@/features/files/file-viewer-page";
import { OperationsPage } from "@/features/ops/operations-page";
import { AppBreadcrumb } from "@/components/app-breadcrumb";
import { SystemSwitcher } from "@/components/system-switcher";
import { NewSystemPage } from "@/features/system/new-system-page";
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
import { TokenGraphPage } from "@/features/tokens/token-graph/token-graph-page";
import { TokenDiffPage } from "@/features/tokens/token-diff/token-diff-page";
import { NamingDebtPage } from "@/features/tokens/naming-debt/naming-debt-page";
import { TokensPage } from "@/features/tokens/tokens-page";
import { TokenDetailPage } from "@/features/tokens/token-detail/token-detail-page";
import { cn } from "@/lib/utils";
import { fetchComponentRegistry } from "@/lib/api";
import { useDesignSystem } from "@/lib/design-system-context";

type NavItem = {
  to: string;
  label: string;
  description: string;
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
        to: "/health",
        label: "Health",
        description: "Operational status",
        icon: Activity,
      },
      {
        to: "/ops",
        label: "Operations",
        description: "Pipeline & synchronization",
        icon: Zap,
      },
    ],
  },
  {
    id: "tokens",
    label: "Tokens",
    items: [
      {
        to: "/tokens",
        label: "Explore",
        description: "Registry and properties",
        icon: Layers3,
      },
      {
        to: "/tokens/diff",
        label: "Compare",
        description: "Changes and breaking risk",
        icon: ArrowLeftRight,
      },
      {
        to: "/token-graph",
        label: "Graph",
        description: "Dependencies and cycles",
        icon: GitBranch,
      },
      {
        to: "/impact",
        label: "Impact",
        description: "What breaks if X changes",
        icon: Zap,
      },
      {
        to: "/tokens/naming-debt",
        label: "Naming Quality",
        description: "Consistency analysis and renames",
        icon: NotebookPen,
      },
    ],
  },
  {
    id: "components",
    label: "Components",
    items: [
      {
        to: "/components",
        label: "Explore",
        description: "Status and docs pipeline",
        icon: Boxes,
      },
    ],
  },
];

const navItems = navSections.flatMap((section) => section.items);

export default function App() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [enabledSystems, setEnabledSystems] = useState<Record<string, boolean>>({});
  const location = useLocation();
  const { activeSystem } = useDesignSystem();
  const isNewSystemRoute = location.pathname === "/system/new";
  const isSystemEnabled = !!activeSystem && !!enabledSystems[activeSystem];
  const shouldLockSidebar = isNewSystemRoute && !isSystemEnabled;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen((previous) => !previous);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!activeSystem) return;
    let cancelled = false;
    const loadSystemState = async () => {
      try {
        const registry = await fetchComponentRegistry();
        const hasComponents = Array.isArray(registry.components) && registry.components.length > 0;
        if (!cancelled) {
          setEnabledSystems((prev) => ({ ...prev, [activeSystem]: hasComponents }));
        }
      } catch {
        if (!cancelled) {
          setEnabledSystems((prev) => ({ ...prev, [activeSystem]: false }));
        }
      }
    };
    void loadSystemState();
    return () => {
      cancelled = true;
    };
  }, [activeSystem]);

  useEffect(() => {
    const onSystemCaptured = (event: Event) => {
      const customEvent = event as CustomEvent<{ systemId?: string; capturedCount?: number }>;
      const systemId = String(customEvent.detail?.systemId || "").trim();
      const capturedCount = Number(customEvent.detail?.capturedCount || 0);
      if (!systemId || capturedCount <= 0) return;
      setEnabledSystems((prev) => ({ ...prev, [systemId]: true }));
    };
    window.addEventListener("ds:system-captured-first-component", onSystemCaptured);
    return () => {
      window.removeEventListener("ds:system-captured-first-component", onSystemCaptured);
    };
  }, []);

  return (
    <>
      <div className="min-h-screen bg-background text-foreground">
        <SidebarProvider className="relative mx-auto min-h-screen w-full max-w-[1600px]">
          <Sidebar collapsed={sidebarCollapsed}>
            <SidebarHeader className="mb-1">
              <div className="mb-2 flex items-center justify-between">
                <p
                  className={cn(
                    "text-xs uppercase tracking-[0.18em] text-muted-foreground",
                    sidebarCollapsed && "sr-only",
                  )}
                >
                  Local Dashboard
                </p>
                <SidebarTrigger
                  collapsed={sidebarCollapsed}
                  onClick={() => setSidebarCollapsed((value) => !value)}
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
                            <NavLink to={item.to} className="block">
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
                                    <span className="rounded-md bg-muted/50 p-2 text-muted-foreground group-hover:text-foreground">
                                      <Icon className="h-4 w-4" />
                                    </span>
                                    <div className={cn(sidebarCollapsed && "hidden")}>
                                      <p className="text-sm font-semibold">{item.label}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {item.description}
                                      </p>
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
            <main className="w-full p-4 md:p-6 lg:p-8">
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
                  className="hidden shrink-0 items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/70 px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground lg:flex"
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

              <Routes>
                <Route path="/" element={<Navigate to="/health" replace />} />
                <Route path="/system/new" element={<NewSystemPage />} />
                <Route path="/health" element={<HealthDashboardPage />} />
                <Route path="/ops" element={<OperationsPage />} />
                <Route path="/components" element={<ComponentsPage />} />
                <Route path="/components/:slug" element={<ComponentDetailPage />} />
                <Route path="/tokens" element={<TokensPage />} />
                <Route path="/tokens/naming-debt" element={<NamingDebtPage />} />
                <Route path="/tokens/diff" element={<TokenDiffPage />} />
                <Route path="/tokens/:tokenPath" element={<TokenDetailPage />} />
                <Route path="/token-graph" element={<TokenGraphPage />} />
                <Route path="/impact" element={<ImpactExplorerPage />} />
                <Route path="/file" element={<FileViewerPage />} />
              </Routes>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </div>

      <GlobalCommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
      />
    </>
  );
}
