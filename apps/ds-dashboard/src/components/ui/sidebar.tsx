import * as React from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { cn } from "@/lib/utils";

const SIDEBAR_WIDTH = "18rem";
const SIDEBAR_WIDTH_COLLAPSED = "4.5rem";

export function SidebarProvider({
  className,
  children,
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("group/sidebar-wrapper flex min-h-screen w-full", className)}
    >
      {children}
    </div>
  );
}

export const Sidebar = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & { collapsed?: boolean }
>(({ className, children, collapsed = false, ...props }, ref) => {
  return (
    <aside
      ref={ref}
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border/70 bg-card/85 backdrop-blur-lg lg:flex",
        className,
      )}
      style={{ width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH }}
      {...props}
    >
      {children}
    </aside>
  );
});
Sidebar.displayName = "Sidebar";

export const SidebarInset = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("min-w-0 flex-1", className)} {...props} />
));
SidebarInset.displayName = "SidebarInset";

export const SidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5", className)} {...props} />
));
SidebarHeader.displayName = "SidebarHeader";

export const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex-1 overflow-auto px-3", className)} {...props} />
));
SidebarContent.displayName = "SidebarContent";

export const SidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("mt-auto p-3", className)} {...props} />
));
SidebarFooter.displayName = "SidebarFooter";

export const SidebarGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("space-y-1 pb-2", className)} {...props} />
));
SidebarGroup.displayName = "SidebarGroup";

export const SidebarGroupContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("space-y-1", className)} {...props} />
));
SidebarGroupContent.displayName = "SidebarGroupContent";

export const SidebarGroupLabel = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "px-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground",
      className,
    )}
    {...props}
  />
));
SidebarGroupLabel.displayName = "SidebarGroupLabel";

export const SidebarMenu = React.forwardRef<
  HTMLUListElement,
  React.HTMLAttributes<HTMLUListElement>
>(({ className, ...props }, ref) => (
  <ul ref={ref} className={cn("space-y-1", className)} {...props} />
));
SidebarMenu.displayName = "SidebarMenu";

export const SidebarMenuItem = React.forwardRef<
  HTMLLIElement,
  React.HTMLAttributes<HTMLLIElement>
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("list-none", className)} {...props} />
));
SidebarMenuItem.displayName = "SidebarMenuItem";

type SidebarMenuButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  isActive?: boolean;
};

export const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  SidebarMenuButtonProps
>(({ className, isActive = false, ...props }, ref) => (
  <button
    ref={ref}
    data-active={isActive}
    className={cn(
      "group w-full rounded-xl border border-transparent px-3 py-3 text-left transition",
      isActive
        ? "border-primary/20 bg-primary/10"
        : "hover:border-border/70 hover:bg-accent/60",
      className,
    )}
    {...props}
  />
));
SidebarMenuButton.displayName = "SidebarMenuButton";

export function SidebarTrigger({
  collapsed,
  onClick,
  className,
}: {
  collapsed?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground transition hover:bg-accent hover:text-foreground",
        className,
      )}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
    </button>
  );
}
