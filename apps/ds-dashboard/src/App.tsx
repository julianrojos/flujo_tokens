import { useEffect, useState } from "react";
import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import {
  Activity,
  ArrowLeftRight,
  Boxes,
  GitBranch,
  Layers3,
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
import { AppBreadcrumb } from "@/components/app-breadcrumb";
import { TokenGraphPage } from "@/features/tokens/token-graph/token-graph-page";
import { TokenDiffPage } from "@/features/tokens/token-diff/token-diff-page";
import { TokensPage } from "@/features/tokens/tokens-page";
import { TokenDetailPage } from "@/features/tokens/token-detail/token-detail-page";
import { cn } from "@/lib/utils";

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

  return (
    <>
      <div className="min-h-screen bg-background text-foreground">
        <div className="relative mx-auto flex min-h-screen w-full max-w-[1600px]">
          <aside className="sticky top-0 hidden h-screen w-72 flex-col border-r border-border/70 bg-card/85 p-5 backdrop-blur-lg lg:flex">
            <div className="mb-6">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Local Dashboard
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                Design System
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Datos locales del repositorio, sin servidor externo.
              </p>
            </div>

            <nav className="flex flex-col gap-2">
              {navSections.map((section) => (
                <div key={section.id} className="space-y-1">
                  <p className="px-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {section.label}
                  </p>
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          cn(
                            "group rounded-xl border border-transparent px-3 py-3 transition",
                            isActive
                              ? "border-primary/20 bg-primary/10"
                              : "hover:border-border/70 hover:bg-accent/60",
                          )
                        }
                      >
                        <div className="flex items-center gap-3">
                          <span className="rounded-md border border-border/70 bg-background p-2 text-muted-foreground group-hover:text-foreground">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold">{item.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.description}
                            </p>
                          </div>
                        </div>
                      </NavLink>
                    );
                  })}
                </div>
              ))}
            </nav>

            <button
              type="button"
              className="mt-auto flex items-center justify-between rounded-lg border border-border/70 bg-background px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
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
          </aside>

          <main className="w-full flex-1 p-4 md:p-6 lg:p-8">
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

            <AppBreadcrumb />

            <Routes>
              <Route path="/" element={<Navigate to="/health" replace />} />
              <Route path="/health" element={<HealthDashboardPage />} />
              <Route path="/components" element={<ComponentsPage />} />
              <Route path="/components/:slug" element={<ComponentDetailPage />} />
              <Route path="/tokens" element={<TokensPage />} />
              <Route path="/tokens/diff" element={<TokenDiffPage />} />
              <Route path="/tokens/:tokenPath" element={<TokenDetailPage />} />
              <Route path="/token-graph" element={<TokenGraphPage />} />
              <Route path="/impact" element={<ImpactExplorerPage />} />
              <Route path="/file" element={<FileViewerPage />} />
            </Routes>
          </main>
        </div>
      </div>

      <GlobalCommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
      />
    </>
  );
}
