import * as React from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const sidebarProviderVariants = cva("group/sidebar-wrapper flex min-h-screen w-full");
export const sidebarVariants = cva(
  "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border/70 bg-card/85 backdrop-blur-lg lg:flex",
);
export const sidebarInsetVariants = cva("min-w-0 flex-1");
export const sidebarHeaderVariants = cva("p-5");
export const sidebarContentVariants = cva("flex-1 overflow-auto px-3");
export const sidebarFooterVariants = cva("mt-auto p-3");
export const sidebarGroupVariants = cva("space-y-1 pb-2");
export const sidebarGroupContentVariants = cva("space-y-1");
export const sidebarGroupLabelVariants = cva(
  "px-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground",
);
export const sidebarMenuVariants = cva("space-y-1");
export const sidebarMenuItemVariants = cva("list-none");
export const sidebarMenuButtonVariants = cva(
  "group w-full rounded-xl border border-transparent px-3 py-3 text-left transition",
  {
    variants: {
      state: {
        active: "border-primary/20 bg-primary/10",
        idle: "hover:border-border/70 hover:bg-accent/60",
      },
    },
    defaultVariants: {
      state: "idle",
    },
  },
);
export const sidebarTriggerVariants = cva(
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground transition hover:bg-accent hover:text-foreground",
);

export const SidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function SidebarProvider(
  {
  className,
  children,
},
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(sidebarProviderVariants(), className)}
    >
      {children}
    </div>
  );
});
SidebarProvider.displayName = "SidebarProvider";

export const Sidebar = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & { collapsed?: boolean }
>(({ className, children, collapsed = false, ...props }, ref) => {
  return (
    <aside
      ref={ref}
      data-collapsed={collapsed}
      className={cn(sidebarVariants(), className)}
      style={{ width: collapsed ? "var(--app-sidebar-width-collapsed)" : "var(--app-sidebar-width)" }}
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
  <div ref={ref} className={cn(sidebarInsetVariants(), className)} {...props} />
));
SidebarInset.displayName = "SidebarInset";

export const SidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn(sidebarHeaderVariants(), className)} {...props} />
));
SidebarHeader.displayName = "SidebarHeader";

export const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn(sidebarContentVariants(), className)} {...props} />
));
SidebarContent.displayName = "SidebarContent";

export const SidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn(sidebarFooterVariants(), className)} {...props} />
));
SidebarFooter.displayName = "SidebarFooter";

export const SidebarGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn(sidebarGroupVariants(), className)} {...props} />
));
SidebarGroup.displayName = "SidebarGroup";

export const SidebarGroupContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn(sidebarGroupContentVariants(), className)} {...props} />
));
SidebarGroupContent.displayName = "SidebarGroupContent";

export const SidebarGroupLabel = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(sidebarGroupLabelVariants(), className)}
    {...props}
  />
));
SidebarGroupLabel.displayName = "SidebarGroupLabel";

export const SidebarMenu = React.forwardRef<
  HTMLUListElement,
  React.HTMLAttributes<HTMLUListElement>
>(({ className, ...props }, ref) => (
  <ul ref={ref} className={cn(sidebarMenuVariants(), className)} {...props} />
));
SidebarMenu.displayName = "SidebarMenu";

export const SidebarMenuItem = React.forwardRef<
  HTMLLIElement,
  React.HTMLAttributes<HTMLLIElement>
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn(sidebarMenuItemVariants(), className)} {...props} />
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
      sidebarMenuButtonVariants({ state: isActive ? "active" : "idle" }),
      className,
    )}
    {...props}
  />
));
SidebarMenuButton.displayName = "SidebarMenuButton";

export const SidebarTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    collapsed?: boolean;
  }
>(function SidebarTrigger(
  {
  collapsed,
  className,
  "aria-label": ariaLabel,
  title,
  ...props
},
  ref,
) {
  const fallbackLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <button
      ref={ref}
      type="button"
      className={cn(sidebarTriggerVariants(), className)}
      aria-label={ariaLabel || fallbackLabel}
      title={title || fallbackLabel}
      {...props}
    >
      {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
    </button>
  );
});
SidebarTrigger.displayName = "SidebarTrigger";
