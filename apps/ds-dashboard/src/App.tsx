import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import { Activity, Boxes, GitBranch, Layers3 } from "lucide-react";

import { ComponentsPage } from "@/features/components/components-page";
import { ComponentDetailPage } from "@/features/components/component-detail/component-detail-page";
import { HealthDashboardPage } from "@/features/health/health-dashboard-page";
import { FileViewerPage } from "@/features/files/file-viewer-page";
import { TokenGraphPage } from "@/features/tokens/token-graph/token-graph-page";
import { TokensPage } from "@/features/tokens/tokens-page";
import { TokenDetailPage } from "@/features/tokens/token-detail/token-detail-page";
import { cn } from "@/lib/utils";

const navItems = [
  {
    to: "/health",
    label: "Health",
    description: "Métricas operativas",
    icon: Activity,
  },
  {
    to: "/tokens",
    label: "Tokens & Properties",
    description: "Custom properties y tokens",
    icon: Layers3,
  },
  {
    to: "/components",
    label: "Componentes",
    description: "Estado y pipeline documental",
    icon: Boxes,
  },
  {
    to: "/token-graph",
    label: "Token Graph",
    description: "Dependencias y ciclos",
    icon: GitBranch,
  },
];

export default function App() {
  return (
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
            {navItems.map((item) => {
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
          </nav>
        </aside>

        <main className="w-full flex-1 p-4 md:p-6 lg:p-8">
          <header className="mb-5 rounded-xl border border-border/70 bg-card/75 p-4 shadow-panel backdrop-blur-lg lg:hidden">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Menu
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {navItems.map((item) => (
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
          </header>

          <Routes>
            <Route path="/" element={<Navigate to="/components" replace />} />
            <Route path="/health" element={<HealthDashboardPage />} />
            <Route path="/components" element={<ComponentsPage />} />
            <Route path="/components/:slug" element={<ComponentDetailPage />} />
            <Route path="/tokens" element={<TokensPage />} />
            <Route path="/tokens/:tokenPath" element={<TokenDetailPage />} />
            <Route path="/token-graph" element={<TokenGraphPage />} />
            <Route path="/file" element={<FileViewerPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
